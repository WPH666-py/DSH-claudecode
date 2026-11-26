import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { BACKENDS, resolveBackendConfig } from "../lib/engine.js"
import { syncTree, resolveDshHome, PRESET_ID } from "../lib/workflow.js"

test("the three backends are declared with a real command surface", () => {
  assert.deepEqual(Object.keys(BACKENDS).sort(), ["claudecode", "codex", "harness"])
  assert.equal(BACKENDS.claudecode.prompt, "stdin")
  assert.deepEqual(BACKENDS.claudecode.args, ["-p", "--output-format", "text", "--permission-mode", "acceptEdits"])
  assert.equal(BACKENDS.codex.prompt, "arg")
  assert.ok(BACKENDS.codex.args.includes("{prompt}"))
  assert.equal(BACKENDS.harness.kind, "native")
  assert.deepEqual(BACKENDS.harness.commands, [])
})

test("config overrides a backend without mutating the shipped manifest", () => {
  const merged = resolveBackendConfig({ backends: { codex: { commands: ["codex-cli"], timeoutSec: 120 } } })
  assert.deepEqual(merged.codex.commands, ["codex-cli"])
  assert.equal(merged.codex.timeoutSec, 120)
  assert.deepEqual(BACKENDS.codex.commands, ["codex", "codex.cmd"], "shipped manifest stays frozen")
  assert.equal(merged.claudecode.timeoutSec, 1800)
})

test("DSH home resolution honours the env var and falls back to ~/.dsh", () => {
  assert.equal(resolveDshHome({}, "C:\\home"), join("C:\\home", ".dsh"))
  assert.equal(resolveDshHome({ DSH_HOME: "D:\\data" }, "C:\\home"), "D:\\data")
  assert.equal(resolveDshHome({ DSH_HOME: "~/x" }, "C:\\home"), join("C:\\home", "x"))
})

test("syncTree copies once, then reports current, then repairs drift", () => {
  const base = mkdtempSync(join(tmpdir(), "ac-sync-"))
  try {
    const source = join(base, "source")
    mkdirSync(join(source, "nested"), { recursive: true })
    writeFileSync(join(source, "a.yml"), "a: 1\n")
    writeFileSync(join(source, "nested", "b.md"), "b\n")
    const target = join(base, "target")

    assert.equal(syncTree(source, target), "synced")
    assert.equal(readFileSync(join(target, "a.yml"), "utf8"), "a: 1\n")
    assert.equal(syncTree(source, target), "current")

    writeFileSync(join(target, "nested", "b.md"), "drift\n")
    assert.equal(syncTree(source, target), "synced")
    assert.equal(readFileSync(join(target, "nested", "b.md"), "utf8"), "b\n")

    writeFileSync(join(target, "stray.txt"), "stray\n")
    assert.equal(syncTree(source, target), "synced")
    assert.throws(() => readFileSync(join(target, "stray.txt"), "utf8"))

    assert.equal(syncTree(join(base, "absent"), join(base, "nope")), "missing")
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test("the preset id is stable because sessions persist it", () => {
  assert.equal(PRESET_ID, "agent-claudecode")
})