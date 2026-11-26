/**
 * Package root — deliberately inert.
 *
 * The profile bundle patch mounts `agent-claudecode` (this entry) as a top-level row, and
 * that row lives at profile scope: it exists once for the whole host, outside any agent
 * session. Anything mounted here reaches **every** session, including sessions that chose
 * the standard mode or any other preset.
 *
 * So this row does nothing at all. The mode's real work is mounted per session, by the
 * `agent-claudecode/workflow` row inside the preset composition, which is what makes the
 * persona appear only after the user selects Agent-ClaudeCode.
 *
 * This split is the difference between "a mode you can choose" and "a mode you are stuck
 * in". Keep the root empty.
 */

export const name = "agent-claudecode"

export function apply() {}