# Phase 2 — "ภาคปฏิบัติ" Build Plan

Goal (REQUIREMENTS.md §12): students stop only reading and start *doing* —
hypotheses tested, strategies authored, paper trades executed, alpha measured.

Order matters: everything below leans on the strategy engine, so it goes first.

## P1 — Deterministic strategy engine (done)

The hard requirement from spec §6.2: the LLM never places an order. It authors
versioned rule programs; only this engine executes them, identically every time.

- [x] Strategy DSL types — entry conditions ANDed, exit ORed; operands are
      indicators or numbers; ops include `crosses_above` / `crosses_below`
- [x] Pure indicators over candles: price, volume, sma, ema, Wilder rsi
- [x] Evaluator: (candles + position + portfolio) → orders. No clock, no
      randomness, no I/O. Records the indicator readings that drove the decision
- [x] Immutable versioning: re-activating a name mints v(N+1) and retires the
      previous version, which stays readable so old decisions stay explainable
- [x] Every evaluation stores its exact input; `verifyReplay()` re-runs them all
      and reports mismatches — the reproducibility contract as an executable check

Still open: a zod schema so student-authored JSON is validated at the tool
boundary (needed once students actually author specs in P2).

## P2 — Backtest + hypothesis loop

- [ ] Backtest runner over historical candles using the same evaluator
- [ ] Hypothesis lifecycle: untested → testing → adopted / debunked, with evidence
- [ ] Confidence updated from results, never hand-set

## P3 — Paper trading + guardrails

- [ ] Paper portfolio: positions, fills, realized/unrealized P&L
- [ ] Guardrail engine: max position size, max daily loss, spot-only, kill switch
- [ ] Decision traces linking every fill to the strategy version and its knowledge

## P4 — Metabolism v2

- [ ] Realized P&L feeds energy; suspension enabled
- [ ] Guaranteed minimum daily cycle so a starving student can eat its way back

## P5 — Benchmark bot + Alpha Score

- [ ] Buy-and-hold benchmark over the same universe and window
- [ ] Alpha Score = student return − benchmark return, per window
- [ ] Leaderboard surfaced on the dashboard

## P6 — School sessions

- [ ] Paired conversation cycles, transcripts stored as `conversation` nodes
- [ ] Hearsay enters at low confidence with a `heard_from` edge; must be re-proven

## P7 — Exams + report card

- [ ] Question generation from recent real market situations
- [ ] Separate AI judge session, rubric scored, answer key from what the market did
- [ ] Report card view

## Working agreement for this phase

`bun run typecheck` and `bun test` stay green at every commit. Determinism is a
product requirement, not a style preference: no `Math.random`, no wall-clock reads
inside anything the replay path touches.
