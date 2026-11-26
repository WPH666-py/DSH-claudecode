/**
 * Claude Code tool vocabulary -> DeepSeek Harness tool vocabulary.
 *
 * Claude Code's prompts are written in Claude Code's tool names (Read, Bash, Edit,
 * Glob, Grep, Task, TodoWrite, ...). The host does not have those tools; it has its
 * own. Telling the model "you are Claude Code" without telling it which real tool
 * stands behind each name produces a costume, not a workflow: the model asks for a
 * tool that does not exist, or uses the shell for what a dedicated tool does better.
 *
 * So the mapping is data, rendered into the persona at mount time, and exposed to the
 * model through the claudecode_backend status payload for self-inspection.
 *
 * Every harness name below exists in the standard Harness tool set. Where two names
 * do the same thing (the ops_* family from dsh-ops and the native tool-fs family),
 * the ops_* name is listed first because it is the one this profile mounts.
 */

export const TOOL_MAP = Object.freeze({
  upstream: "Claude Code",
  harness: "DeepSeek Harness",
  aliased: Object.freeze([
    {
      upstream: "Read",
      harness: "ops_read_files",
      params: "files[{path,offset,limit}]",
      note: "Absolute or workspace-relative path, 1-based line offset. Reads a line range, not a whole-file dump; ask for what you need. Binary and image files use the dedicated reader.",
    },
    {
      upstream: "Write",
      harness: "write",
      params: "file_path, content",
      note: "Full replace. Read an existing file first; prefer edit for anything smaller than a rewrite.",
    },
    {
      upstream: "Edit",
      harness: "edit",
      params: "file_path, old_string, new_string, replace_all",
      note: "Exact-string replacement. old_string must be unique unless replace_all is true. Read before edit.",
    },
    {
      upstream: "Bash",
      harness: "pwsh",
      params: "command, description, timeoutMs, run_in_background",
      note: "On Windows the shell is PowerShell; on other platforms the same role is the bash tool. The working directory persists between calls, shell state does not. timeout -> timeoutMs.",
    },
    {
      upstream: "Glob",
      harness: "ops_glob",
      params: "pattern[], path, outputMode, limit, sort",
      note: "pattern is an ARRAY of globs: ['**/*.ts', '!node_modules/**']. '*.ts' matches the top level only.",
    },
    {
      upstream: "Grep",
      harness: "ops_grep",
      params: "pattern, path, glob[], outputMode, caseInsensitive, lineNumbers, afterContext, beforeContext, multiline, limit",
      note: "One Rust regex string. outputMode: content | files_with_matches | count | summary. -A/-B become afterContext/beforeContext, -i becomes caseInsensitive, -n becomes lineNumbers.",
    },
    {
      upstream: "LS",
      harness: "ops_glob",
      params: "pattern['*'], path",
      note: "There is no separate ls tool; a top-level glob lists a directory. Use the shell only when you need metadata the glob does not return.",
    },
    {
      upstream: "TodoWrite",
      harness: "todo_write",
      params: "todos[{content,status,activeForm}]",
      note: "Replaces the whole list. status: pending | in_progress | completed.",
    },
    {
      upstream: "Task / Agent",
      harness: "subagent",
      params: "description, prompt",
      note: "Spawns an independent agent with its own context; it does not see this conversation. subagent_fork is the variant that inherits this conversation's completed turns.",
    },
    {
      upstream: "AskUserQuestion",
      harness: "ask_user_question",
      params: "questions[{id,header,question,options[],multi_select}]",
      note: "For user-owned choices only, never for facts you can inspect.",
    },
    {
      upstream: "ExitPlanMode",
      harness: "exit_plan_mode",
      params: "plan",
      note: "Presents the plan for approval. Make it the only and final call of its step.",
    },
    {
      upstream: "EnterPlanMode",
      harness: "(no tool)",
      params: "-",
      note: "Plan mode is a session mode here, not a tool call. When the user's mode is plan, section 10 governs. Do not claim to have entered it.",
    },
    {
      upstream: "WebFetch",
      harness: "web_fetch",
      params: "url",
      note: "Fetches and decodes a page. Pass the question as your own instruction, not as a parameter.",
    },
    {
      upstream: "WebSearch",
      harness: "web_search",
      params: "queries[]",
      note: "Returns a summary plus source URLs. Put every year and product name in the query.",
    },
    {
      upstream: "BashOutput",
      harness: "job_output",
      params: "job_id, wait, timeout_ms",
      note: "Reads a background job started with run_in_background.",
    },
    {
      upstream: "KillShell",
      harness: "job_kill",
      params: "job_id, reason",
      note: "Stops a background job.",
    },
    {
      upstream: "Skill",
      harness: "skill",
      params: "name",
      note: "Loads a skill's full instructions. Load before acting on a task that names or matches one.",
    },
    {
      upstream: "TaskCreate / TaskUpdate / TaskList",
      harness: "todo_write",
      params: "todos[]",
      note: "The task board collapses into the single todo list. There is no per-task tool.",
    },
    {
      upstream: "Monitor",
      harness: "job_output",
      params: "job_id",
      note: "Streaming between turns is not available; poll the job instead, and do not sleep-loop.",
    },
    {
      upstream: "Present / artifact",
      harness: "present",
      params: "files[{path,description}]",
      note: "Marks existing files as final deliverables.",
    },
  ]),
  emulated: Object.freeze([
    {
      upstream: "MultiEdit",
      harness: "edit (called N times)",
      note: "No batch editor. Emit the edits as parallel tool calls in one step when they touch different files.",
    },
    {
      upstream: "NotebookEdit",
      harness: "ops_read_files + edit + pwsh",
      note: "Read the .ipynb JSON, edit the cell source strings, keep the JSON valid.",
    },
    {
      upstream: "Slash commands (/commit and friends)",
      harness: "skill",
      note: "A slash command is a skill here. Load it, then follow it; there are no built-in CLI verbs.",
    },
    {
      upstream: "Background bash with notification",
      harness: "pwsh run_in_background + job_output",
      note: "You are notified when a job finishes. Do not poll in a sleep loop.",
    },
  ]),
  missing: Object.freeze([
    {
      upstream: "Claude Code's own /help, /issue, /share",
      note: "Host product commands do not exist in this session. Report a product problem in your answer instead of invoking a verb.",
    },
    {
      upstream: "MCP tools addressed as mcp__server__tool",
      note: "MCP tools are registered under their own names; list them before assuming a name.",
    },
  ]),
})

