---
name: caveman
description: Switch or inspect caveman output-compression mode (ultra/full/lite/off). Use when the user types /caveman, says "caveman mode", "talk like caveman", "fewer tokens", "compress output", "stop caveman", or "normal mode". Caveman ultra is enforced by default in this repo via SessionStart and UserPromptSubmit hooks.
---

# Caveman mode

Compresses assistant output ~65% by dropping filler while keeping every technical
fact verbatim. Inspired by https://github.com/JuliusBrussee/caveman.

## How it is enforced here

Not a per-session opt-in. Two hooks in `.claude/settings.json` re-inject the active
mode's instructions into context on **every** turn:

- `SessionStart` — active from message one, no `/caveman` needed
- `UserPromptSubmit` — re-injected each turn so it never decays mid-session

Both run `.claude/hooks/caveman-inject.sh`, which reads `.claude/caveman-mode` and
emits the matching `.claude/hooks/caveman/<mode>.md` as `additionalContext`.

## Switching mode

Write one word to `.claude/caveman-mode`, then confirm to the user. Takes effect on
their next message (the `UserPromptSubmit` hook reads the file fresh each turn).

| Mode | Effect |
|---|---|
| `ultra` | Max compression. Strip conjunctions, one word when one word enough. **Default here.** |
| `full` | Drop articles and filler, fragments allowed, keep logical conjunctions. |
| `lite` | Cut hedging and filler only. Complete sentences kept. |
| `off` | Hook exits silently, no compression injected. |

```sh
printf 'lite\n' > .claude/caveman-mode   # example: soften to lite
```

`/caveman` with no argument: report the current mode (`cat .claude/caveman-mode`)
and list the options. Do not change anything.

## Rules that survive every mode

- Code, commands, flags, file paths, API names, error strings, numbers, URLs stay verbatim.
- No invented abbreviations (`cfg`, `impl`, `req`, `fn`) — zero tokens saved, reader still decodes.
- No arrow chains (`A → B → fails`). Words instead.
- Keep the user's language. Thai in, caveman Thai out.
- Compression suspends for security warnings, irreversible-action confirmations, and
  multi-step sequences where fragment order creates ambiguity.

## Editing the wording

Mode prompts are plain markdown in `.claude/hooks/caveman/`. Edit those files to tune
tone; no code change needed.
