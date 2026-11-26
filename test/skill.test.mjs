import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))

test("the shipped skill has valid frontmatter and stays under the pruner threshold", () => {
  const text = readFileSync(root + "skills/claudecode-workflow/SKILL.md", "utf8")
  assert.ok(text.startsWith("---\n"))
  const end = text.indexOf("\n---", 3)
  const front = text.slice(0, end)
  assert.match(front, /name:\s*claudecode-workflow/)
  assert.match(front, /description:\s*\S/)
  assert.ok(text.length < 8192, `skill is ${text.length} chars; the standard pruner trims past 8192`)
})

test("dsh.plugin.json declares the preset, the skill and the tool", () => {
  const manifest = JSON.parse(readFileSync(root + "dsh.plugin.json", "utf8"))
  assert.equal(manifest.id, "agent-claudecode")
  assert.deepEqual(manifest.contributes.presets, ["agent-claudecode"])
  assert.deepEqual(manifest.contributes.skills, ["claudecode-workflow"])
  assert.deepEqual(manifest.contributes.tools, ["claudecode_backend"])
})

test("package.json exposes the workflow subpath used by the composition row", () => {
  const pkg = JSON.parse(readFileSync(root + "package.json", "utf8"))
  assert.equal(pkg.exports["."], "./lib/index.js")
  assert.equal(pkg.exports["./workflow"], "./lib/workflow.js")
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml")
  for (const required of ["lib", "presets", "skills", "cordis.patch.yml"]) {
    assert.ok(pkg.files.includes(required), `${required} must ship`)
  }
})