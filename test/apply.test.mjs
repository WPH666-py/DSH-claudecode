import test from "node:test"
import assert from "node:assert/strict"

import * as root from "../lib/index.js"
import { apply, PRESET_ID } from "../lib/workflow.js"

/**
 * A stand-in for the Cordis context. The point of this test is the one thing that cannot be
 * discovered later: whether mounting this plugin throws. A plugin that throws in apply()
 * takes the host down with it at boot, so the mount path is exercised here rather than in
 * the live profile.
 */
function fakeContext() {
  const sections = []
  const tools = []
  const effects = []
  const logs = []
  const ctx = {
    logger: {
      info: (m) => logs.push(["info", m]),
      warn: (m) => logs.push(["warn", m]),
    },
    systemPrompt: {
      getSectionOrder: (key) => {
        assert.equal(key, "DEPLOYMENT_PERSONA_PREFIX")
        return 0
      },
      section: (spec) => {
        sections.push(spec)
        return () => {}
      },
    },
    tools: {
      register: (tool) => {
        tools.push(tool)
        return () => {}
      },
    },
    effect: (fn, label) => {
      const disposer = fn()
      effects.push([label, typeof disposer])
      return () => {}
    },
    subprocess: {},
    workingDirectory: {},
  }
  return { ctx, sections, tools, effects, logs }
}

test("apply mounts the persona section and the backend tool without throwing", () => {
  const { ctx, sections, tools, effects } = fakeContext()
  apply(ctx, { preferred: "auto", syncHomeAssets: false })

  assert.equal(sections.length, 1)
  const [section] = sections
  assert.equal(section.name, "agent-claudecode:persona")
  assert.equal(section.order, 0)
  assert.equal(section.interpolate, false)
  assert.match(section.text, /^You are Claude Code/)
  assert.match(section.text, /Harness workflow is offline/)
  assert.ok(section.text.includes("ops_read_files"))

  assert.equal(tools.length, 1)
  const [tool] = tools
  assert.equal(tool.name, "claudecode_backend")
  assert.deepEqual(tool.parameters.required, ["action"])
  assert.deepEqual(tool.parameters.properties.backend.enum, ["auto", "harness", "claudecode", "codex"])
  assert.equal(typeof tool.execute, "function")

  assert.deepEqual(effects.map(([label]) => label), ["agent-claudecode.persona", "agent-claudecode.backend"])
})

test("the package root row is inert so the persona cannot leak into other modes", () => {
  const { ctx, sections, tools } = fakeContext()
  root.apply(ctx, {})
  assert.equal(sections.length, 0, "the root row must not mount a persona section")
  assert.equal(tools.length, 0, "the root row must not register a tool")
})

test("disabled config mounts nothing at all", () => {
  const { ctx, sections, tools } = fakeContext()
  apply(ctx, { enabled: false })
  assert.equal(sections.length, 0)
  assert.equal(tools.length, 0)
})

test("extraInstructions land after the tool contract", () => {
  const { ctx, sections } = fakeContext()
  apply(ctx, { syncHomeAssets: false, extraInstructions: "REPO RULE: run pnpm lint before commit." })
  assert.ok(sections[0].text.includes("REPO RULE: run pnpm lint before commit."))
})

test("the backend tool reports the harness backend as native and never spawns", async () => {
  const { ctx, tools } = fakeContext()
  apply(ctx, { syncHomeAssets: false })
  const tool = tools[0]
  const result = await tool.execute({ action: "status", backend: "harness" }, { signal: new AbortController().signal })
  assert.equal(result.kind, "native")
  assert.equal(result.available, false)
  assert.equal(result.backend, "harness")
  assert.match(result.message, /native loop|no external process/i)
})

test("running against a missing CLI reports it instead of throwing or installing", async () => {
  const { ctx, tools } = fakeContext()
  ctx.subprocess.resolveExecutable = async () => {
    throw new Error("ENOENT")
  }
  apply(ctx, { syncHomeAssets: false })
  const tool = tools[0]
  const result = await tool.execute(
    { action: "status", backend: "claudecode" },
    { signal: new AbortController().signal },
  )
  assert.equal(result.available, false)
  assert.match(result.message, /not available/)
  assert.ok(result.message.includes("npm install -g @anthropic-ai/claude-code"))
})

test("run without a task is refused before any process resolution", async () => {
  const { ctx, tools } = fakeContext()
  let resolved = false
  ctx.subprocess.resolveExecutable = async () => {
    resolved = true
    throw new Error("ENOENT")
  }
  apply(ctx, { syncHomeAssets: false })
  await assert.rejects(
    () => tools[0].execute({ action: "run", backend: "codex" }, { signal: new AbortController().signal }),
    /requires a non-empty task/,
  )
  assert.equal(resolved, false)
})

test("the preset id this plugin publishes matches the composition id", () => {
  assert.equal(PRESET_ID, "agent-claudecode")
})