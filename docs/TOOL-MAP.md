# Tool vocabulary: Claude Code -> DeepSeek Harness

Claude Code's prompt is written in Claude Code's tool names. This host does not have those
tools; it has its own. Installing the persona without the translation produces a costume: the
model asks for a tool that does not exist, or drives the shell for what a dedicated tool does
better.

`lib/toolmap.js` is the single source of this table. It is rendered into the persona as the
"Tool vocabulary for this host" section at mount time, so the model always sees the mapping
that matches the build it is running in.

## Direct translations

| Claude Code | Harness | Parameters |
| --- | --- | --- |
| Read | `ops_read_files` | files[{path, offset, limit}] — a line range, not a whole-file dump |
| Write | `write` | file_path, content — full replace; read first |
| Edit | `edit` | file_path, old_string, new_string, replace_all — exact string, must be unique |
| Bash | `pwsh` (Windows) / `bash` | command, description, timeoutMs, run_in_background |
| Glob | `ops_glob` | pattern is an ARRAY of globs; '*.ts' is top level only |
| Grep | `ops_grep` | one Rust regex; outputMode replaces --output |
| LS | `ops_glob` | pattern ['*'] on the directory |
| TodoWrite | `todo_write` | todos[{content, status, activeForm}] — replaces the list |
| Task / Agent | `subagent` | description, prompt; `subagent_fork` inherits this conversation |
| AskUserQuestion | `ask_user_question` | questions[{id, header, question, options, multi_select}] |
| ExitPlanMode | `exit_plan_mode` | plan; only and final call of its step |
| WebFetch | `web_fetch` | url |
| WebSearch | `web_search` | queries[] |
| BashOutput | `job_output` | job_id, wait, timeout_ms |
| KillShell | `job_kill` | job_id, reason |
| Skill | `skill` | name |
| TaskCreate/Update/List | `todo_write` | the board collapses into one list |
| Monitor | `job_output` | poll the job; no streaming between turns |
| Present | `present` | files[{path, description}] |

## Same intent, different shape

- **MultiEdit** — no batch editor. Emit parallel `edit` calls when the targets differ.
- **NotebookEdit** — read the `.ipynb` JSON, edit the cell source strings, keep the JSON valid.
- **Slash commands** — a slash verb is a skill here. Load it and follow it.
- **Background bash with notification** — `pwsh` with run_in_background plus `job_output`; you
  are notified when the job finishes, so do not sleep-loop.

## Deliberately absent

- **EnterPlanMode** is not a tool here: plan mode is a session mode. The mode's persona
  describes the discipline; the model must not claim to have entered anything.
- **Claude Code product verbs** (`/help`, `/issue`, `/share`) do not exist in this session.
- **`mcp__server__tool` naming** — MCP tools are registered under their own names; list them
  before assuming a name.