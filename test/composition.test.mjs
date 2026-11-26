import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

import { PLUGINS, PRESET } from "../lib/composition.mjs"
import { renderRows, renderPresetManifest } from "../lib/yaml.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const jsTag = { tag: "tag:yaml.org,2002:js", resolve: (v) => ({ __js: String(v) }) }

test("the workflow row is first and the composition owns no duplicate rows", () => {
  assert.equal(PLUGINS[0].name, "agent-claudecode/workflow")
  const ids = PLUGINS.map((row) => row.id)
  assert.equal(new Set(ids).size, ids.length)
})

test("the composition does not mount the harness persona or harness orchestration", () => {
  const names = PLUGINS.map((row) => row.name)
  assert.ok(!names.includes("@deepseek-ai/dsh-persona"), "harness persona must stay unmounted")
  assert.ok(!names.includes("@deepseek-ai/dsh-tool-workflow"), "harness workflow tool must stay unmounted")
  for (const child of PLUGINS.find((row) => row.id === "ac-delegation").config) {
    assert.notEqual(child.name, "@deepseek-ai/dsh-workflow-ptc")
  }
})

/** Every row name, including rows nested inside a `cordis:group` config sequence. */
function allNames(rows) {
  const out = []
  for (const row of rows) {
    if (typeof row.name === "string") out.push(row.name)
    if (Array.isArray(row.config)) out.push(...allNames(row.config))
  }
  return out
}

test("the tools the persona promises are actually mounted", () => {
  const names = new Set(allNames(PLUGINS))
  for (const required of [
    "agent-claudecode/workflow",
    "@deepseek-ai/dsh-tool-fs",
    "@deepseek-ai/dsh-tool-fs-search",
    "@deepseek-ai/dsh-tool-pwsh",
    "@deepseek-ai/dsh-tool-bash",
    "@deepseek-ai/dsh-tool-todo",
    "@deepseek-ai/dsh-tool-ask-user",
    "@deepseek-ai/dsh-tool-subagent",
    "@deepseek-ai/dsh-plan-mode",
    "@deepseek-ai/dsh-skill-filesystem",
  ]) {
    assert.ok(names.has(required), `${required} must be mounted`)
  }
})

test("checked-in artifacts match the composition", () => {
  const patch = readFileSync(root + "cordis.patch.yml", "utf8")
  assert.ok(patch.includes(renderRows([{ id: PRESET.id, name: PRESET.id }], 2).trim().split("\n")[0]))
  assert.ok(patch.includes(`- id: preset-${PRESET.id}`))
  const agent = readFileSync(root + `presets/${PRESET.id}/agent.cordis.yml`, "utf8")
  assert.equal(agent, renderRows(PLUGINS, 0))
  const manifest = readFileSync(root + `presets/${PRESET.id}/preset.yml`, "utf8")
  assert.equal(manifest, renderPresetManifest(PRESET))
})

test("every generated YAML artifact parses and keeps its row ids", () => {
  const agentText = readFileSync(root + `presets/${PRESET.id}/agent.cordis.yml`, "utf8")
  const doc = YAML.parseDocument(agentText, { customTags: [jsTag] })
  assert.deepEqual(doc.errors, [])
  const rows = doc.toJS()
  assert.equal(rows.length, PLUGINS.length)
  assert.deepEqual(rows.map((r) => r.id), PLUGINS.map((r) => r.id))

  const patch = YAML.parseDocument(readFileSync(root + "cordis.patch.yml", "utf8"), { customTags: [jsTag] })
  assert.deepEqual(patch.errors, [])
  const insert = patch.toJS()[0].insert
  assert.equal(insert[0].id, PRESET.id)
  assert.equal(insert[1].config.id, PRESET.id)
  assert.equal(insert[1].config.plugins[0].name, "agent-claudecode/workflow")

  const manifest = YAML.parseDocument(readFileSync(root + `presets/${PRESET.id}/preset.yml`, "utf8"))
  assert.deepEqual(manifest.errors, [])
  const meta = manifest.toJS()
  assert.equal(meta.name, "Agent-ClaudeCode")
  assert.equal(typeof meta.description, "string")
  assert.equal(meta.order, PRESET.order)
})

test("the !!js platform switches are preserved verbatim", () => {
  const agent = readFileSync(root + `presets/${PRESET.id}/agent.cordis.yml`, "utf8")
  assert.ok(agent.includes("disabled: !!js process.platform === 'win32'"))
  assert.ok(agent.includes("disabled: !!js process.platform !== 'win32'"))
})