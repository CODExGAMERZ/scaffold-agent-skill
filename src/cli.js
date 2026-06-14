import path from 'node:path';
import fs from 'node:fs/promises';
import prompts from 'prompts';
import kleur from 'kleur';
import { generateClaudeCodePlugin } from './generators/claudeCode.js';
import { generateOpenAiAction } from './generators/openaiAction.js';
import { generateOpenclawPlugin } from './generators/openclaw.js';
import { generateGeminiAdkAgent } from './generators/geminiAdk.js';

const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

async function isDirectoryNotEmpty(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    return files.length > 0;
  } catch (err) {
    return false;
  }
}

async function writeGitignore(outDir) {
  const content = `# Logs
logs
*.log
npm-debug.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Dependency directories
node_modules/
jspm_packages/

# Virtual environments
.venv/
venv/
env/
ENV/

# OS files
.DS_Store
Thumbs.db
`;
  await fs.writeFile(path.join(outDir, '.gitignore'), content, 'utf8');
}

export async function run(argv = []) {
  console.log(kleur.bold('\nCreate Agent Skill\n'));
  console.log(
    'Answer a few questions and this will scaffold a ready-to-edit skill/plugin\nfor Claude Code, OpenAI Custom GPT Actions, OpenClaw, or Google ADK.\n'
  );

  const cliId = argv[0] && !argv[0].startsWith('-') ? argv[0] : undefined;

  const questions = [
    {
      type: 'text',
      name: 'id',
      message: 'Skill id (kebab-case, e.g. "check-stock"):',
      initial: cliId,
      validate: (value) => {
        if (!KEBAB_CASE_RE.test(value)) {
          return 'Use lowercase letters, numbers, and hyphens only (e.g. "check-stock").';
        }
        if (value.length > 64) {
          return 'Maximum length is 64 characters.';
        }
        return true;
      },
    },
    {
      type: 'text',
      name: 'nameForHuman',
      message: 'Human-readable name:',
      initial: (prev) => titleCase(prev),
      validate: (value) => value.trim().length > 0 || 'Required.',
    },
    {
      type: 'text',
      name: 'description',
      message: 'One-line description (what does it do?):',
      validate: (value) => {
        if (value.trim().length === 0) return 'Required.';
        if (value.length > 200) return 'Maximum length is 200 characters.';
        return true;
      },
    },
    {
      type: 'text',
      name: 'instructions',
      message: 'Instructions for the model (a sentence or two):',
      validate: (value) => {
        if (value.trim().length === 0) return 'Required.';
        if (value.length > 2000) return 'Maximum length is 2000 characters.';
        return true;
      },
    },
    {
      type: 'text',
      name: 'author',
      message: 'Author name (optional):',
    },
    {
      type: 'multiselect',
      name: 'interfaceTypes',
      message: 'Select target interface types:',
      choices: [
        { title: 'CLI Plugin (run in command line)', value: 'cli', selected: true },
        { title: 'Web App / Service API (run as a web service)', value: 'service', selected: true },
        { title: 'SDK / Developer Framework (run in code)', value: 'sdk', selected: true },
      ],
      min: 1,
      hint: '- Space to select, Enter to confirm',
    },
    {
      type: 'multiselect',
      name: 'platforms',
      message: 'Which platform(s) should this target?',
      choices: (prev, values) => {
        const list = [];
        if (values.interfaceTypes.includes('cli')) {
          list.push({ title: 'Claude Code plugin', value: 'claude-code', selected: true });
        }
        if (values.interfaceTypes.includes('service')) {
          list.push({ title: 'OpenAI Custom GPT Action', value: 'openai-action', selected: true });
          list.push({ title: 'OpenClaw Gateway Skill', value: 'openclaw', selected: true });
        }
        if (values.interfaceTypes.includes('sdk')) {
          list.push({ title: 'Google ADK / Gemini Agent', value: 'gemini-adk', selected: true });
        }
        return list;
      },
      min: 1,
      hint: '- Space to select, Enter to confirm',
    },
    {
      type: 'select',
      name: 'logicType',
      message: 'Select the backend logic template style:',
      choices: [
        { title: 'Simple Mock/Stub', value: 'stub' },
        { title: 'External API Client (fetches from an HTTP endpoint)', value: 'fetch' },
        { title: 'Local Filesystem (reads/writes files in a secure directory)', value: 'fs' },
        { title: 'SQLite Database Utility (runs SQL queries on a local DB)', value: 'database' },
      ],
      initial: 0,
    },
    {
      type: 'confirm',
      name: 'hasSubagents',
      message: 'Do you want to define subagents for delegation?',
      initial: false,
    },
    {
      type: 'text',
      name: 'outDir',
      message: 'Output directory:',
      initial: (prev, values) => values.id,
      validate: (value) => {
        if (!value || value.trim().length === 0) return 'Required.';
        const resolved = path.resolve(process.cwd(), value);
        const relative = path.relative(process.cwd(), resolved);
        if (relative.startsWith('..') || path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
          return 'Path traversal detected. Output directory must be within the current working directory.';
        }
        return true;
      },
    },
  ];

  try {
    const spec = await prompts(questions, {
      onCancel: () => {
        throw new CancelledError();
      },
    });

    spec.subagents = [];
    if (spec.hasSubagents) {
      console.log(kleur.bold('\n--- Subagents Configuration ---\n'));
      let addMore = true;
      const seenIds = new Set([spec.id]);
      while (addMore) {
        if (spec.subagents.length >= 20) {
          console.log(kleur.yellow('\nMaximum cap of 20 subagents reached.'));
          break;
        }
        const subagentQuestions = [
          {
            type: 'text',
            name: 'id',
            message: 'Subagent id (kebab-case, e.g. "coder-agent"):',
            validate: (value) => {
              if (!KEBAB_CASE_RE.test(value)) {
                return 'Use lowercase letters, numbers, and hyphens only.';
              }
              if (value.length > 64) {
                return 'Maximum length is 64 characters.';
              }
              if (seenIds.has(value)) {
                if (value === spec.id) {
                  return 'Subagent ID cannot be the same as the main skill ID.';
                }
                return 'Subagent ID must be unique (this ID is already in use).';
              }
              return true;
            },
          },
          {
            type: 'text',
            name: 'nameForHuman',
            message: 'Human-readable name:',
            initial: (prev) => titleCase(prev),
            validate: (value) => value.trim().length > 0 || 'Required.',
          },
          {
            type: 'text',
            name: 'description',
            message: 'One-line description:',
            validate: (value) => {
              if (value.trim().length === 0) return 'Required.';
              if (value.length > 200) return 'Maximum length is 200 characters.';
              return true;
            },
          },
          {
            type: 'text',
            name: 'instructions',
            message: 'Instructions / system prompt for this subagent:',
            validate: (value) => {
              if (value.trim().length === 0) return 'Required.';
              if (value.length > 2000) return 'Maximum length is 2000 characters.';
              return true;
            },
          },
          {
            type: 'confirm',
            name: 'addMore',
            message: 'Add another subagent?',
            initial: false,
          },
        ];
        const subagentSpec = await prompts(subagentQuestions, {
          onCancel: () => {
            throw new CancelledError();
          },
        });
        addMore = subagentSpec.addMore;
        delete subagentSpec.addMore;
        seenIds.add(subagentSpec.id);
        spec.subagents.push(subagentSpec);
      }
    }

    const outDir = path.resolve(process.cwd(), spec.outDir);

    if (await isDirectoryNotEmpty(outDir)) {
      const confirmOverwrite = await prompts({
        type: 'confirm',
        name: 'overwrite',
        message: `The output directory "${spec.outDir}" is not empty. Overwrite existing files?`,
        initial: false,
      }, {
        onCancel: () => {
          throw new CancelledError();
        }
      });

      if (!confirmOverwrite.overwrite) {
        console.log(kleur.yellow('\nAborted to prevent overwriting existing files.'));
        return;
      }
    }

    await fs.mkdir(outDir, { recursive: true });

    const summaryFiles = [];
    const summarySteps = [];
    const successfulPlatforms = [];
    const failedPlatforms = [];

    if (spec.platforms.includes('claude-code')) {
      try {
        const result = await generateClaudeCodePlugin(spec, outDir);
        summaryFiles.push(...result.files);
        summarySteps.push(...result.nextSteps);
        successfulPlatforms.push('claude-code');
      } catch (err) {
        console.error(kleur.red(`Error generating Claude Code plugin: ${err.message}`));
        failedPlatforms.push({ platform: 'claude-code', error: err.message });
      }
    }

    if (spec.platforms.includes('openai-action')) {
      try {
        const result = await generateOpenAiAction(spec, outDir);
        summaryFiles.push(...result.files);
        summarySteps.push(...result.nextSteps);
        successfulPlatforms.push('openai-action');
      } catch (err) {
        console.error(kleur.red(`Error generating OpenAI Custom GPT Action: ${err.message}`));
        failedPlatforms.push({ platform: 'openai-action', error: err.message });
      }
    }

    if (spec.platforms.includes('openclaw')) {
      try {
        const result = await generateOpenclawPlugin(spec, outDir);
        summaryFiles.push(...result.files);
        summarySteps.push(...result.nextSteps);
        successfulPlatforms.push('openclaw');
      } catch (err) {
        console.error(kleur.red(`Error generating OpenClaw Gateway Skill: ${err.message}`));
        failedPlatforms.push({ platform: 'openclaw', error: err.message });
      }
    }

    if (spec.platforms.includes('gemini-adk')) {
      try {
        const result = await generateGeminiAdkAgent(spec, outDir);
        summaryFiles.push(...result.files);
        summarySteps.push(...result.nextSteps);
        successfulPlatforms.push('gemini-adk');
      } catch (err) {
        console.error(kleur.red(`Error generating Google ADK / Gemini Agent: ${err.message}`));
        failedPlatforms.push({ platform: 'gemini-adk', error: err.message });
      }
    }

    if (failedPlatforms.length > 0 && successfulPlatforms.length === 0) {
      throw new Error('All platform generators failed.');
    }

    await writeTopLevelReadme(spec, outDir);
    summaryFiles.push('README.md');

    await writeGitignore(outDir);
    summaryFiles.push('.gitignore');

    console.log(kleur.green(`\nDone! Created ${path.relative(process.cwd(), outDir).replace(/\\/g, '/') || '.'}/`));
    console.log('\nFiles:');
    for (const f of summaryFiles) {
      console.log(`  ${kleur.cyan(f.replace(/\\/g, '/'))}`);
    }

    console.log('\nNext steps:');
    for (const step of summarySteps) {
      console.log(`  - ${step}`);
    }
    console.log('');

    if (failedPlatforms.length > 0) {
      console.log(kleur.yellow(`Warning: Some platforms failed to generate:`));
      for (const fp of failedPlatforms) {
        console.log(`  - ${kleur.bold(fp.platform)}: ${fp.error}`);
      }
      console.log('');
    }
  } catch (err) {
    if (err instanceof CancelledError || err.name === 'CancelledError') {
      console.log(kleur.yellow('\nCancelled.'));
      return;
    }
    throw err;
  }
}

