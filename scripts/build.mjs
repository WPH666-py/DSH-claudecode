#!/usr/bin/env node
/**
 * Generate the two registration artifacts from lib/composition.mjs.
 *
 *   cordis.patch.yml                            profile bundle patch (the authoritative row)
 *   presets/agent-claudecode/agent.cordis.yml   on-disk preset tree
 *   presets/agent-claudecode/preset.yml         display metadata for the on-disk tree
 *
 * `--check` regenerates in memory and fails when a checked-in file is stale, so CI and the
 * prepack script can refuse to publish a package whose rows drifted from the composition.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { PLUGINS, PRESET } from "../lib/composition.mjs"
import { renderRows, renderPresetManifest } from "../lib/yaml.mjs"

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const check = process.argv.includes("--check")

function artifact(name, content, text) {
  return { name, path: join(PACKAGE_ROOT, name), content, text }
}

const patchBody = "- insert:\n" + renderRows([{ id: PRESET.id, name: PRESET.id }, presetRow()], 2)
const presetRowObject = presetRow()

function presetRow() {
  return {
    id: `preset-${PRESET.id}`,
    name: "@deepseek-ai/dsh-agent-preset",
    config: {
      id: PRESET.id,
      order: PRESET.order,
      name: PRESET.name,
      description: PRESET.description,
      plugins: PLUGINS,
    },
  }
}

const artifacts = [
  artifact("cordis.patch.yml", patchBody),
  artifact(`presets/${PRESET.id}/agent.cordis.yml`, renderRows(PLUGINS, 0)),
  artifact(`presets/${PRESET.id}/preset.yml`, renderPresetManifest(PRESET)),
]

let drift = false
for (const item of artifacts) {
  const current = existsSync(item.path) ? readFileSync(item.path, "utf8") : null
  if (current === item.content) {
    console.log(`current  ${item.name}`)
    continue
  }
  drift = true
  if (check) {
    console.error(`stale    ${item.name}`)
    continue
  }
  mkdirSync(dirname(item.path), { recursive: true })
  writeFileSync(item.path, item.content, "utf8")
  console.log(`wrote    ${item.name}`)
}

// Structural self-check: the patch must carry exactly one insert with the preset row, and
// that row must mount the workflow first. A composition that loses its first row ships a
// mode that looks enabled and is not.
const problems = []
if (!patchBody.startsWith("- insert:\n")) problems.push("patch must start with a top-level - insert:")
if (!patchBody.includes(`- id: preset-${PRESET.id}`)) problems.push("patch is missing the preset row")
if (PLUGINS[0]?.name !== "agent-claudecode/workflow") problems.push("the workflow row must be first in the composition")
const ids = new Set()
for (const row of PLUGINS) {
  if (ids.has(row.id)) problems.push(`duplicate plugin row id ${row.id}`)
  ids.add(row.id)
}
if (problems.length > 0) {
  console.error("composition is invalid:\n  - " + problems.join("\n  - "))
  process.exit(1)
}

if (check && drift) process.exit(1)
console.log(
  `ok       preset=${PRESET.id} rows=${PLUGINS.length} artifacts=${artifacts.length}`,
)