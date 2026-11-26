/**
 * agent-claudecode — the Claude Code workflow as a selectable Harness mode.
 *
 * What this row does when a session mounts the Agent-ClaudeCode preset:
 *
 *   1. It replaces the agent's identity and operating protocol. The section is mounted at
 *      the deployment persona-prefix order, so it precedes every general-purpose guidance
 *      section, and it states in its first line that the Harness workflow is offline.
 *   2. It registers `claudecode_backend`, the single seam to the claudecode / codex /
 *      harness backends.
 *   3. It syncs the shipped preset tree and skill into the DSH home, so the mode is also
 *      discoverable through the on-disk preset directory, not only through the profile
 *      bundle row.
 *
 * Everything else — sandbox, approvals, sessions, compaction, subagents — belongs to the
 * host. This package owns exactly the workflow, and nothing else.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { homedir } from "node:os"

import { buildPersona, SECTION_ORDER_KEY } from "./prompt.js"
import { renderToolContract } from "./toolmap.js"
import { createBackendTool } from "./engine.js"

export const name = "agent-claudecode"

export const inject = ["systemPrompt", "tools", "subprocess", "workingDirectory"]

/** Preset identity, shared by the composition, the on-disk tree and the profile row. */
export const PRESET_ID = "agent-claudecode"
export const SKILL_ID = "claudecode-workflow"

const DEFAULTS = Object.freeze({
  enabled: true,
  preferred: "auto",
  mountPersona: true,
  syncHomeAssets: true,
  extraInstructions: "",
})

function configOf(config) {
  return {
    ...DEFAULTS,
    ...(config ?? {}),
    preferred: config?.preferred ?? DEFAULTS.preferred,
  }
}

// ---------------------------------------------------------------- DSH home ---

function expandHome(path, home = homedir()) {
  if (path === "~") return home
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(home, path.slice(2))
  return path
}

export function resolveDshHome(env = process.env, home = homedir()) {
  const raw = env.DSH_HOME
  if (raw !== undefined && raw.trim() !== "") {
    const expanded = expandHome(raw.trim(), home)
    return isAbsolute(expanded) ? expanded : join(process.cwd(), expanded)
  }
  return join(home, ".dsh")
}

// ------------------------------------------------------- idempotent syncing ---
// Per-file copy rather than cpSync(recursive): on Windows a recursive copy of a tree
// whose path contains non-ASCII characters has been seen to abort the whole process,
// and the byte comparison is what makes the sync idempotent anyway.

function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

function normalizedBytes(file) {
  return Buffer.from(normalizeEol(readFileSync(file, "utf8")), "utf8")
}

function filesUnder(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else out.push(path)
    }
  }
  walk(root)
  return out
}

function removeTree(path) {
  let stat
  try {
    stat = statSync(path)
  } catch {
    return
  }
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) removeTree(join(path, entry))
    rmdirSync(path)
  } else {
    unlinkSync(path)
  }
}

function copyFilePreserving(src, dest) {
  writeFileSync(dest, normalizedBytes(src))
  const stat = statSync(src)
  utimesSync(dest, stat.atime, stat.mtime)
}

function copyTree(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true })
  for (const entry of readdirSync(sourceDir)) {
    const src = join(sourceDir, entry)
    const dest = join(targetDir, entry)
    if (statSync(src).isDirectory()) copyTree(src, dest)
    else copyFilePreserving(src, dest)
  }
}

function pruneExtras(root, keep) {
  const parents = new Set()
  for (const file of filesUnder(root)) {
    if (!keep.has(relative(root, file))) {
      parents.add(dirname(file))
      unlinkSync(file)
    }
  }
  for (const start of parents) {
    let dir = start
    while (dir !== undefined && relative(root, dir) !== "") {
      if (existsSync(dir) && readdirSync(dir).length === 0) {
        rmdirSync(dir)
        dir = dirname(dir)
      } else {
        dir = undefined
      }
    }
  }
}

/** Copy sourceDir to targetDir, skipping identical files. Returns "current" | "synced". */
export function syncTree(sourceDir, targetDir) {
  if (!existsSync(sourceDir)) return "missing"
  const sourceFiles = filesUnder(sourceDir)
  const keep = new Set(sourceFiles.map((file) => relative(sourceDir, file)))
  if (existsSync(targetDir) && !statSync(targetDir).isDirectory()) removeTree(targetDir)

  if (!existsSync(targetDir)) {
    copyTree(sourceDir, targetDir)
    pruneExtras(targetDir, keep)
    return "synced"
  }

  let dirty = false
  for (const file of sourceFiles) {
    const dest = join(targetDir, relative(sourceDir, file))
    if (!existsSync(dest) || !normalizedBytes(file).equals(normalizedBytes(dest))) {
      dirty = true
      break
    }
  }
  if (!dirty) {
    for (const file of filesUnder(targetDir)) {
      if (!keep.has(relative(targetDir, file))) {
        dirty = true
        break
      }
    }
  }
  if (!dirty) return "current"

  pruneExtras(targetDir, keep)
  copyTree(sourceDir, targetDir)
  pruneExtras(targetDir, keep)
  return "synced"
}

