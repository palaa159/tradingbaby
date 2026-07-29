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

### M3 — Persistence
- [ ] SQLite (prototype) with nodes / edges / events tables
- [ ] Event replay → graph state at any timestamp
- [ ] Persist student state (energy, enrollment) between processes

### M4 — Market perception (read-only)
- [x] Free Binance public REST provider behind `MarketDataProvider` interface
- [ ] ccxt provider (swap-in) + resilience when the exchange geo-blocks

### M5 — Dashboard
- [ ] Classroom view: students, energy state, latest diary snippet
- [ ] Brain view: live force-graph, node colors by type, confidence sizing
- [ ] Timeline slider (event-log replay) + diary reader

## Acceptance (spec §12)

Maker opens the dashboard, watches a student's graph grow nodes and links in
near-real-time as it studies, scrubs the timeline back to day 1, and reads the
diary of a growing mind.

## Out of scope for Phase 1

Trading, strategies, guardrails enforcement, suspension, school sessions,
hive library, the Principal, exams. (Phases 2–3.)
