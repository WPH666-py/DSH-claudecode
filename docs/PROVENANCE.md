# Provenance

## Where the workflow comes from

The operating prompt in `lib/prompt.js` is ported from a source dump of Claude Code located
at, on this machine:

```
C:\Users\admin\Desktop\论文和项目\工作项目\AI资源\ClaudeCode泄露源码\src
```

The files that were read, and what each one contributed:

| File in the dump | What was taken |
| --- | --- |
| `constants/system.ts` | the CLI identity prefix ("You are Claude Code, Anthropic's official CLI for Claude") |
| `constants/prompts.ts` | `getSimpleIntroSection`, `getSimpleSystemSection`, `getSimpleDoingTasksSection`, `getActionsSection`, `getUsingYourToolsSection`, `getSimpleToneAndStyleSection`, `getOutputEfficiencySection`, and the assembly order in `getSystemPrompt` |
| `tools/BashTool/prompt.ts` | the shell contract, the dedicated-tool preferences, the git commit and pull-request protocol, the background-run and sleep guidance |
| `tools/FileReadTool/prompt.ts` | read semantics: absolute paths, cat -n line numbering, line ranges, images |
| `tools/FileEditTool/prompt.ts` | exact-string replacement, uniqueness, read-before-edit |
| `tools/FileWriteTool/prompt.ts` | full replace, read first, prefer edit |
| `tools/GlobTool/prompt.ts` | glob semantics and when to escalate to a search agent |
| `tools/GrepTool/prompt.ts` | ripgrep semantics, output modes, multiline |
| `tools/TodoWriteTool/prompt.ts` | when to use and when not to use the task list, the state machine |
| `tools/AskUserQuestionTool/prompt.ts` | question shape, options, "(Recommended)" convention |
| `tools/WebSearchTool/prompt.ts`, `tools/WebFetchTool/prompt.ts` | web tool semantics |

## What was changed, and why

1. **Section order preserved.** The order is what makes the prompt behave like Claude Code
   rather than like a summary of it, so it was kept: identity, mode contract, system, doing
   tasks, actions with care, tools, todo, tone, output efficiency, then the loop and the
   host-specific sections.
2. **Tool vocabulary translated.** Every tool name is rewritten to the host tool that
   performs it (`docs/TOOL-MAP.md`, `lib/toolmap.js`). Without this the prompt is fiction.
3. **Product surface removed.** Slash commands, the feedback channels, telemetry, the
   sandbox override flag and the undercover/attribution machinery do not exist here. What
   remains is the part that changes behaviour: how to explore, act, verify and report.
4. **A mode contract added at the top.** This repository's purpose is that selecting the
   mode takes the Harness workflow offline. That has to be stated, because a model that has
   been trained on Harness sessions will otherwise re-import Harness habits.
5. **Not copied:** any credential, endpoint, model identifier, or internal codename from the
   dump. No source file from the dump is redistributed here; only prose rules derived from
   it, plus the mapping data this repository authors itself.

## Licensing note

The dump is a source-available distribution of a proprietary product. This repository does
not vendor it. It ships an independently written prompt that follows the same operating
principles, with the derivation documented above so a reader can check the claim rather than
take it on faith. Treat the dump as reference material that stays on the machine it was
found on.