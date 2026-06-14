import path from 'node:path';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';

/**
 * Generates OpenClaw config and skills:
 *   <out>/skills/<id>/SKILL.md
 *   <out>/skills/<subagent-id>/SKILL.md (for each subagent)
 *   <out>/openclaw.json
 *
 * @param {import('../schema.js').SkillSpec} spec
 * @param {string} outDir
 */
export async function generateOpenclawPlugin(spec, outDir) {
  const generatedFiles = [];
  const skillsDir = path.join(outDir, 'skills');
  await fs.mkdir(skillsDir, { recursive: true });

  const logicType = spec.logicType || 'stub';
  let logicTypeInstructions = '';
  if (logicType === 'fetch') {
    logicTypeInstructions = '\n\nThis skill requires fetching data from an external HTTP API. Use curl or similar command line utilities to query resources on the network as needed.';
  } else if (logicType === 'fs') {
    logicTypeInstructions = '\n\nThis skill reads and writes local files to maintain and manage state. Use file access tools to check, modify, or create files within the workspace folder.';
  } else if (logicType === 'database') {
    logicTypeInstructions = '\n\nThis skill interacts with a local SQLite database at "database.db". Use the sqlite3 command-line utility to query or update data in this database.';
  }

  // 1. Generate main skill file
  const mainSkillDir = path.join(skillsDir, spec.id);
  await fs.mkdir(mainSkillDir, { recursive: true });
  const mainFrontmatter = yaml.dump({ description: spec.description }).trim();
  const mainSkillMd = `---
${mainFrontmatter}
---

${spec.instructions.trim()}${logicTypeInstructions}
`;
  const mainSkillPath = path.join(mainSkillDir, 'SKILL.md');
  await fs.writeFile(mainSkillPath, mainSkillMd, 'utf8');
  generatedFiles.push(path.relative(outDir, mainSkillPath));

  // 2. Generate subagent skill files
  const subagents = spec.subagents || [];
  for (const sa of subagents) {
    const saSkillDir = path.join(skillsDir, sa.id);
    await fs.mkdir(saSkillDir, { recursive: true });
    const saFrontmatter = yaml.dump({ description: sa.description }).trim();
    const saSkillMd = `---
${saFrontmatter}
---

${sa.instructions.trim()}
`;
    const saSkillPath = path.join(saSkillDir, 'SKILL.md');
    await fs.writeFile(saSkillPath, saSkillMd, 'utf8');
    generatedFiles.push(path.relative(outDir, saSkillPath));
  }

  // 3. Generate openclaw.json config snippet
  const openclawJson = {
    agents: {
      [spec.id]: {
        model: {
          primary: 'anthropic/claude-3-5-sonnet',
          fallback: 'openai/gpt-4o',
        },
        workspace: './workspace',
        tools: ['file', 'shell', 'browser'],
        skills: [spec.id, ...subagents.map((sa) => sa.id)],
      },
    },
  };

  // Add individual subagent profiles to the config
  for (const sa of subagents) {
    openclawJson.agents[sa.id] = {
      model: {
        primary: 'anthropic/claude-3-5-sonnet',
      },
      workspace: './workspace',
      tools: ['file'],
      skills: [sa.id],
    };
  }

  const configPath = path.join(outDir, 'openclaw.json');
  await fs.writeFile(configPath, JSON.stringify(openclawJson, null, 2) + '\n', 'utf8');
  generatedFiles.push(path.relative(outDir, configPath));

  return {
    files: generatedFiles,
    nextSteps: [
      'Copy the generated `skills/` folders to your OpenClaw skills directory (typically `~/.openclaw/skills/`).',
      'Merge the generated `openclaw.json` configuration into your global `~/.openclaw/openclaw.json` file.',
      `Run OpenClaw and target the agent using the ID "${spec.id}".`,
    ],
  };
}

