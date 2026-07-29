# Phase 1 — "เปิดเทอม" Build Plan

Goal (from REQUIREMENTS.md §12): watch students learn and their brains grow.
No trading yet. Suspension disabled — hunger is display-only.

## Milestones

### M1 — Core domain (this PR)
- [x] Knowledge graph types: typed nodes/edges per spec §5.2
- [x] Append-only event log with replay (time travel foundation, spec §5.3)
- [x] Metabolism model: energy, burn rates, hunger states (spec §3.4, Phase 1 rules)
- [x] Personality seed: 4 dimensions (spec §3.2)

### M2 — Student engine (done)
- [x] Claude Agent SDK integration (subscription auth, `permissionMode: default` + allowlist)
- [x] Student tools: `market_glance`, `graph_read/write/update/link`, `curiosity_queue`, `diary_write`, WebSearch/WebFetch
- [x] Curiosity queue + activity cycles (short cycle / daily review), blank-slate system prompt
- [x] Scheduler (`AcademyBell`): deterministic day plan, per-student caps, quota backoff, skipped-cycle log
- [x] Smoke-tested with a real cycle: student "มะลิ" ran a short cycle, browsed, and wrote 13 events into her brain
- [x] Runtime: **Bun** (`bun test`, `bun src/server/index.ts`) with TypeScript 7 typechecking and latest deps

### M3 — Persistence (done)
- [x] SQLite via `bun:sqlite` (`academy.db`): append-only `events` table as the
      single source of truth, plus `students` for enrollment and energy
- [x] Event replay → graph state at any timestamp, unchanged against persisted events
- [x] Student state (energy, enrollment date) survives between processes;
      personality always re-derived from the seed, never stored
- [x] Proven end-to-end: three real cycles on one database — มะลิ opened cycle 2
      with "สมองมี 9 events", pulled her own question off the queue, researched it,
      wrote a `lesson` ("ห้ามเชื่อ pattern เดียวตาบอด"), and spawned new questions
      from what she learned. Brain now ~19 nodes / 17 edges.

Deliberately not materializing `nodes`/`edges` tables yet: replay is fast at this
scale and the event log is authoritative. Add them when query cost shows up.

### M4 — Market perception (read-only)
- [x] Free Binance public REST provider behind `MarketDataProvider` interface
- [ ] ccxt provider (swap-in) + resilience when the exchange geo-blocks
      (this sandbox gets HTTP 451; students note the outage and study instead)

### M5 — Dashboard (done)
- [x] Classroom view: students, energy bar, hunger pill, traits, node/edge counts
- [x] Brain view: force-directed canvas graph, colour by node kind, radius by
      confidence, `debunked` nodes dimmed with a red ring, click for full detail,
      auto-fit so the whole brain stays framed as it grows
- [x] Timeline slider replaying the event log, plus a play button that animates
      the brain's growth from day one
- [x] Diary reader
- [x] Live: polls every 3s while parked at "now", so growth appears as it happens

`bun run dashboard` → http://localhost:4173 (`--db`, `--port` to override).
Read-only by design (spec §8) — no route mutates anything.

**Stack note:** built on `Bun.serve` plus one self-contained HTML file instead of
the Next.js/React stack sketched in spec §11. The job is "read SQLite, draw a
graph"; Next.js would add a build step and a dependency tree for routing and
components this page does not have. Zero runtime dependencies, no build step.
Revisit if the dashboard grows real routing needs.

## Acceptance (spec §12)

Maker opens the dashboard, watches a student's graph grow nodes and links in
near-real-time as it studies, scrubs the timeline back to day 1, and reads the
diary of a growing mind.

## Out of scope for Phase 1

Trading, strategies, guardrails enforcement, suspension, school sessions,
hive library, the Principal, exams. (Phases 2–3.)
