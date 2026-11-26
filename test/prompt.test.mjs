import test from "node:test"
import assert from "node:assert/strict"

import { buildPersona, IDENTITY } from "../lib/prompt.js"
import { TOOL_MAP, renderToolContract } from "../lib/toolmap.js"
import { personaText } from "../lib/workflow.js"

test("the identity is Claude Code's, not the harness default", () => {
  assert.match(IDENTITY, /^You are Claude Code/)
  assert.ok(!/coding agent powered by/i.test(IDENTITY))
})

test("the first substantive section declares the harness workflow offline", () => {
  const text = buildPersona({})
  const contract = text.indexOf("Mode contract")
  assert.ok(contract > 0)
  assert.ok(contract < text.indexOf("# System"))
  assert.match(text.slice(contract, contract + 900), /Harness workflow is offline|is \*\*not loaded\*\*/)
})

test("the ported sections are present and in the Claude Code order", () => {
  const text = buildPersona({})
  const order = [
    "# System",
    "# Doing tasks",
    "# Executing actions with care",
    "# Using your tools",
    "## The todo list",
    "# Tone and style",
    "# Output efficiency",
    "# The agentic loop",
    "# Context management",
    "# Delegation",
    "# Plan mode",
    "# Git protocol",
    "# Verification and honest reporting",
    "# Execution backends",
  ]
  let cursor = 0
  for (const heading of order) {
    const at = text.indexOf(heading)
    assert.ok(at > cursor, `${heading} must appear after the previous section`)
    cursor = at
  }
})

test("product surface that does not exist here is not advertised", () => {
  const text = buildPersona({})
  for (const banned of ["/help", "/issue", "/share", "dangerouslyDisableSandbox", "x-anthropic-billing-header"]) {
    assert.ok(!text.includes(banned), `${banned} must not be in the ported prompt`)
  }
})

test("the tool contract renders every mapped tool with its harness target", () => {
  const contract = renderToolContract()
  for (const entry of TOOL_MAP.aliased) {
    assert.ok(contract.includes(entry.upstream), `missing upstream ${entry.upstream}`)
    assert.ok(contract.includes(entry.harness), `missing harness ${entry.harness}`)
  }
  assert.ok(contract.includes("Not available in this session"))
})

test("the full persona stays inside a sane size and carries the environment block", () => {
  const text = personaText({})
  assert.ok(text.length > 15000 && text.length < 60000, `persona is ${text.length} chars`)
  assert.ok(text.includes("ops_read_files"))
  assert.ok(text.includes("claudecode_backend"))
})