/**
 * A minimal YAML emitter for the exact shapes this package needs: a sequence of plugin
 * rows, each with scalar fields, an optional `!!js` expression, an optional `isolate` map
 * and an optional `config` that is either a map or a nested sequence.
 *
 * It is deliberately not a general YAML library. The output has to match what the Cordis
 * loader expects, so the generator owns every quoting decision instead of trusting a
 * serializer's defaults.
 */

const PLAIN_SAFE = /^[A-Za-z0-9_./@-][A-Za-z0-9_./@: -]*$/

function scalar(value) {
  if (value === null || value === undefined) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null"
  const text = String(value)
  if (PLAIN_SAFE.test(text) && !/^[-?:,[\]{}#&*!|>'"%@`]/.test(text) && !text.endsWith(" ")) return text
  return '"' + text.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n") + '"'
}

/** A value the loader should evaluate as JavaScript, rendered as `!!js <expr>`. */
export function js(expression) {
  return { __js: String(expression) }
}

function renderValue(value, indent, key) {
  const pad = " ".repeat(indent)
  if (value !== null && typeof value === "object" && !Array.isArray(value) && value.__js !== undefined) {
    return [`${pad}${key}: !!js ${value.__js}`]
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}${key}: []`]
    const allScalar = value.every((item) => item === null || typeof item !== "object")
    if (allScalar) return [`${pad}${key}: [${value.map(scalar).join(", ")}]`]
    const lines = [`${pad}${key}:`]
    for (const item of value) lines.push(...renderSequenceItem(item, indent + 2))
    return lines
  }
  if (value !== null && typeof value === "object") {
    const lines = [`${pad}${key}:`]
    for (const [childKey, childValue] of Object.entries(value)) {
      lines.push(...renderValue(childValue, indent + 2, childKey))
    }
    return lines
  }
  return [`${pad}${key}: ${scalar(value)}`]
}

function renderSequenceItem(row, indent) {
  const pad = " ".repeat(indent)
  const childPad = " ".repeat(indent + 2)
  const lines = [`${pad}- id: ${scalar(row.id)}`]
  for (const [key, value] of Object.entries(row)) {
    if (key === "id") continue
    if (key === "config" && Array.isArray(value)) {
      lines.push(`${childPad}config:`)
      for (const child of value) lines.push(...renderSequenceItem(child, indent + 4))
      continue
    }
    lines.push(...renderValue(value, indent + 2, key))
  }
  return lines
}

/** Render a list of plugin rows as a YAML sequence. */
export function renderRows(rows, indent = 0) {
  const lines = []
  for (const row of rows) lines.push(...renderSequenceItem(row, indent))
  return lines.join("\n") + "\n"
}

/** Render `preset.yml` (name / description / order), quoted so non-ASCII survives. */
export function renderPresetManifest(manifest) {
  const lines = [
    `name: ${scalar(manifest.name)}`,
    `description: ${scalar(manifest.description)}`,
    `order: ${scalar(manifest.order ?? 100)}`,
  ]
  return lines.join("\n") + "\n"
}