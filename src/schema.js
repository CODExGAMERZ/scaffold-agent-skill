/**
 * The internal "spec" object collected from the user via prompts.
 * This mirrors the modular schema described in the design doc:
 * a small, platform-agnostic description of a single skill/tool
 * that generators can translate into platform-specific artifacts.
 *
 * @typedef {Object} SubagentSpec
 * @property {string} id            kebab-case identifier, e.g. "coder-agent"
 * @property {string} nameForHuman  Human-readable name, e.g. "Coder Agent"
 * @property {string} description   One-line description of what it does
 * @property {string} instructions  Instructions / system prompt for this subagent
 *
 * @typedef {Object} SkillSpec
 * @property {string} id            kebab-case identifier, e.g. "check-stock"
 * @property {string} nameForHuman  Human-readable name, e.g. "Check Stock"
 * @property {string} description   One-line description of what it does
 * @property {string} author        Author name (optional)
 * @property {string} instructions  What the skill/tool should do, in prose
 * @property {string[]} platforms   Subset of ["claude-code", "openai-action", "openclaw", "gemini-adk"]
 * @property {string} endpointPath  HTTP path used for the OpenAI Action stub, e.g. "/check-stock"
 * @property {SubagentSpec[]} subagents Array of subagents (optional)
 */

export function toPascalCase(id) {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('Input must be a non-empty string');
  }
  // Strip non-ASCII characters first
  const clean = id.replace(/[^\x00-\x7F]/g, '');
  // Strip characters that are not alphanumeric, spaces, hyphens, or underscores
  const cleanAlphaNum = clean.replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
  if (cleanAlphaNum.length === 0) {
    throw new Error('Input contains no valid characters for casing');
  }
  return cleanAlphaNum
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function toCamelCase(id) {
  const pascal = toPascalCase(id);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function toSnakeCase(id) {
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('Input must be a non-empty string');
  }
  const clean = id.replace(/[^\x00-\x7F]/g, '');
  const cleanAlphaNum = clean.replace(/[^a-zA-Z0-9\s-_]/g, '').trim();
  if (cleanAlphaNum.length === 0) {
    throw new Error('Input contains no valid characters for casing');
  }
  return cleanAlphaNum
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase())
    .join('_');
}

export function escapePythonString(val) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export function escapeJsTemplateLiteral(val) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${');
}

export function escapeJsSingleQuoteString(val) {
  if (typeof val !== 'string') return '';
  return val
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

export function cleanComment(val) {
  if (typeof val !== 'string') return '';
  return val.replace(/[\r\n]/g, ' ').replace(/\*\//g, '* /');
}


