#!/usr/bin/env bash
# Injects the active caveman mode instructions into model context.
# Mode is read from .claude/caveman-mode ("ultra" | "full" | "lite" | "off").
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
input="$(cat)"

mode="ultra"
if [[ -f "$here/../caveman-mode" ]]; then
  mode="$(tr -d '[:space:]' < "$here/../caveman-mode")"
fi

if [[ "$mode" == "off" ]]; then
  exit 0
fi

prompt_file="$here/caveman/${mode}.md"
if [[ ! -f "$prompt_file" ]]; then
  exit 0
fi

event="$(printf '%s' "$input" | jq -r '.hook_event_name // empty' 2>/dev/null)"
if [[ -z "$event" ]]; then
  event="UserPromptSubmit"
fi

jq -n --rawfile ctx "$prompt_file" --arg event "$event" \
  '{hookSpecificOutput: {hookEventName: $event, additionalContext: $ctx}}'
