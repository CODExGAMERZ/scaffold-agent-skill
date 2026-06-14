import path from 'node:path';
import fs from 'node:fs/promises';
import { toSnakeCase, escapePythonString, cleanComment } from '../schema.js';

/**
 * Generates Google ADK / Gemini Agent code:
 *   <out>/agent.py
 *   <out>/requirements.txt
 *
 * @param {import('../schema.js').SkillSpec} spec
 * @param {string} outDir
 */
export async function generateGeminiAdkAgent(spec, outDir) {
  const generatedFiles = [];

  const mainAgentVar = toSnakeCase(spec.id);
  const mainAgentName = toSnakeCase(spec.id) + '_agent';

  // Construct subagents definitions
  const subagents = spec.subagents || [];
  const subagentDefs = [];
  const subagentVars = [];

  for (const sa of subagents) {
    const saVar = toSnakeCase(sa.id);
    const saName = toSnakeCase(sa.id) + '_agent';
    subagentVars.push(saVar);
    subagentDefs.push(`# Subagent: ${cleanComment(sa.nameForHuman)}
${saVar} = LlmAgent(
    model="gemini-2.0-flash-exp",
    name="${saName}",
    description="${escapePythonString(sa.description)}",
    instruction="${escapePythonString(sa.instructions.trim())}",
)
`);
  }

  const logicType = spec.logicType;
  let pythonToolsDefs = '';
  let pythonToolsList = [...subagentVars];

  if (logicType === 'fetch') {
    pythonToolsDefs = `def fetch_external_api(query: str) -> str:
    """Fetches data from an external API based on a query string."""
    import urllib.request
    import urllib.parse
    import json
    url = f"https://api.example.com/data?query={urllib.parse.quote(query)}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        return f"Error fetching from external API: {str(e)}"

`;
    pythonToolsList.push('fetch_external_api');
  } else if (logicType === 'fs') {
    pythonToolsDefs = `def interact_with_filesystem(filename: str, content: str = None) -> str:
    """Reads or writes text content from/to a local file securely."""
    import os
    safe_path = os.path.basename(filename)
    try:
        if content is not None:
            with open(safe_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return f"Successfully wrote content to {safe_path}"
        else:
            if not os.path.exists(safe_path):
                return f"File {safe_path} does not exist"
            with open(safe_path, 'r', encoding='utf-8') as f:
                return f.read()
    except Exception as e:
        return f"Filesystem error: {str(e)}"

`;
    pythonToolsList.push('interact_with_filesystem');
  } else if (logicType === 'database') {
    pythonToolsDefs = `def query_local_database(sql_query: str) -> str:
    """Executes a SQL query on the local SQLite database and returns the rows as JSON."""
    import sqlite3
    import json
    try:
        conn = sqlite3.connect("database.db")
        cursor = conn.cursor()
        cursor.execute("CREATE TABLE IF NOT EXISTS queries (id INTEGER PRIMARY KEY, val TEXT)")
        conn.commit()
        cursor.execute(sql_query)
        if sql_query.strip().upper().startswith("SELECT"):
            rows = cursor.fetchall()
            conn.close()
            return json.dumps(rows)
        else:
            conn.commit()
            conn.close()
            return "Query executed successfully"
    except Exception as e:
        return f"Database error: {str(e)}"

`;
    pythonToolsList.push('query_local_database');
  } else if (logicType === 'stub') {
    pythonToolsDefs = `def stub_tool(input_val: str) -> str:
    """A placeholder tool that echoes the input parameter."""
    return f"Stub tool received: {input_val}"

`;
    pythonToolsList.push('stub_tool');
  }

  const subagentsSection = subagentDefs.length > 0 ? subagentDefs.join('\n') + '\n' : '';
  const toolsList = pythonToolsList.length > 0 ? `tools=[${pythonToolsList.join(', ')}]` : 'tools=[]';

  const agentPy = `from google.adk.agents import LlmAgent

${pythonToolsDefs}
${subagentsSection}# Main Agent: ${cleanComment(spec.nameForHuman)}
${mainAgentVar} = LlmAgent(
    model="gemini-2.0-flash-exp",
    name="${mainAgentName}",
    description="${escapePythonString(spec.description)}",
    instruction="${escapePythonString(spec.instructions.trim())}",
    ${toolsList},
)

if __name__ == "__main__":
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "Hello"
    print(f"Running agent: {${mainAgentVar}.name} with query: '{query}'")
    # Example execution:
    # response = ${mainAgentVar}.run(query)
    # print(response)
`;

  const agentPyPath = path.join(outDir, 'agent.py');
  await fs.writeFile(agentPyPath, agentPy, 'utf8');
  generatedFiles.push(path.relative(outDir, agentPyPath));

  const requirementsTxt = `google-adk>=0.1.0
`;
  const reqPath = path.join(outDir, 'requirements.txt');
  await fs.writeFile(reqPath, requirementsTxt, 'utf8');
  generatedFiles.push(path.relative(outDir, reqPath));

  return {
    files: generatedFiles,
    nextSteps: [
      'Install dependencies with: pip install -r requirements.txt',
      `Run the agent locally using: python agent.py "your-prompt-here"`,
    ],
  };
}

