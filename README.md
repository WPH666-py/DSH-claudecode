# Agent-ClaudeCode

The Claude Code agent workflow, packaged as a **selectable mode** in DeepSeek Harness.

Selecting it does two things on purpose:

- **The Harness workflow goes offline.** The standard preset's persona, its tool-usage
  policy, its delegation protocol and its reporting style are not mounted. They are not in
  the context at all.
- **The Claude Code workflow takes over.** The system prompt becomes Claude Code's loop —
  orient, decide one action, act, observe, adapt, verify, report — together with its hard
  rules on code style, risky actions, git protocol, and honest reporting.

The tool vocabulary is translated, not assumed: Claude Code says Read / Bash / Edit / Glob /
Grep / Task, this host has `ops_read_files` / `pwsh` / `edit` / `ops_glob` / `ops_grep` /
`subagent`. The mapping (`docs/TOOL-MAP.md`) is injected at mount time.

## Install

```bash
dsh plugin --profile desktop add link:D:/projects-py/Agent-claudecode
dsh plugin --profile desktop add ./agent-claudecode-1.0.0.tgz
dsh plugin --profile desktop add github:WPH666-py/DSH-claudecode
```

Restart the host, then pick **Agent-ClaudeCode** in the mode selector of a new session.

The plugin also publishes, idempotently and byte-compared, into `$DSH_HOME` (default
`~/.dsh`): `.agent-presets/agent-claudecode/` and `skills/claudecode-workflow/`.

## Three backends

| Backend | What it is | How to reach it |
| --- | --- | --- |
| `harness` | the native tool loop, no external process (default) | work directly |
| `claudecode` | Claude Code CLI, `claude -p --output-format text --permission-mode acceptEdits` | `claudecode_backend` with `action="run"`, `backend="claudecode"` |
| `codex` | OpenAI Codex CLI, `codex exec --full-auto --skip-git-repo-check` | same tool, `backend="codex"` |

`action="status"` probes without spawning. `backend="auto"` takes the first available CLI and
falls back to the native loop. It never installs silently and never swaps backends after a
failure: the model has to know which agent touched the workspace, because it reviews that
agent's diff.

## What the mode actually changes

`lib/composition.mjs` is the single source of truth. `npm run build` generates:

```
cordis.patch.yml                            the profile bundle row (authoritative registration)
presets/agent-claudecode/agent.cordis.yml   the on-disk preset tree (second registration path)
presets/agent-claudecode/preset.yml         display name, description, order
```

The first row of the composition is always the workflow row; the rest are the tools this
workflow needs. There is no Harness persona row and no Harness orchestration row. That is
what "the Harness workflow is offline" means in practice: not a flag turned off, but a
composition that does not contain it.

## Layout

```
lib/index.js          host plugin: persona section, backend tool, home sync
lib/prompt.js         the ported workflow prompt (section order preserved)
lib/toolmap.js        Claude Code tool names -> Harness tool names
lib/engine.js         backend probing and delegation
lib/composition.mjs   the preset composition
lib/yaml.mjs          the minimal YAML emitter used by the build
scripts/build.mjs     generate + structural self-check
docs/PROVENANCE.md    which prompt section came from which source file
docs/TOOL-MAP.md      the full translation table
skills/               the shipped claudecode-workflow skill
```

## Develop

```bash
npm run build   # regenerate registration artifacts
npm run check   # fail when the artifacts drifted from the composition
npm test        # structure, prompt, mapping and sync tests
```

## License

MIT.