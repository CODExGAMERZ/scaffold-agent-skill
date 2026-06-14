# create-agent-skill

Interactively scaffold agent skills and plugins from a single specification. Target multiple developer and agent platforms simultaneously with a clean, validated scaffolding directory.

Supported platforms include:

- Claude Code Plugin: Generates `.claude-plugin/plugin.json` and `skills/<id>/SKILL.md` alongside individual subagent prompts in `agents/`.
- OpenAI Custom GPT Action: Generates a serialized `openapi.yaml` and a production-hardened Express server (with helmet, cors, input validation, global error handling, and pinned dependencies).
- OpenClaw Gateway Skill: Generates `skills/<id>/SKILL.md` (and files for each subagent) alongside a config snippet in `openclaw.json`.
- Google ADK / Gemini Agent: Generates `agent.py` and a `requirements.txt` file setup with `google-adk` dependencies.

## Key Features

- Interactive CLI: Step-by-step prompts to configure your main agent's ID, human-readable name, description, instructions, interfaces, platforms, and subagents.
- Multi-Platform Code Generation: Generates required files for selected targets simultaneously.
- Security and Robustness Guards:
  - Path Traversal Guard: Prevents directory escape by checking that output directories remain inside the current working directory.
  - Safe String Escaping: Employs proper escaping for Python strings (triple quote breaks), JavaScript template literals (backticks, expression placeholders), and comments (newlines, comment markers).
  - Validation: Enforces constraints on ID characters (alphanumeric and hyphens only), ID length (maximum 64 characters), descriptions (maximum 200 characters), and instructions (maximum 2000 characters).
  - ID Collision Resolution: Rejects duplicate subagent IDs and prevents subagent IDs from colliding with the main agent ID.
  - Subagent Limit: Restricts subagents to a maximum of 20 to maintain manageable architectures.
- Clean Casing Utilities: ASCII-safe camelCase, PascalCase, and snake_case converters that strip invalid characters to prevent compiler errors.
- Overwrite Protection: Prompts for confirmation before writing files into directories that already contain content.

## Quick Start (npx)

You can run the tool interactively without installing it:

```bash
npx create-agent-skill
```

You will be prompted to:
1. Provide a skill ID (kebab-case, e.g. "check-stock").
2. Enter a human-readable name and description.
3. Provide instructions for what the skill should do.
4. Select the target interface types (CLI, service API, or developer SDK).
5. Select platforms based on those interfaces (Claude Code, OpenAI, OpenClaw, Google ADK).
6. Optionally configure up to 20 subagents (which will be linked as tools).
7. Select or confirm the output directory.

## Development and Local Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Aryan/create-agent-skill.git
cd create-agent-skill
npm install
```

Run the tool locally:

```bash
node bin/cli.js
```

Or link it globally to run it from anywhere on your machine:

```bash
npm link
create-agent-skill
```

## Generated Outputs and Usage

Running the tool with all options will generate the following structure in your output folder:

```
my-skill/
├── .gitignore
├── README.md
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── my-skill/
│   │   └── SKILL.md
│   └── my-subagent/
│       └── SKILL.md
├── agents/
│   └── my-subagent.md
├── openapi.yaml
├── server/
│   ├── index.js
│   └── package.json
├── agent.py
├── requirements.txt
└── openclaw.json
```

### Claude Code Plugin

Test the skill locally in Claude Code:

```bash
cd my-skill
claude --plugin-dir .
```
Inside Claude Code, invoke your plugin:
```
/my-skill
```

### OpenAI Custom GPT Action

1. Install dependencies and start the Express server stub:
   ```bash
   cd my-skill/server
   npm install
   npm start
   ```
2. Deploy the server to a hosting provider with HTTPS support (e.g. Railway, Fly.io, Render).
3. Update the `servers.url` field in the generated `openapi.yaml` with your deployed URL.
4. Paste the contents of `openapi.yaml` into the Actions configuration page of your Custom GPT in ChatGPT.

### OpenClaw Gateway Skill

1. Copy the generated `skills/` folders to your OpenClaw skills directory (usually located at `~/.openclaw/skills/`).
2. Merge the configuration options from the generated `openclaw.json` file into your global OpenClaw configuration file (`~/.openclaw/openclaw.json`).
3. Run OpenClaw and invoke the skill using your main skill ID.

### Google ADK / Gemini Agent

1. Install the required libraries:
   ```bash
   pip install -r requirements.txt
   ```
2. Run your Gemini agent:
   ```bash
   python agent.py "Your query prompt here"
   ```

## Running Tests

The codebase comes equipped with a comprehensive stress test suite to verify case converter logic, path containment, and escape safety across all platforms.

Run the test suite with:

```bash
npm test
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
