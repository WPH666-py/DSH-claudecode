/**
 * Single source of truth for the Agent-ClaudeCode preset composition.
 *
 * Two artifacts are generated from this file and must never be edited by hand:
 *
 *   cordis.patch.yml                             the profile bundle row list
 *   presets/agent-claudecode/agent.cordis.yml    the on-disk preset tree
 *
 * The composition is the whole point of the mode. It mounts the Claude Code workflow row
 * first, then exactly the tools that workflow needs, and it does not mount the Harness
 * standard workflow: no harness persona, no harness tool-usage policy, no harness
 * orchestration. Selecting this preset therefore takes the Harness workflow offline and
 * puts the Claude Code loop in charge.
 */

import { js } from "./yaml.mjs"

export const PRESET = Object.freeze({
  id: "agent-claudecode",
  order: 100,
  name: "Agent-ClaudeCode",
  description:
    "Claude Code 工作流模式：选中即让 Harness 工作流下线，由 Claude Code 的 agent loop（探索→决策→工具→观察→验证）接管系统提示与工具协议；工具词表已翻译到本机 Harness 工具，并可经 claudecode_backend 委派给 Claude Code CLI、Codex CLI 或回落到 Harness 原生循环。",
})

/**
 * The plan-mode section. Claude Code's plan mode is a real discipline, not a banner: it
 * mirrors the promises the leaked EnterPlanMode/ExitPlanMode prompts make, expressed for a
 * host where plan mode is a session mode rather than a tool call.
 */
const PLAN_SECTION = `You are in plan mode. Stay there until the user approves a plan through exit_plan_mode or switches the session mode. Imperative language asking for changes means plan the implementation, not carry it out. A conversational agreement approves nothing.

Explore first: non-mutating reads, searches, static analysis, and throwaway checks that ground the plan in the actual repository. Do not edit or write files, do not change configuration, do not run formatters or code generation that rewrites tracked files, do not commit.

Resolve discoverable facts by inspection. Use ask_user_question only for choices the user owns, or for ambiguity that inspection genuinely cannot settle. Never ask where code lives or how current behaviour works when you can find out.

The plan must be decision-complete: the goal and success criteria; the changes grouped by subsystem; the public API, schema and data-flow consequences; edge cases and failure modes; the tests and acceptance criteria; and every assumption you are making. Concise enough to review, detailed enough that another engineer implements it without making design decisions.

When ready, call exit_plan_mode with the complete markdown plan starting with a # title, as the only and final call of that step. Do not paste the plan as prose and do not ask "should I proceed". If review rejects it, fold the feedback in and present it again.`

/**
 * Full composition. Order matters: the workflow row first, then the environment and the
 * tools whose semantics the persona promises.
 */
export const PLUGINS = Object.freeze([
  {
    id: "ac-workflow",
    name: "agent-claudecode/workflow",
    config: { preferred: "auto" },
  },
  {
    id: "ac-agent-instructions",
    name: "@deepseek-ai/dsh-agent-instructions",
    config: { maxBytes: 65536 },
  },
  { id: "ac-time-context", name: "@deepseek-ai/dsh-time-context" },
  {
    id: "ac-tool-bash",
    name: "@deepseek-ai/dsh-tool-bash",
    disabled: js("process.platform === 'win32'"),
  },
  {
    id: "ac-tool-pwsh",
    name: "@deepseek-ai/dsh-tool-pwsh",
    disabled: js("process.platform !== 'win32'"),
  },
  {
    id: "ac-tool-fs",
    name: "@deepseek-ai/dsh-tool-fs",
    config: { applyPatch: true },
  },
  {
    id: "ac-tool-fs-search",
    name: "@deepseek-ai/dsh-tool-fs-search",
    config: { sampleOverCapGlobResults: false },
  },
  { id: "ac-tool-jobs", name: "@deepseek-ai/dsh-tool-jobs" },
  { id: "ac-tool-schedule", name: "@deepseek-ai/dsh-tool-schedule" },
  { id: "ac-skill-filesystem", name: "@deepseek-ai/dsh-skill-filesystem" },
  { id: "ac-tool-skill", name: "@deepseek-ai/dsh-tool-skill" },
  { id: "ac-command-goal", name: "@deepseek-ai/dsh-command-goal" },
  { id: "ac-tool-goal", name: "@deepseek-ai/dsh-tool-goal" },
  {
    id: "ac-planning",
    name: "cordis:group",
    group: true,
    isolate: { planMode: true },
    config: [
      {
        id: "ac-plan-mode",
        name: "@deepseek-ai/dsh-plan-mode",
        config: { section: PLAN_SECTION },
      },
    ],
  },
  {
    id: "ac-compaction",
    name: "cordis:group",
    group: true,
    isolate: { compaction: true, toolResultPruner: true },
    config: [
      { id: "ac-compaction-basic", name: "@deepseek-ai/dsh-compaction-basic" },
      { id: "ac-command-compact", name: "@deepseek-ai/dsh-command-compact" },
      {
        id: "ac-tool-result-pruner",
        name: "@deepseek-ai/dsh-compaction-tool-result-pruner",
        config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 },
      },
    ],
  },
  {
    id: "ac-delegation",
    name: "cordis:group",
    group: true,
    isolate: { workflowEngine: true },
    config: [
      { id: "ac-tool-subagent-control", name: "@deepseek-ai/dsh-tool-subagent-control" },
      {
        id: "ac-tool-subagent",
        name: "@deepseek-ai/dsh-tool-subagent",
        config: { provider: "spawn", toolName: "subagent", modelSelection: true, modelDiscovery: true },
      },
      {
        id: "ac-tool-subagent-fork",
        name: "@deepseek-ai/dsh-tool-subagent",
        config: { provider: "fork", toolName: "subagent_fork" },
      },
    ],
  },
  { id: "ac-tool-ask-user", name: "@deepseek-ai/dsh-tool-ask-user" },
  {
    id: "ac-tool-todo",
    name: "@deepseek-ai/dsh-tool-todo",
    config: { allowParallelInProgress: false },
  },
  {
    id: "ac-tool-web",
    name: "@deepseek-ai/dsh-tool-web",
    config: { fetch: true, searchTimeoutMs: 60000 },
  },
  { id: "ac-present", name: "@deepseek-ai/dsh-tool-present" },
])