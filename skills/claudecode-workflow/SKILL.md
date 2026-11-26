---
name: claudecode-workflow
description: Run work the way Claude Code runs it — explore before editing, decide one action at a time, verify before reporting. Use when the user asks to work "like Claude Code", when a task needs the Claude Code loop rather than the Harness workflow, or when a delegation to the claude or codex CLI has to be prepared.
---

# Claude Code workflow

This skill is the portable form of the Agent-ClaudeCode mode: the same loop, usable from a
session that is not in that mode, and readable as the reference for what the mode promises.

## 1. When to load it

- The user names Claude Code, or asks for its working style.
- A task is big enough that "just start editing" is the wrong move.
- You are about to delegate to an external coding-agent CLI and need the brief shape.

## 2. The loop

1. **Orient.** Read the working directory, the files the request names, and whatever
   establishes conventions. No guessing at file names, APIs or test commands.
2. **Decide one action.** Not ten in prose, then blind execution. Decide, act, read.
3. **Act with the smallest capable tool.** Independent reads and searches go out in one
   parallel batch; anything that depends on an earlier result goes later.
4. **Observe.** Exit codes, error text, truncated output, actual content. An unexpected
   result is information.
5. **Adapt.** Revise the plan, update the todo list if the shape changed. Two identical
   failures means change the approach and say what changed.
6. **Verify.** The narrowest check that would fail if you were wrong, then the cheap broader
   one. Read the failure rather than rerunning.
7. **Report.** What changed, where, what you verified, what is still uncertain.

## 3. House rules that come with the loop

- Read before you edit; the edit tool fails on a non-unique target, so include context or use
  replace_all deliberately.
- No speculative abstraction. No error handling for states that cannot occur. No comments
  that restate the code.
- Dedicated tool over shell: read/edit/write/glob/grep, not cat/sed/echo/find/grep.
- Exactly one todo item in_progress. Mark it completed the moment it is done.
- Do not narrate every step, and do not promise work you could have done instead.

## 4. Delegating to an external agent

A delegation brief must be self-contained, because the external agent never sees this
conversation. Include:

- the goal, in one sentence;
- the absolute paths that matter, and the paths that must not be touched;
- the constraints (style, dependencies, files that are off limits);
- the checks it must run before it stops;
- what to return (the change summary and the paths, not a transcript).

Then, on return: inspect the diff yourself and run the checks yourself. Its report is a
claim, not a result.

## 5. Failure modes this skill exists to prevent

| Failure | What it looks like | Fix |
| --- | --- | --- |
| Blind edit | Editing a file you never read | Orient first, always |
| Plan theatre | A long plan, then unrelated edits | One decision per step |
| Retry loop | Same command, same failure, three times | Diagnose, change approach, say so |
| Fake green | "All tests pass" with no run | Run it or say you did not |
| Guessed paths | Invented file names in a patch | Search before you write |
| Silent downgrade | Delegating to dodge a decision | Decide from inspection |