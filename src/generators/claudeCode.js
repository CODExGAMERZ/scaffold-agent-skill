import path from 'node:path';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';

/**
 * Generates a Claude Code plugin:
 *   <out>/.claude-plugin/plugin.json
 *   <out>/skills/<id>/SKILL.md
 *   <out>/README.md (only if not already created by another generator)
 *
 * @param {import('../schema.js').SkillSpec} spec
 * @param {string} outDir
 */
export async function generateClaudeCodePlugin(spec, outDir) {
  const pluginDir = path.join(outDir, '.claude-plugin');
  const skillDir = path.join(outDir, 'skills', spec.id);

  await fs.mkdir(pluginDir, { recursive: true });
  await fs.mkdir(skillDir, { recursive: true });

  const pluginJson = {
    name: spec.id,
    version: '0.1.0',
    description: spec.description,
    author: spec.author ? { name: spec.author } : undefined,
  };

  await fs.writeFile(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify(pluginJson, null, 2) + '\n',
    'utf8'
  );

  const logicType = spec.logicType || 'stub';
  let logicTypeInstructions = '';
  if (logicType === 'fetch') {
    logicTypeInstructions = '\n\nThis skill requires fetching data from an external HTTP API. Use curl or similar command line utilities to query resources on the network as needed.';
  } else if (logicType === 'fs') {
    logicTypeInstructions = '\n\nThis skill reads and writes local files to maintain and manage state. Use file access tools to check, modify, or create files within the workspace folder.';
  } else if (logicType === 'database') {
    logicTypeInstructions = '\n\nThis skill interacts with a local SQLite database at "database.db". Use the sqlite3 command-line utility to query or update data in this database.';
  }

  const mainFrontmatter = yaml.dump({ description: spec.description }).trim();
  const skillMd = `---
${mainFrontmatter}
---

${spec.instructions.trim()}${logicTypeInstructions}

When the user provides additional details after the skill name, they are available as "$ARGUMENTS".
`;

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf8');

  const files = [
    path.relative(outDir, path.join(pluginDir, 'plugin.json')),
    path.relative(outDir, path.join(skillDir, 'SKILL.md')),
  ];

  const subagents = spec.subagents || [];
  if (subagents.length > 0) {
    const agentsDir = path.join(outDir, 'agents');
    await fs.mkdir(agentsDir, { recursive: true });

    for (const sa of subagents) {
      const saFrontmatter = yaml.dump({ description: sa.description }).trim();
      const saMd = `---
${saFrontmatter}
---

${sa.instructions.trim()}
`;
      const saPath = path.join(agentsDir, `${sa.id}.md`);
      await fs.writeFile(saPath, saMd, 'utf8');
      files.push(path.relative(outDir, saPath));
    }
  }

  return {
    files,
    nextSteps: [
      `Test locally with: claude --plugin-dir ${path.relative(process.cwd(), outDir).replace(/\\/g, '/') || '.'}`,
      `Try the skill in Claude Code with: /${spec.id}`,
      'To share it, add this directory to a plugin marketplace (.claude-plugin/marketplace.json) and have users run /plugin install.',
    ],
  };
}

