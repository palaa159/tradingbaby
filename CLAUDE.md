# Alpha Academy — working agreement

Project spec: [REQUIREMENTS.md](./REQUIREMENTS.md) (Thai, living document).
Phase plan: [docs/PHASE1.md](./docs/PHASE1.md).

## Stack

- Runtime **Bun**. `bun install`, `bun test`, `bun run typecheck`, `bun run cycle`.
- TypeScript 7, strict, `exactOptionalPropertyTypes`. No `Math.random` / wall-clock
  reads inside anything replay-critical — determinism is a product requirement.
- No parameter properties in classes (`constructor(private x)`) — Bun strips types
  only; declare fields explicitly.

## Output style

Caveman **ultra** is enforced by hooks in `.claude/settings.json` and re-injected
every turn. See `.claude/skills/caveman/SKILL.md` to switch or disable.

---

# Coding guidelines

Adapted from [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
— four failure modes LLMs fall into, and the rule for each.

## 1. Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions out loud before acting on them.
- When a request has more than one reading, present the readings — do not silently
  pick one.
- When confused, name the confusion. Stopping to ask beats guessing and rewriting.

## 2. Simplicity first

**Minimum code that solves the problem. Nothing speculative.**

- No features that were not requested.
- No abstraction until there is a second caller.
- No error handling for failures that cannot happen here.
- Fewer lines that do the job beats more lines that anticipate a future.

## 3. Surgical changes

**Touch only what you must. Clean up only your own mess.**

- Every changed line traces back to the request.
- Match surrounding style; do not reformat code you did not need to touch.
- Pre-existing dead code: mention it, leave it.

## 4. Goal-driven execution

**Define success criteria. Loop until verified.**

- Before implementing, state what "done" looks like and how it will be checked.
- Multi-step work gets a short plan with verification checkpoints.
- Run the check. Report the real result, including failures.

## Working

Signals these are being followed: diffs contain no unrelated changes, no rewrites
caused by overengineering, and clarifying questions arrive *before* the wrong
implementation rather than after.
