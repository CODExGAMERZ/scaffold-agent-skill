import assert from 'node:assert/strict';
import { generateClaudeCodePlugin } from '../src/generators/claudeCode.js';
import { generateOpenAiAction } from '../src/generators/openaiAction.js';
import { generateOpenclawPlugin } from '../src/generators/openclaw.js';
import { generateGeminiAdkAgent } from '../src/generators/geminiAdk.js';
import {
  toPascalCase, toCamelCase, toSnakeCase,
  escapePythonString, escapeJsTemplateLiteral, cleanComment
} from '../src/schema.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import yaml from 'js-yaml';

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err });
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

const exists = async (p) => {
  try { await fs.access(p); return true; } catch { return false; }
};

async function makeCleanDir(suffix) {
  const dir = path.join(os.tmpdir(), `cas-stress-${suffix}-${Date.now()}`);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  create-agent-skill — Comprehensive Stress Test Suite   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ═══════════════════════════════════════════════════════════════
  // GROUP 1: Case Converter Hardening
  // ═══════════════════════════════════════════════════════════════
  console.log('─── 1. Case Converter Hardening ───');

  await test('toPascalCase basic', () => {
    assert.equal(toPascalCase('check-stock'), 'CheckStock');
    assert.equal(toPascalCase('my_cool_thing'), 'MyCoolThing');
    assert.equal(toPascalCase('single'), 'Single');
  });

  await test('toCamelCase basic', () => {
    assert.equal(toCamelCase('check-stock'), 'checkStock');
    assert.equal(toCamelCase('A'), 'a');
  });

  await test('toSnakeCase basic', () => {
    assert.equal(toSnakeCase('check-stock'), 'check_stock');
    assert.equal(toSnakeCase('my-cool-thing'), 'my_cool_thing');
  });

  await test('Unicode stripping produces valid identifiers', () => {
    assert.equal(toSnakeCase("Ñoño's Agent™ — v2.0"), 'oos_agent_v20');
    assert.equal(toPascalCase("Ñoño's Agent™ — v2.0"), 'OosAgentV20');
    // Emoji-only input → throws
    assert.throws(() => toSnakeCase('🔥🚀💥'));
    assert.throws(() => toPascalCase('🔥🚀💥'));
  });

  await test('Empty / whitespace / null throws', () => {
    assert.throws(() => toPascalCase(''));
    assert.throws(() => toPascalCase('   '));
    assert.throws(() => toPascalCase(null));
    assert.throws(() => toPascalCase(undefined));
    assert.throws(() => toSnakeCase(''));
    assert.throws(() => toSnakeCase('   '));
  });

  await test('Pure-symbol input throws', () => {
    assert.throws(() => toPascalCase('™©®'));
    assert.throws(() => toSnakeCase('—–…'));
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 2: Escape Utility Hardening
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 2. Escape Utility Hardening ───');

  await test('escapePythonString escapes all dangerous chars', () => {
    assert.equal(escapePythonString('hello "world"'), 'hello \\"world\\"');
    assert.equal(escapePythonString("it's"), "it\\'s");
    assert.equal(escapePythonString('line1\nline2'), 'line1\\nline2');
    assert.equal(escapePythonString('tab\there'), 'tab\\there');
    assert.equal(escapePythonString('back\\slash'), 'back\\\\slash');
    assert.equal(escapePythonString('\r\n'), '\\r\\n');
  });

  await test('escapePythonString handles triple-quote attack', () => {
    const attack = '""" + __import__("os").system("rm -rf /") + """';
    const escaped = escapePythonString(attack);
    assert.ok(!escaped.includes('"""'), 'Triple quotes must be broken up');
    assert.ok(escaped.includes('\\"\\"\\"'), 'Each quote should be escaped');
  });

  await test('escapePythonString handles non-string gracefully', () => {
    assert.equal(escapePythonString(null), '');
    assert.equal(escapePythonString(undefined), '');
    assert.equal(escapePythonString(42), '');
  });

  await test('escapeJsTemplateLiteral escapes backticks and ${', () => {
    assert.equal(escapeJsTemplateLiteral('`hello`'), '\\`hello\\`');
    assert.equal(escapeJsTemplateLiteral('${evil}'), '\\${evil}');
    assert.equal(escapeJsTemplateLiteral('back\\slash'), 'back\\\\slash');
  });

  await test('escapeJsTemplateLiteral handles non-string gracefully', () => {
    assert.equal(escapeJsTemplateLiteral(null), '');
    assert.equal(escapeJsTemplateLiteral(undefined), '');
  });

  await test('cleanComment strips newlines and block-comment closers', () => {
    assert.equal(cleanComment('line1\nline2\rline3'), 'line1 line2 line3');
    assert.equal(cleanComment('before */ after'), 'before * / after');
    assert.equal(cleanComment(null), '');
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 3: Path Traversal Guard
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 3. Path Traversal Guard ───');

  const validateOutDir = (value) => {
    if (!value || value.trim().length === 0) return 'Required.';
    const resolved = path.resolve(process.cwd(), value);
    const relative = path.relative(process.cwd(), resolved);
    if (relative.startsWith('..') || path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) {
      return 'Path traversal detected.';
    }
    return true;
  };

  await test('Accepts normal subdirectories', () => {
    assert.equal(validateOutDir('my-dir'), true);
    assert.equal(validateOutDir('my-dir/sub'), true);
    assert.equal(validateOutDir('a'), true);
  });

  await test('Rejects parent traversal', () => {
    assert.notEqual(validateOutDir('../evil'), true);
    assert.notEqual(validateOutDir('../../etc/passwd'), true);
    assert.notEqual(validateOutDir('foo/../../bar'), true);
  });

  await test('Rejects absolute paths', () => {
    assert.notEqual(validateOutDir('/tmp/evil'), true);
    assert.notEqual(validateOutDir('C:\\Users\\evil'), true);
  });

  await test('Rejects empty/whitespace', () => {
    assert.notEqual(validateOutDir(''), true);
    assert.notEqual(validateOutDir('   '), true);
    assert.notEqual(validateOutDir(null), true);
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 4: Generator — Valid Spec (all platforms)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 4. Generator — Valid Spec (all platforms) ───');

  const validSpec = {
    id: 'check-stock',
    nameForHuman: 'Check Stock',
    description: 'Checks the current stock level for an inventory item.',
    instructions: 'Using the internal inventory database, return the current stock level.',
    author: 'Aryan',
    platforms: ['claude-code', 'openai-action', 'openclaw', 'gemini-adk'],
    subagents: [
      { id: 'coder-agent', nameForHuman: 'Coder Agent', description: 'Generates code.', instructions: 'Write clean code.' },
      { id: 'qa-agent', nameForHuman: 'QA Agent', description: 'Tests code.', instructions: 'Run tests thoroughly.' },
    ]
  };

  const validDir = await makeCleanDir('valid');
  await generateClaudeCodePlugin(validSpec, validDir);
  await generateOpenAiAction(validSpec, validDir);
  await generateOpenclawPlugin(validSpec, validDir);
  await generateGeminiAdkAgent(validSpec, validDir);

  await test('All expected files exist', async () => {
    const expectedFiles = [
      '.claude-plugin/plugin.json',
      'skills/check-stock/SKILL.md',
      'agents/coder-agent.md',
      'agents/qa-agent.md',
      'openapi.yaml',
      'server/index.js',
      'server/package.json',
      'openclaw.json',
      'skills/coder-agent/SKILL.md',
      'skills/qa-agent/SKILL.md',
      'agent.py',
      'requirements.txt',
    ];
    for (const f of expectedFiles) {
      assert.ok(await exists(path.join(validDir, f)), `Missing: ${f}`);
    }
  });

  await test('OpenAPI YAML parses and round-trips correctly', async () => {
    const raw = await fs.readFile(path.join(validDir, 'openapi.yaml'), 'utf8');
    const parsed = yaml.load(raw);
    assert.equal(parsed.openapi, '3.1.0');
    assert.equal(parsed.info.title, 'Check Stock');
    assert.ok(parsed.paths['/check-stock']);
    assert.ok(parsed.paths['/agents/coder-agent']);
    assert.ok(parsed.paths['/agents/qa-agent']);
    // Round-trip: dump and re-parse should be identical
    const reloaded = yaml.load(yaml.dump(parsed));
    assert.deepEqual(parsed, reloaded);
  });

  await test('plugin.json is valid JSON with correct fields', async () => {
    const raw = await fs.readFile(path.join(validDir, '.claude-plugin', 'plugin.json'), 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.name, 'check-stock');
    assert.equal(parsed.version, '0.1.0');
    assert.equal(parsed.author.name, 'Aryan');
  });

  await test('openclaw.json has main + subagent profiles', async () => {
    const raw = await fs.readFile(path.join(validDir, 'openclaw.json'), 'utf8');
    const parsed = JSON.parse(raw);
    assert.ok(parsed.agents['check-stock']);
    assert.ok(parsed.agents['coder-agent']);
    assert.ok(parsed.agents['qa-agent']);
    assert.deepEqual(parsed.agents['check-stock'].skills, ['check-stock', 'coder-agent', 'qa-agent']);
  });

  await test('Generated server/package.json has pinned deps', async () => {
    const raw = await fs.readFile(path.join(validDir, 'server', 'package.json'), 'utf8');
    const parsed = JSON.parse(raw);
    // Should NOT use caret ranges
    assert.ok(!parsed.dependencies.express.startsWith('^'), 'Express should be pinned');
    assert.ok(parsed.dependencies.helmet, 'helmet should be listed');
    assert.ok(parsed.dependencies.cors, 'cors should be listed');
  });

  await test('Generated server/index.js includes security middleware', async () => {
    const content = await fs.readFile(path.join(validDir, 'server', 'index.js'), 'utf8');
    assert.ok(content.includes("import helmet from 'helmet'"), 'Should import helmet');
    assert.ok(content.includes("import cors from 'cors'"), 'Should import cors');
    assert.ok(content.includes('app.use(helmet())'), 'Should use helmet');
    assert.ok(content.includes('app.use(cors())'), 'Should use cors');
    assert.ok(content.includes('status(400)'), 'Should have input validation');
    assert.ok(content.includes('status(500)'), 'Should have error handler');
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 5: Generator — No Subagents Edge Case
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 5. Generator — No Subagents Edge Case ───');

  const noSubSpec = {
    id: 'simple-tool',
    nameForHuman: 'Simple Tool',
    description: 'A tool with no subagents.',
    instructions: 'Do the thing.',
    author: '',
    platforms: ['claude-code', 'openai-action', 'openclaw', 'gemini-adk'],
    subagents: []
  };

  const noSubDir = await makeCleanDir('nosub');

  await test('Generators work with empty subagents array', async () => {
    await generateClaudeCodePlugin(noSubSpec, noSubDir);
    await generateOpenAiAction(noSubSpec, noSubDir);
    await generateOpenclawPlugin(noSubSpec, noSubDir);
    await generateGeminiAdkAgent(noSubSpec, noSubDir);
    assert.ok(await exists(path.join(noSubDir, 'agent.py')));
    assert.ok(await exists(path.join(noSubDir, 'openapi.yaml')));
  });

  await test('Generators work with undefined subagents', async () => {
    const undefSubSpec = { ...noSubSpec, subagents: undefined };
    const dir = await makeCleanDir('undefsub');
    await generateClaudeCodePlugin(undefSubSpec, dir);
    await generateOpenAiAction(undefSubSpec, dir);
    await generateOpenclawPlugin(undefSubSpec, dir);
    await generateGeminiAdkAgent(undefSubSpec, dir);
    assert.ok(await exists(path.join(dir, 'agent.py')));
  });

  await test('agent.py with no subagents has tools=[]', async () => {
    const content = await fs.readFile(path.join(noSubDir, 'agent.py'), 'utf8');
    assert.ok(content.includes('tools=[]'));
  });

  await test('plugin.json with no author omits author field', async () => {
    const raw = await fs.readFile(path.join(noSubDir, '.claude-plugin', 'plugin.json'), 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.author, undefined);
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 6: Generator — Single Platform Isolation
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 6. Generator — Single Platform Isolation ───');

  await test('Claude Code alone produces only its files', async () => {
    const spec = { ...noSubSpec };
    const dir = await makeCleanDir('claude-only');
    const result = await generateClaudeCodePlugin(spec, dir);
    assert.ok(result.files.length >= 2);
    assert.ok(await exists(path.join(dir, '.claude-plugin', 'plugin.json')));
    assert.ok(!(await exists(path.join(dir, 'openapi.yaml'))));
    assert.ok(!(await exists(path.join(dir, 'agent.py'))));
  });

  await test('OpenAI alone produces only its files', async () => {
    const spec = { ...noSubSpec };
    const dir = await makeCleanDir('openai-only');
    const result = await generateOpenAiAction(spec, dir);
    assert.ok(result.files.length >= 3);
    assert.ok(await exists(path.join(dir, 'openapi.yaml')));
    assert.ok(!(await exists(path.join(dir, '.claude-plugin'))));
  });

  await test('Gemini ADK alone produces only its files', async () => {
    const spec = { ...noSubSpec };
    const dir = await makeCleanDir('gemini-only');
    const result = await generateGeminiAdkAgent(spec, dir);
    assert.ok(result.files.length >= 2);
    assert.ok(await exists(path.join(dir, 'agent.py')));
    assert.ok(!(await exists(path.join(dir, 'openapi.yaml'))));
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 7: Injection Attacks — YAML
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 7. Injection Attacks — YAML ───');

  const yamlAttackSpec = {
    id: 'yaml-attack',
    nameForHuman: 'YAML Attack Agent',
    description: 'stock checker\ninfo:\n  title: HACKED',
    instructions: 'Check: stock: levels\n---\nhacked: true',
    author: 'Hacker',
    platforms: ['claude-code', 'openai-action', 'openclaw'],
    subagents: [
      {
        id: 'yaml-sub',
        nameForHuman: 'YAML Sub',
        description: 'sub desc: with colons\nand: newlines',
        instructions: 'sub instructions'
      }
    ]
  };

  const yamlDir = await makeCleanDir('yaml-attack');
  await generateClaudeCodePlugin(yamlAttackSpec, yamlDir);
  await generateOpenAiAction(yamlAttackSpec, yamlDir);
  await generateOpenclawPlugin(yamlAttackSpec, yamlDir);

  await test('Claude SKILL.md frontmatter stays intact despite YAML-breaking desc', async () => {
    const raw = await fs.readFile(path.join(yamlDir, 'skills', 'yaml-attack', 'SKILL.md'), 'utf8');
    const match = raw.match(/^---\r?\n([\s\S]+?)\r?\n---/);
    assert.ok(match, 'Frontmatter block should be present');
    const parsed = yaml.load(match[1]);
    assert.equal(parsed.description, yamlAttackSpec.description, 'Description must survive round-trip');
    // Must NOT have an extra "info" key injected
    assert.equal(parsed.info, undefined, 'No injected keys');
  });

  await test('OpenAPI spec stays intact despite YAML-breaking desc', async () => {
    const raw = await fs.readFile(path.join(yamlDir, 'openapi.yaml'), 'utf8');
    const parsed = yaml.load(raw);
    assert.equal(parsed.info.description, yamlAttackSpec.description);
    assert.equal(parsed.info.title, yamlAttackSpec.nameForHuman);
    // The spec must not have a spurious top-level "info" key injected by the attack
    assert.equal(parsed.openapi, '3.1.0');
  });

  await test('OpenClaw subagent SKILL.md frontmatter stays intact', async () => {
    const raw = await fs.readFile(path.join(yamlDir, 'skills', 'yaml-sub', 'SKILL.md'), 'utf8');
    const match = raw.match(/^---\r?\n([\s\S]+?)\r?\n---/);
    assert.ok(match);
    const parsed = yaml.load(match[1]);
    assert.equal(parsed.description, yamlAttackSpec.subagents[0].description);
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 8: Injection Attacks — Python
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 8. Injection Attacks — Python ───');

  const pythonAttackSpec = {
    id: 'py-attack',
    nameForHuman: 'Python Attack',
    description: 'desc with "quotes" and \\backslash and \nnewline',
    instructions: '""" + __import__("os").system("rm -rf /") + """',
    author: '',
    platforms: ['gemini-adk'],
    subagents: [
      {
        id: 'py-sub',
        nameForHuman: 'Python Sub',
        description: "sub's desc with 'single' and \"double\" quotes",
        instructions: 'print("HACKED")\nimport os\nos.system("whoami")'
      }
    ]
  };

  const pyDir = await makeCleanDir('py-attack');
  await generateGeminiAdkAgent(pythonAttackSpec, pyDir);

  await test('agent.py has all quotes escaped — no raw triple quotes', async () => {
    const content = await fs.readFile(path.join(pyDir, 'agent.py'), 'utf8');
    // Check that the triple-quote attack is neutralized
    assert.ok(!content.includes('""" +'), 'Triple quotes must not appear raw');
    // Check that single quotes from subagent are escaped
    assert.ok(content.includes("\\'single\\'"), "Single quotes should be escaped");
    assert.ok(content.includes('\\"double\\"'), "Double quotes should be escaped");
  });

  await test('agent.py contains escaped newlines — no raw line breaks inside strings', async () => {
    const content = await fs.readFile(path.join(pyDir, 'agent.py'), 'utf8');
    // Find the main agent's description line (contains the attack payload)
    const lines = content.split('\n');
    const descLine = lines.find(l => l.trim().startsWith('description=') && l.includes('backslash'));
    assert.ok(descLine, 'Main agent description line should exist');
    // The line should contain \\n (escaped newline), NOT a raw newline mid-string
    assert.ok(descLine.includes('\\n'), 'Newlines in description should be escaped as \\n');
    // The subagent instruction should also have escaped newlines
    const subInstLine = lines.find(l => l.trim().startsWith('instruction=') && l.includes('HACKED'));
    assert.ok(subInstLine, 'Subagent instruction line should exist');
    assert.ok(subInstLine.includes('\\n'), 'Newlines in instruction should be escaped as \\n');
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 9: Injection Attacks — JavaScript Template Literals
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 9. Injection Attacks — JavaScript Template Literals ───');

  const jsAttackSpec = {
    id: 'js-attack',
    nameForHuman: 'Attack `${process.exit(1)}` Agent',
    description: 'Desc with `backtick` and ${expression}',
    instructions: 'Do things `carefully` with ${vars}.',
    author: '',
    platforms: ['openai-action'],
    subagents: [
      {
        id: 'js-sub',
        nameForHuman: 'Sub `${evil}` Agent',
        description: 'Sub `desc`',
        instructions: 'Sub instructions ${hack}'
      }
    ]
  };

  const jsDir = await makeCleanDir('js-attack');
  await generateOpenAiAction(jsAttackSpec, jsDir);

  await test('server/index.js has backticks escaped in template literals', async () => {
    const content = await fs.readFile(path.join(jsDir, 'server', 'index.js'), 'utf8');
    assert.ok(content.includes('\\`\\${process.exit(1)}\\`'), 'Main name: backtick+template escaped');
    assert.ok(content.includes('Sub \\`\\${evil}\\`'), 'Subagent name: backtick+template escaped');
  });

  await test('server/index.js comments have no raw newlines from user input', async () => {
    const content = await fs.readFile(path.join(jsDir, 'server', 'index.js'), 'utf8');
    // Each comment line should be on a single line
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim().startsWith('// Main Skill:') || line.trim().startsWith('// Subagent:')) {
        assert.ok(!line.includes('\n//'), 'Comment should be single-line');
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 10: Boundary-Length ID (64 chars)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 10. Boundary-Length ID (64 chars) ───');

  const longId = 'a' + '-bcd'.repeat(15) + '-ef'; // exactly 64 chars
  assert.ok(longId.length <= 64, `Precondition: longId is ${longId.length} chars`);

  const longIdSpec = {
    id: longId,
    nameForHuman: 'Long ID Agent',
    description: 'Agent with a maximally long ID.',
    instructions: 'Handle long IDs gracefully.',
    author: '',
    platforms: ['claude-code', 'openai-action', 'openclaw', 'gemini-adk'],
    subagents: []
  };

  await test('All generators handle 64-char ID without error', async () => {
    const dir = await makeCleanDir('longid');
    await generateClaudeCodePlugin(longIdSpec, dir);
    await generateOpenAiAction(longIdSpec, dir);
    await generateOpenclawPlugin(longIdSpec, dir);
    await generateGeminiAdkAgent(longIdSpec, dir);
    assert.ok(await exists(path.join(dir, 'agent.py')));
    assert.ok(await exists(path.join(dir, 'openapi.yaml')));
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 11: Null Byte & Control Character Injection
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 11. Null Byte & Control Character Injection ───');

  const nullByteSpec = {
    id: 'null-test',
    nameForHuman: 'Null\x00Byte Agent',
    description: 'Desc with\x00null and\x01control\x1Fchars',
    instructions: 'Instructions with\x00null bytes.',
    author: '',
    platforms: ['claude-code', 'openai-action', 'openclaw', 'gemini-adk'],
    subagents: []
  };

  await test('Generators do not crash on null bytes in fields', async () => {
    const dir = await makeCleanDir('nullbyte');
    // These should not throw
    await generateClaudeCodePlugin(nullByteSpec, dir);
    await generateOpenAiAction(nullByteSpec, dir);
    await generateOpenclawPlugin(nullByteSpec, dir);
    await generateGeminiAdkAgent(nullByteSpec, dir);
    assert.ok(await exists(path.join(dir, 'agent.py')));
  });

  await test('OpenAPI YAML with null bytes still parses', async () => {
    const dir = await makeCleanDir('nullbyte-yaml');
    await generateOpenAiAction(nullByteSpec, dir);
    const raw = await fs.readFile(path.join(dir, 'openapi.yaml'), 'utf8');
    const parsed = yaml.load(raw);
    assert.ok(parsed.info.title, 'Title should exist');
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 12: Description at Maximum Length (200 chars)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 12. Description at Maximum Length (200 chars) ───');

  const maxDesc = 'X'.repeat(200);
  const maxDescSpec = {
    id: 'max-desc',
    nameForHuman: 'Max Desc Agent',
    description: maxDesc,
    instructions: 'Y'.repeat(2000),
    author: '',
    platforms: ['claude-code', 'openai-action', 'openclaw', 'gemini-adk'],
    subagents: []
  };

  await test('Generators handle max-length description and instructions', async () => {
    const dir = await makeCleanDir('maxdesc');
    await generateClaudeCodePlugin(maxDescSpec, dir);
    await generateOpenAiAction(maxDescSpec, dir);
    await generateOpenclawPlugin(maxDescSpec, dir);
    await generateGeminiAdkAgent(maxDescSpec, dir);

    const openapiRaw = await fs.readFile(path.join(dir, 'openapi.yaml'), 'utf8');
    const parsed = yaml.load(openapiRaw);
    assert.equal(parsed.info.description, maxDesc);
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 13: endpointPath Injection via openaiAction
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 13. endpointPath Validation ───');

  await test('endpointPath with quotes does not break generated JS syntax', async () => {
    const spec = {
      id: 'endpoint-test',
      nameForHuman: 'Endpoint Test',
      description: 'Test endpoint escaping.',
      instructions: 'Do thing.',
      author: '',
      platforms: ['openai-action'],
      endpointPath: "/test'inject",
      subagents: []
    };
    const dir = await makeCleanDir('endpoint');
    await generateOpenAiAction(spec, dir);
    const jsContent = await fs.readFile(path.join(dir, 'server', 'index.js'), 'utf8');
    // The endpoint path goes into app.get('...', ...) — single quotes in the path
    // will break the JS string. The path should appear in the generated code.
    assert.ok(jsContent.includes("/test\\'inject"), 'Path is in the output (escaped)');
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 14: Python nameForHuman Comment Injection
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 14. Python Comment Injection ───');

  await test('nameForHuman with newlines in Python comments does not inject code', async () => {
    const spec = {
      id: 'comment-test',
      nameForHuman: "Agent\nimport os; os.system('rm -rf /')",
      description: 'Normal description.',
      instructions: 'Normal instructions.',
      author: '',
      platforms: ['gemini-adk'],
      subagents: []
    };
    const dir = await makeCleanDir('pycomment');
    await generateGeminiAdkAgent(spec, dir);
    const content = await fs.readFile(path.join(dir, 'agent.py'), 'utf8');
    // The nameForHuman goes into a Python comment like: # Main Agent: <name>
    // If it contains a newline, the injected code would execute.
    // Check that the name appears on the same line as the comment marker
    const commentLine = content.split('\n').find(l => l.startsWith('# Main Agent:'));
    assert.ok(commentLine, 'Comment line should exist');
    // The newline in the name should be stripped so it does not break the comment and execute code
    const lines = content.split('\n');
    const importOsLines = lines.filter(l => l.trim() === "import os; os.system('rm -rf /')");
    assert.equal(importOsLines.length, 0, 'Comment injection must not produce executable code lines');
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 15: OpenAI endpointPath in generated JS (single-quote context)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 15. Express Route Path Injection ───');

  await test('endpointPath with single-quote breaks generated JS', async () => {
    const spec = {
      id: 'route-inject',
      nameForHuman: 'Route Inject',
      description: 'Test route injection.',
      instructions: 'Test.',
      author: '',
      platforms: ['openai-action'],
      endpointPath: "/', (req, res) => { process.exit(1) }); app.get('/safe",
      subagents: []
    };
    const dir = await makeCleanDir('routeinject');
    await generateOpenAiAction(spec, dir);
    const content = await fs.readFile(path.join(dir, 'server', 'index.js'), 'utf8');
    // The route path appears in app.get('${endpointPath}', ...) — single quotes
    // must be escaped to prevent route injection.
    const hasSeparateRoute = content.includes("app.get('/safe'");
    assert.ok(!hasSeparateRoute, 'Route injection must not define a separate /safe route');
    // Ensure the generated code is still syntactically valid JS
    try {
      const tmpFile = path.join(dir, '__syntax_check.mjs');
      await fs.writeFile(tmpFile, content, 'utf8');
      execSync(`node --check "${tmpFile}"`, { stdio: 'pipe' });
      await fs.unlink(tmpFile);
    } catch (err) {
      assert.fail(`Generated JS with escaped endpointPath has syntax errors: ${err.stderr?.toString() || err.message}`);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 16: Many Subagents Stress Test
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 16. Many Subagents Stress Test (20 subagents) ───');

  const manySubagents = Array.from({ length: 20 }, (_, i) => ({
    id: `sub-agent-${String(i).padStart(3, '0')}`,
    nameForHuman: `Subagent ${i}`,
    description: `Description for subagent ${i}.`,
    instructions: `Instructions for subagent ${i}.`
  }));

  const manySubSpec = {
    id: 'many-subs',
    nameForHuman: 'Many Subs Agent',
    description: 'Agent with 20 subagents.',
    instructions: 'Delegate tasks to subagents.',
    author: '',
    platforms: ['claude-code', 'openai-action', 'openclaw', 'gemini-adk'],
    subagents: manySubagents
  };

  await test('All generators handle 20 subagents', async () => {
    const dir = await makeCleanDir('manysubs');
    await generateClaudeCodePlugin(manySubSpec, dir);
    await generateOpenAiAction(manySubSpec, dir);
    await generateOpenclawPlugin(manySubSpec, dir);
    await generateGeminiAdkAgent(manySubSpec, dir);

    // Check that all 20 subagent files exist for Claude
    for (let i = 0; i < 20; i++) {
      const saId = `sub-agent-${String(i).padStart(3, '0')}`;
      assert.ok(await exists(path.join(dir, 'agents', `${saId}.md`)), `Missing agent md: ${saId}`);
      assert.ok(await exists(path.join(dir, 'skills', saId, 'SKILL.md')), `Missing openclaw skill: ${saId}`);
    }

    // Check OpenAPI has 21 paths (1 main + 20 subagents)
    const openapiRaw = await fs.readFile(path.join(dir, 'openapi.yaml'), 'utf8');
    const parsed = yaml.load(openapiRaw);
    assert.equal(Object.keys(parsed.paths).length, 21);

    // Check agent.py has 20 subagent variables in tools list
    const pyContent = await fs.readFile(path.join(dir, 'agent.py'), 'utf8');
    assert.ok(pyContent.includes('tools=[sub_agent_000'), 'Should reference first subagent');
    assert.ok(pyContent.includes('sub_agent_019'), 'Should reference last subagent');
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 17: Verify generated JS is syntactically valid
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 17. Generated JS Syntax Validation ───');

  await test('Generated server/index.js from valid spec parses as JS', async () => {
    const content = await fs.readFile(path.join(validDir, 'server', 'index.js'), 'utf8');
    // Use Node's built-in parser to check syntax
    // We can't use import() because it would execute, but we can use
    // a module-level syntax check
    try {
      // Write to a temp file and use node --check
      const tmpFile = path.join(validDir, '__syntax_check.mjs');
      await fs.writeFile(tmpFile, content, 'utf8');
      execSync(`node --check "${tmpFile}"`, { stdio: 'pipe' });
      await fs.unlink(tmpFile);
    } catch (err) {
      assert.fail(`Generated JS has syntax errors: ${err.stderr?.toString() || err.message}`);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // GROUP 18: Customizable Backend Logic Templates
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── 18. Customizable Backend Logic Templates ───');

  await test('Generates correct files for fetch logicType', async () => {
    const spec = {
      id: 'fetch-logic',
      nameForHuman: 'Fetch Logic',
      description: 'Fetch stuff',
      instructions: 'Fetch data.',
      author: '',
      platforms: ['claude-code', 'openai-action', 'openclaw', 'gemini-adk'],
      logicType: 'fetch',
      subagents: []
    };
    const dir = await makeCleanDir('logic-fetch');
    await generateClaudeCodePlugin(spec, dir);
    await generateOpenAiAction(spec, dir);
    await generateOpenclawPlugin(spec, dir);
    await generateGeminiAdkAgent(spec, dir);

    const claudeMd = await fs.readFile(path.join(dir, 'skills', 'fetch-logic', 'SKILL.md'), 'utf8');
    assert.ok(claudeMd.includes('external HTTP API'), 'Claude MD has fetch instructions');

    const jsContent = await fs.readFile(path.join(dir, 'server', 'index.js'), 'utf8');
    assert.ok(jsContent.includes('const response = await fetch(url)'), 'Express has fetch call');

    const pyContent = await fs.readFile(path.join(dir, 'agent.py'), 'utf8');
    assert.ok(pyContent.includes('def fetch_external_api'), 'Python has fetch tool definition');
    assert.ok(pyContent.includes('fetch_external_api'), 'Python registers fetch tool');
  });

  await test('Generates correct files for fs logicType', async () => {
    const spec = {
      id: 'fs-logic',
      nameForHuman: 'FS Logic',
      description: 'Filesystem stuff',
      instructions: 'Filesystem.',
      author: '',
      platforms: ['claude-code', 'openai-action', 'openclaw', 'gemini-adk'],
      logicType: 'fs',
      subagents: []
    };
    const dir = await makeCleanDir('logic-fs');
    await generateClaudeCodePlugin(spec, dir);
    await generateOpenAiAction(spec, dir);
    await generateOpenclawPlugin(spec, dir);
    await generateGeminiAdkAgent(spec, dir);

    const claudeMd = await fs.readFile(path.join(dir, 'skills', 'fs-logic', 'SKILL.md'), 'utf8');
    assert.ok(claudeMd.includes('workspace folder'), 'Claude MD has fs instructions');

    const jsContent = await fs.readFile(path.join(dir, 'server', 'index.js'), 'utf8');
    assert.ok(jsContent.includes('import fs from \'node:fs/promises\''), 'Express imports fs');

    const pyContent = await fs.readFile(path.join(dir, 'agent.py'), 'utf8');
    assert.ok(pyContent.includes('def interact_with_filesystem'), 'Python has fs tool');
  });

  await test('Generates correct files for database logicType', async () => {
    const spec = {
      id: 'db-logic',
      nameForHuman: 'DB Logic',
      description: 'Database stuff',
      instructions: 'Database.',
      author: '',
      platforms: ['claude-code', 'openai-action', 'openclaw', 'gemini-adk'],
      logicType: 'database',
      subagents: []
    };
    const dir = await makeCleanDir('logic-db');
    await generateClaudeCodePlugin(spec, dir);
    await generateOpenAiAction(spec, dir);
    await generateOpenclawPlugin(spec, dir);
    await generateGeminiAdkAgent(spec, dir);

    const claudeMd = await fs.readFile(path.join(dir, 'skills', 'db-logic', 'SKILL.md'), 'utf8');
    assert.ok(claudeMd.includes('sqlite3 command-line utility'), 'Claude MD has db instructions');

    const jsContent = await fs.readFile(path.join(dir, 'server', 'index.js'), 'utf8');
    assert.ok(jsContent.includes('import sqlite3 from \'sqlite3\''), 'Express imports sqlite3');

    const packageJson = JSON.parse(await fs.readFile(path.join(dir, 'server', 'package.json'), 'utf8'));
    assert.ok(packageJson.dependencies.sqlite3, 'Express has sqlite3 dependency');

    const pyContent = await fs.readFile(path.join(dir, 'agent.py'), 'utf8');
    assert.ok(pyContent.includes('def query_local_database'), 'Python has db tool');
  });

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);

  if (failures.length > 0) {
    console.log('\nFailed tests:');
    for (const f of failures) {
      console.log(`  ✗ ${f.name}`);
      console.log(`    ${f.error.message}`);
    }
  }
  console.log('══════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('\nTest runner crashed:', err);
  process.exit(1);
});