function line(entry) {
  const parts = ["- " + entry.upstream + " -> " + entry.harness]
  if (entry.params && entry.params !== "-") parts[0] += " (" + entry.params + ")"
  if (entry.note) parts[0] += ". " + entry.note
  return parts[0]
}

/**
 * Render the tool contract section that section 4 of the persona points at.
 * Kept separate from the prose so the mapping can be regenerated without
 * touching the operating prompt.
 */
export function renderToolContract() {
  const out = []
  out.push("## Tool vocabulary for this host")
  out.push("")
  out.push(
    "Section 4 names tools by their Claude Code names. This table is the translation: " +
      "call the harness tool on the right, with the parameter spelling on the right. " +
      "Nothing in this session answers to the Claude Code names literally.",
  )
  out.push("")
  out.push("**Direct translations**")
  for (const e of TOOL_MAP.aliased) out.push(line(e))
  out.push("")
  out.push("**Same intent, different shape**")
  for (const e of TOOL_MAP.emulated) {
    out.push("- " + e.upstream + " -> " + e.harness + ". " + e.note)
  }
  out.push("")
  out.push("**Not available in this session**")
  for (const e of TOOL_MAP.missing) out.push("- " + e.upstream + ". " + e.note)
  out.push("")
  out.push(
    "When the capability you want is listed as unavailable, use the nearest native tool, say which one you used, " +
      "and never describe an unavailable tool call as done.",
  )
  return out.join("\n")
}