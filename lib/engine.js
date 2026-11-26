/**
 * The `claudecode_backend` tool: one small, explicit seam between the Claude Code
 * workflow and the three execution backends it can run on.
 *
 *   harness     the native Harness tool loop. Nothing is spawned.
 *   claudecode  the Claude Code CLI, `claude -p`, unattended in the session workspace.
 *   codex       the OpenAI Codex CLI, `codex exec`, unattended in the same workspace.
 *
 * Two rules shape the implementation:
 *
 * 1. `status` never starts a process. Checking availability is free and safe, so the
 *    model can ask before it commits to a delegation.
 * 2. A failure is never papered over by silently falling back to another engine. The
 *    model needs to know which agent actually ran, because it has to review that
 *    agent's diff.
 */

import { setTimeout as delay } from "node:timers/promises"

const STDOUT_MAX_BYTES = 256 * 1024
const STDERR_MAX_BYTES = 64 * 1024
const STDOUT_SPILL_BYTES = 4 * 1024 * 1024
const STDERR_SPILL_BYTES = 1 * 1024 * 1024
const DEFAULT_TIMEOUT_SECONDS = 1800

/** Shipped backend manifests. Config may override any field. */
export const BACKENDS = Object.freeze({
  claudecode: Object.freeze({
    id: "claudecode",
    label: "Claude Code CLI",
    kind: "cli",
    commands: Object.freeze(["claude", "claude.cmd"]),
    args: Object.freeze(["-p", "--output-format", "text", "--permission-mode", "acceptEdits"]),
    prompt: "stdin",
    timeoutSec: 1800,
    install: "npm install -g @anthropic-ai/claude-code",
    docs: "https://docs.anthropic.com/en/docs/claude-code/overview",
    note: "Runs claude -p in the session workspace; authentication belongs to the Claude Code CLI.",
  }),
  codex: Object.freeze({
    id: "codex",
    label: "Codex CLI",
    kind: "cli",
    commands: Object.freeze(["codex", "codex.cmd"]),
    args: Object.freeze(["exec", "--full-auto", "--skip-git-repo-check", "{prompt}"]),
    prompt: "arg",
    timeoutSec: 1800,
    install: "npm install -g @openai/codex",
    docs: "https://github.com/openai/codex",
    note: "Runs codex exec in the session workspace; authentication belongs to the Codex CLI.",
  }),
  harness: Object.freeze({
    id: "harness",
    label: "DeepSeek Harness native loop",
    kind: "native",
    commands: Object.freeze([]),
    args: Object.freeze([]),
    prompt: "none",
    timeoutSec: 0,
    install: null,
    docs: null,
    note: "No external process. This mode's own loop, on the host model, with the host tools.",
  }),
})

const CLI_IDS = Object.freeze(["claudecode", "codex"])

export function resolveBackendConfig(config) {
  const merged = {}
  for (const id of Object.keys(BACKENDS)) {
    const base = BACKENDS[id]
    const override = config?.backends?.[id] ?? {}
    merged[id] = Object.freeze({
      ...base,
      ...override,
      id,
      commands: Object.freeze([...(override.commands ?? base.commands)]),
      args: Object.freeze([...(override.args ?? base.args)]),
      prompt: override.prompt ?? base.prompt,
      timeoutSec: override.timeoutSec ?? base.timeoutSec,
    })
  }
  return merged
}