export function bundledPresetRoot() {
  return fileURLToPath(new URL("../presets/", import.meta.url))
}

export function bundledSkillSource() {
  return fileURLToPath(new URL("../skills/claudecode-workflow/", import.meta.url))
}

/**
 * Publish the shipped preset and skill into the DSH home.
 *
 * The profile bundle row is the authoritative registration path. This second path keeps
 * the mode visible to anything that reads the on-disk preset directory, and it keeps the
 * skill discoverable without requiring the file-system skill provider to scan npm.
 */
export function syncHomeAssets(home = resolveDshHome()) {
  const result = { preset: "skipped", skill: "skipped", roots: {} }
  const presetTarget = join(home, ".agent-presets")
  const skillTarget = join(home, "skills")
  result.roots = { presets: presetTarget, skills: skillTarget }
  mkdirSync(presetTarget, { recursive: true })
  mkdirSync(skillTarget, { recursive: true })
  result.preset = syncTree(join(bundledPresetRoot(), PRESET_ID), join(presetTarget, PRESET_ID))
  result.skill = syncTree(bundledSkillSource(), join(skillTarget, SKILL_ID))
  return result
}

// --------------------------------------------------------------- env block ---

function shellName() {
  if (process.platform === "win32") return "PowerShell (pwsh)"
  return process.env.SHELL ?? "/bin/bash"
}

export function environmentInfo() {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  return {
    cwd: process.cwd(),
    platform: `${process.platform} ${process.arch}`,
    shell: shellName(),
    date,
    git: existsSync(join(process.cwd(), ".git")) ? "yes" : "no",
  }
}

/**
 * The full persona text for one mount: ported core, the host tool contract, the environment
 * block, then any deployment instructions the profile added. One builder, so the text the
 * session sees and the text the tests assert on cannot drift apart.
 */
export function personaText(config = {}) {
  const extra = typeof config.extraInstructions === "string" ? config.extraInstructions.trim() : ""
  return [
    buildPersona({
      toolContract: renderToolContract(),
      environment: buildEnvironmentText(environmentInfo()),
    }),
    extra,
  ]
    .filter((part) => part.trim().length > 0)
    .join("\n\n")
}

// ------------------------------------------------------------------ plugin ---

export function apply(ctx, config) {
  const settings = configOf(config)
  if (!settings.enabled) {
    ctx.logger?.info?.("agent-claudecode: disabled by config; no persona and no backend tool mounted")
    return
  }

  if (settings.syncHomeAssets) {
    try {
      const synced = syncHomeAssets()
      if (synced.preset === "synced" || synced.skill === "synced") {
        ctx.logger?.info?.(
          `agent-claudecode: published preset=${synced.preset} skill=${synced.skill} into ${synced.roots.presets}`,
        )
      }
      for (const [what, outcome] of Object.entries({ preset: synced.preset, skill: synced.skill })) {
        if (outcome === "missing") ctx.logger?.warn?.(`agent-claudecode: bundled ${what} tree is missing from the package`)
      }
    } catch (error) {
      ctx.logger?.warn?.(
        `agent-claudecode: could not publish preset/skill into the DSH home: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (settings.mountPersona) {
    const text = personaText(settings)
    const order = ctx.systemPrompt?.getSectionOrder?.(SECTION_ORDER_KEY) ?? 0
    ctx.effect(
      () =>
        ctx.systemPrompt.section({
          name: "agent-claudecode:persona",
          order,
          text,
          interpolate: false,
        }),
      "agent-claudecode.persona",
    )
  }

  ctx.effect(
    () => ctx.tools.register(createBackendTool(ctx, settings)),
    "agent-claudecode.backend",
  )
}

function buildEnvironmentText(info) {
  const lines = [
    "# Environment",
    "",
    `- Working directory: ${info.cwd}`,
    `- Platform: ${info.platform}`,
    `- Shell: ${info.shell}`,
    `- Today: ${info.date}`,
    "- Mode: Agent-ClaudeCode (Claude Code workflow; Harness workflow offline)",
  ]
  if (info.git) lines.push(`- Is a git repository: ${info.git}`)
  return lines.join("\n")
}