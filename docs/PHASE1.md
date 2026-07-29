# Phase 1 — "เปิดเทอม" Build Plan

Goal (from REQUIREMENTS.md §12): watch students learn and their brains grow.
No trading yet. Suspension disabled — hunger is display-only.

## Milestones

### M1 — Core domain (this PR)
- [x] Knowledge graph types: typed nodes/edges per spec §5.2
- [x] Append-only event log with replay (time travel foundation, spec §5.3)
- [x] Metabolism model: energy, burn rates, hunger states (spec §3.4, Phase 1 rules)
- [x] Personality seed: 4 dimensions (spec §3.2)

### M2 — Student engine
- [ ] Claude Agent SDK integration (subscription auth)
- [ ] Student tools: `market_data`, `graph_read`, `graph_write`, `diary_write`, web browsing
- [ ] Curiosity queue + activity cycles (short cycle / daily review)
- [ ] Scheduler with per-student cycle caps and quota backoff

### M3 — Persistence
- [ ] SQLite (prototype) with nodes / edges / events tables
- [ ] Event replay → graph state at any timestamp

### M4 — Market perception (read-only)
- [ ] ccxt price feed for the configured symbol universe
- [ ] Market snapshots available to students as context

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