function titleCase(id = '') {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function writeTopLevelReadme(spec, outDir) {
  const lines = [
    `# ${spec.nameForHuman}`,
    '',
    spec.description,
    '',
    '## Contents',
    '',
  ];

  if (spec.platforms.includes('claude-code')) {
    lines.push(
      '- `.claude-plugin/plugin.json` + `skills/' + spec.id + '/SKILL.md` — Claude Code plugin.',
      '  Test with `claude --plugin-dir .` from this directory, then try `/' + spec.id + '`.'
    );
  }

  if (spec.platforms.includes('openai-action')) {
    lines.push(
      '- `openapi.yaml` + `server/` — Express stub and OpenAPI spec for an OpenAI Custom GPT Action.',
      '  Run `cd server && npm install && npm start`, deploy it somewhere with HTTPS, then paste',
      '  `openapi.yaml` into the GPT builder under Configure > Actions.'
    );
  }

  if (spec.platforms.includes('openclaw')) {
    lines.push(
      '- `skills/` + `openclaw.json` — OpenClaw gateway configuration and skills.',
      '  Copy the folders under `skills/` to your OpenClaw skills path and merge `openclaw.json` into your primary config.'
    );
  }

  if (spec.platforms.includes('gemini-adk')) {
    lines.push(
      '- `agent.py` + `requirements.txt` — Google ADK / Gemini Agent definition.',
      '  Run `pip install -r requirements.txt` and execute with `python agent.py "query"`.'
    );
  }

  if (spec.subagents && spec.subagents.length > 0) {
    lines.push(
      '',
      '### Subagents',
      '',
      'This scaffold includes ' + spec.subagents.length + ' subagent(s) for task delegation:'
    );
    for (const sa of spec.subagents) {
      lines.push(`- **${sa.nameForHuman}** (${sa.id}): ${sa.description}`);
    }
  }

  lines.push('', '## Generated by', '', '`scaffold-agent-skill` — edit everything above freely, this is just a starting point.', '');

  await fs.writeFile(path.join(outDir, 'README.md'), lines.join('\n'), 'utf8');
}

