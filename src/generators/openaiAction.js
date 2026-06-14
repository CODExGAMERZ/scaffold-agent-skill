import path from 'node:path';
import fs from 'node:fs/promises';
import yaml from 'js-yaml';
import { toCamelCase, escapeJsTemplateLiteral, escapeJsSingleQuoteString, cleanComment } from '../schema.js';

/**
 * Generates a secure OpenAPI spec + Express server stub suitable for
 * pasting into a Custom GPT's Actions config, or wrapping in an MCP
 * server later.
 *
 *   <out>/openapi.yaml
 *   <out>/server/index.js
 *   <out>/server/package.json
 *
 * @param {import('../schema.js').SkillSpec} spec
 * @param {string} outDir
 */
export async function generateOpenAiAction(spec, outDir) {
  const serverDir = path.join(outDir, 'server');
  await fs.mkdir(serverDir, { recursive: true });

  const handlerName = toCamelCase(spec.id);
  const endpointPath = spec.endpointPath || `/${spec.id}`;

  const openapiObj = {
    openapi: '3.1.0',
    info: {
      title: spec.nameForHuman,
      description: spec.description,
      version: '0.1.0',
    },
    servers: [
      {
        url: 'https://YOUR-DEPLOYED-URL.example.com',
      },
    ],
    paths: {
      [endpointPath]: {
        get: {
          operationId: handlerName,
          summary: spec.description,
          parameters: [
            {
              name: 'input',
              in: 'query',
              required: true,
              schema: {
                type: 'string',
              },
              description: `Free-form input for "${spec.nameForHuman}"`,
            },
          ],
          responses: {
            200: {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      result: {
                        type: 'string',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  const subagents = spec.subagents || [];
  for (const sa of subagents) {
    const saHandler = toCamelCase(sa.id);
    const saPath = `/agents/${sa.id}`;
    openapiObj.paths[saPath] = {
      get: {
        operationId: saHandler,
        summary: sa.description,
        parameters: [
          {
            name: 'input',
            in: 'query',
            required: true,
            schema: {
              type: 'string',
            },
            description: `Free-form input for subagent "${sa.nameForHuman}"`,
          },
        ],
        responses: {
          200: {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    result: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }

  const openapiYaml = yaml.dump(openapiObj);
  await fs.writeFile(path.join(outDir, 'openapi.yaml'), openapiYaml, 'utf8');

  const logicType = spec.logicType || 'stub';

  let subagentRoutes = '';
  for (const sa of subagents) {
    const saNameEscaped = escapeJsTemplateLiteral(sa.nameForHuman);
    const saDescComment = cleanComment(sa.description);
    const saInstComment = cleanComment(sa.instructions.trim().split('\n')[0]);
    subagentRoutes += `
// Subagent: ${saNameEscaped} - ${saDescComment}
// Instructions: ${saInstComment}
app.get('/agents/${sa.id}', async (req, res) => {
  const { input } = req.query;
  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or invalid required query parameter: input' });
  }

  // TODO: replace with real logic for "${saNameEscaped}"
  res.json({ result: \`[${saNameEscaped}] Received input: \${input}\` });
});
`;
  }

  const mainNameEscaped = escapeJsTemplateLiteral(spec.nameForHuman);
  const mainDescComment = cleanComment(spec.description);
  const mainInstComment = cleanComment(spec.instructions.trim().split('\n')[0]);

  let importsList = `import express from 'express';
import cors from 'cors';
import helmet from 'helmet';`;

  let mainHandlerBody = '';

  if (logicType === 'fetch') {
    mainHandlerBody = `  // Fetch data from an external API
  const url = \`https://api.example.com/data?query=\${encodeURIComponent(input)}\`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: \`External API responded with status \${response.status}\` });
    }
    const data = await response.json();
    res.json({ result: data });
  } catch (err) {
    res.status(500).json({ error: \`Failed to fetch external API: \${err.message}\` });
  }`;
  } else if (logicType === 'fs') {
    importsList += `\nimport fs from 'node:fs/promises';\nimport path from 'node:path';`;
    mainHandlerBody = `  // Read and write data securely to local files
  const dataFilePath = path.join(process.cwd(), 'data.json');
  try {
    let currentData = {};
    try {
      const content = await fs.readFile(dataFilePath, 'utf8');
      currentData = JSON.parse(content);
    } catch (readErr) {
      // Ignore if file doesn't exist yet
    }
    currentData[new Date().toISOString()] = input;
    await fs.writeFile(dataFilePath, JSON.stringify(currentData, null, 2), 'utf8');
    res.json({ result: \`Successfully wrote input to local file data.json. Total entries: \${Object.keys(currentData).length}\` });
  } catch (err) {
    res.status(500).json({ error: \`Failed to perform filesystem operation: \${err.message}\` });
  }`;
  } else if (logicType === 'database') {
    importsList += `\nimport sqlite3 from 'sqlite3';\nimport path from 'node:path';`;
    mainHandlerBody = `  // Connect to local SQLite database and query
  const dbPath = path.join(process.cwd(), 'database.db');
  const db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS queries (id INTEGER PRIMARY KEY, val TEXT)");
    db.run("INSERT INTO queries (val) VALUES (?)", [input], function(err) {
      if (err) {
        db.close();
        return res.status(500).json({ error: \`Database insert error: \${err.message}\` });
      }
      db.all("SELECT * FROM queries ORDER BY id DESC LIMIT 5", [], (selectErr, rows) => {
        db.close();
        if (selectErr) {
          return res.status(500).json({ error: \`Database select error: \${selectErr.message}\` });
        }
        res.json({ result: \`Inserted entry. Last 5 entries: \${JSON.stringify(rows)}\` });
      });
    });
  });`;
  } else {
    mainHandlerBody = `  // TODO: replace with real logic for "${mainNameEscaped}"
  res.json({ result: \`Received input: \${input}\` });`;
  }

  const serverIndexJs = `${importsList}

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors()); // Configure allowed origins, methods, and headers for production
app.use(express.json());

// Main Skill: ${mainDescComment}
// Instructions: ${mainInstComment}
app.get('${escapeJsSingleQuoteString(endpointPath)}', async (req, res) => {
  const { input } = req.query;
  if (!input || typeof input !== 'string' || input.trim().length === 0) {
    return res.status(400).json({ error: 'Missing or invalid required query parameter: input' });
  }

${mainHandlerBody}
});
${subagentRoutes}
// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
  console.log(\`${mainNameEscaped} action server listening on port \${port}\`);
});
`;

  await fs.writeFile(path.join(serverDir, 'index.js'), serverIndexJs, 'utf8');

  const serverDependencies = {
    express: '4.21.0',
    cors: '2.8.5',
    helmet: '7.1.0',
  };
  if (logicType === 'database') {
    serverDependencies.sqlite3 = '5.1.7';
  }

  const serverPackageJson = {
    name: `${spec.id}-action-server`,
    version: '0.1.0',
    private: true,
    type: 'module',
    main: 'index.js',
    scripts: {
      start: 'node index.js',
    },
    dependencies: serverDependencies,
  };

  await fs.writeFile(
    path.join(serverDir, 'package.json'),
    JSON.stringify(serverPackageJson, null, 2) + '\n',
    'utf8'
  );

  return {
    files: [
      path.relative(outDir, path.join(outDir, 'openapi.yaml')),
      path.relative(outDir, path.join(serverDir, 'index.js')),
      path.relative(outDir, path.join(serverDir, 'package.json')),
    ],
    nextSteps: [
      'Deploy server/ somewhere reachable over HTTPS (e.g. a free-tier host), then update the `servers.url` in openapi.yaml.',
      'In ChatGPT, create a Custom GPT, open Configure > Actions, and paste in the contents of openapi.yaml.',
      'Set an auth method in the Actions config if your endpoint needs one (none / API key / OAuth).',
      'Run "npm install" inside the server directory and run "npm audit" to check for vulnerabilities.',
    ],
  };
}