function clampTimeout(value, fallback) {
  const seconds = Number.isInteger(value) ? value : Math.min(fallback || DEFAULT_TIMEOUT_SECONDS, 3600)
  return Math.max(30, Math.min(seconds, 3600))
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function readCollected(reader) {
  if (reader === undefined) return { text: "", lossy: false }
  try {
    const read = reader.readFrom(0)
    return { text: read.text ?? "", lossy: read.lossy === true }
  } catch {
    return { text: "", lossy: true }
  }
}

function formatCommand(argv, stdinText) {
  return argv
    .map((arg) => {
      if (stdinText !== undefined && arg === stdinText) return "<task on stdin>"
      return /[\s"'\\]/.test(arg) ? JSON.stringify(arg) : arg
    })
    .join(" ")
}

function buildArgv(backend, executable, cwd, task) {
  const args = backend.args.map((arg) =>
    String(arg).replaceAll("{cwd}", cwd).replaceAll("{prompt}", backend.prompt === "arg" ? task : ""),
  )
  if (backend.prompt === "arg" && !backend.args.some((arg) => String(arg).includes("{prompt}"))) args.push(task)
  return [executable, ...args]
}

async function resolveExecutable(ctx, backend, signal) {
  const attempts = []
  for (const command of backend.commands) {
    try {
      const executable = await ctx.subprocess.resolveExecutable(command, undefined, signal)
      return { available: true, executable, attempts }
    } catch (error) {
      attempts.push(`${command}: ${errorMessage(error)}`)
    }
  }
  return { available: false, executable: null, attempts }
}

function nativeResult(backend, message) {
  return {
    backend: backend.id,
    backend_label: backend.label,
    kind: "native",
    available: false,
    command: "",
    install: "",
    docs: backend.docs ?? "",
    note: backend.note ?? "",
    message,
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ backends: Record<string, object>, preferred: string }} config
 */
export function createBackendTool(ctx, config) {
  const backends = resolveBackendConfig(config)

  const pickAuto = async (signal) => {
    for (const id of CLI_IDS) {
      const resolved = await resolveExecutable(ctx, backends[id], signal)
      if (resolved.available) return { backend: backends[id], resolved }
    }
    return { backend: backends.harness, resolved: { available: false, executable: null, attempts: [] } }
  }

  const statusOf = async (requested, signal) => {
    if (requested === "harness") return nativeResult(backends.harness, nativeStatusText())
    if (requested === "auto") {
      const chosen = await pickAuto(signal)
      if (chosen.backend.kind === "native") {
        return {
          ...nativeResult(backends.harness, nativeStatusText()),
          message:
            "No external coding-agent CLI was found (looked for " +
            CLI_IDS.join(", ") +
            "). The harness backend runs this mode's loop natively; action=run is not needed.",
        }
      }
      return cliStatus(chosen.backend, chosen.resolved)
    }
    const backend = backends[requested]
    if (backend === undefined) throw new Error(`unknown backend "${requested}"`)
    const resolved = await resolveExecutable(ctx, backend, signal)
    return cliStatus(backend, resolved)
  }

  const cliStatus = (backend, resolved) => ({
    backend: backend.id,
    backend_label: backend.label,
    kind: "cli",
    available: resolved.available,
    command: resolved.available
      ? formatCommand([resolved.executable, ...backend.args], backend.prompt === "stdin" ? "<task>" : undefined)
      : backend.commands.join(" | "),
    install: backend.install ?? "",
    docs: backend.docs ?? "",
    note: backend.note ?? "",
    message: resolved.available
      ? `${backend.label} is available. action="run" starts it in the session workspace.`
      : `${backend.label} is not available.${backend.install ? ` Install it with: ${backend.install}.` : ""} ` +
        "Continue on the native loop; do not install it silently." +
        (resolved.attempts.length > 0 ? ` Looked for: ${resolved.attempts.join("; ")}` : ""),
  })

  const nativeStatusText = () =>
    "The harness backend has no external process. Work directly with the host tools; section 4 of this mode's " +
    "prompt names every one of them."

  return {
    name: "claudecode_backend",
    description:
      "Inspect or invoke the execution backend for the Agent-ClaudeCode mode. " +
      'action="status" reports whether a backend CLI exists without starting it. ' +
      'action="run" delegates one complete, self-contained task to that backend and returns its final output; ' +
      "the external agent edits the same workspace, so review its diff and verify its claims with your own tools. " +
      'backend="harness" needs no run: it is this mode\'s own native loop.',
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: ["status", "run"],
          description: "status inspects; run delegates a task.",
        },
        backend: {
          type: "string",
          enum: ["auto", "harness", "claudecode", "codex"],
          description:
            'Which backend. "auto" picks the first available CLI and falls back to harness. Default: the configured preference.',
        },
        task: {
          type: "string",
          description:
            'Complete, self-contained task for the external agent: goal, absolute paths, constraints, and the checks it must run. Required for action="run".',
        },
        timeout_seconds: {
          type: "integer",
          description: "Optional run timeout in seconds (30-3600).",
        },
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["backend", "backend_label", "kind", "available", "message"],
        properties: {
          backend: { type: "string" },
          backend_label: { type: "string" },
          kind: { type: "string" },
          available: { type: "boolean" },
          command: { type: "string" },
          install: { type: "string" },
          docs: { type: "string" },
          note: { type: "string" },
          exitCode: { type: "integer" },
          signal: { type: "string" },
          stdout: { type: "string" },
          stderr: { type: "string" },
          truncated: { type: "boolean" },
          message: { type: "string" },
        },
      },
      render: (_args, value) => {
        const lines = [value.message]
        if (value.stdout) lines.push("", "--- stdout ---", value.stdout)
        if (value.stderr) lines.push("", "--- stderr ---", value.stderr)
        return [{ type: "text", text: lines.join("\n") }]
      },
    },

    async execute(args, exec) {
      const requested = args?.backend ?? config?.preferred ?? "auto"
      if (args?.action === "status") return statusOf(requested, exec.signal)
      if (args?.action !== "run") throw new Error('action must be "status" or "run"')

      if (requested === "harness") {
        return nativeResult(
          backends.harness,
          "The harness backend is this mode's own loop: do the work now with the host tools instead of delegating.",
        )
      }

      if (typeof args.task !== "string" || args.task.trim().length === 0) {
        throw new Error('action="run" requires a non-empty task')
      }
      if (exec.agent === undefined) throw new Error("claudecode_backend needs an agent Session to resolve the workspace")

      let backend
      let resolved
      if (requested === "auto") {
        const chosen = await pickAuto(exec.signal)
        backend = chosen.backend
        resolved = chosen.resolved
        if (backend.kind === "native") {
          return {
            ...nativeResult(
              backends.harness,
              "No external coding-agent CLI is installed, so the task was not delegated. Do it now with the host tools.",
            ),
          }
        }
      } else {
        backend = backends[requested]
        if (backend === undefined) throw new Error(`unknown backend "${requested}"`)
        resolved = await resolveExecutable(ctx, backend, exec.signal)
      }

      if (!resolved.available) {
        return { ...cliStatus(backend, resolved), kind: "cli", available: false }
      }

      const cwd = await ctx.workingDirectory.ensure(exec.agent, exec.signal)
      const task = args.task.trim()
      const argv = buildArgv(backend, resolved.executable, cwd, task)
      const timeoutSeconds = clampTimeout(args.timeout_seconds, backend.timeoutSec)
      const preview = formatCommand(argv, backend.prompt === "stdin" ? task : undefined)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000)
      const onAbort = () => controller.abort()
      exec.signal.addEventListener("abort", onAbort, { once: true })

      let handle
      let outcome
      let failure
      let timedOut = false
      try {
        handle = ctx.subprocess.spawn({
          argv,
          cwd,
          stdio: {
            stdin: backend.prompt === "stdin" ? { data: task } : "ignore",
            stdout: { maxBytes: STDOUT_MAX_BYTES, spill: { maxBytes: STDOUT_SPILL_BYTES } },
            stderr: { maxBytes: STDERR_MAX_BYTES, spill: { maxBytes: STDERR_SPILL_BYTES } },
          },
          graceMs: 5000,
          signal: controller.signal,
        })
        try {
          outcome = await handle.done
        } catch (error) {
          if (controller.signal.aborted) timedOut = true
          else failure = error
        }
        if (timedOut) {
          handle.terminate()
          await Promise.race([handle.waitForExit().catch(() => {}), delay(15000)])
        }
      } finally {
        clearTimeout(timer)
        exec.signal.removeEventListener("abort", onAbort)
      }

      const stdout = readCollected(handle?.collected?.stdout)
      const stderr = readCollected(handle?.collected?.stderr)
      const exitCode = typeof outcome?.exitCode === "number" ? outcome.exitCode : undefined
      const signal = typeof outcome?.signal === "string" ? outcome.signal : undefined

      const result = {
        backend: backend.id,
        backend_label: backend.label,
        kind: "cli",
        available: true,
        command: preview,
        install: backend.install ?? "",
        docs: backend.docs ?? "",
        note: backend.note ?? "",
        stdout: stdout.text,
        stderr: stderr.text,
        truncated: stdout.lossy || stderr.lossy,
      }
      if (exitCode !== undefined) result.exitCode = exitCode
      if (signal !== undefined) result.signal = signal

      if (timedOut) {
        result.message =
          `${backend.label} did not finish within ${timeoutSeconds}s and was terminated. ` +
          "Inspect any partial changes before retrying."
      } else if (failure !== undefined) {
        result.message = `${backend.label} failed to run: ${errorMessage(failure)}`
      } else if (exitCode === 0) {
        result.message =
          `${backend.label} exited successfully. Its final output is below; review the workspace diff and run the ` +
          "relevant checks yourself before you report the task as done."
      } else {
        result.message =
          `${backend.label} exited with code ${String(exitCode ?? "unknown")}${signal ? ` (${signal})` : ""}. ` +
          "Treat the task as unverified and inspect the output."
      }
      return result
    },
  }
}