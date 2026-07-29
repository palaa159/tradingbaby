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

## P2 — Backtest + hypothesis loop (done)

- [x] Backtest runner walking history bar by bar through the *same* evaluator the
      live engine uses — at bar i the strategy sees only `candles[0..i]`, so there
      is no lookahead. Fees charged per side; drawdown tracked on equity
- [x] `buyAndHold()` benchmark over the identical window and fees — the ruler
      Alpha Score is measured against (spec §7)
- [x] `judge()` owns confidence: a student cannot hand-set belief, only produce
      results that move it. Adoption moves confidence halfway toward certainty,
      never all the way — one good window is not proof
- [x] Guards that keep verdicts honest: fewer than 5 trades stays `testing`
      (no evidence, not a failure); a drawdown past 40% debunks regardless of
      return; beating the market is the bar, not making money

**Measured behaviour** (deterministic synthetic regimes, 400 bars each):

| Market | Strategy | Benchmark | Alpha | Verdict |
|---|---|---|---|---|
| Strong uptrend | +5.59% (2 trades) | +121.85% | −116.26% | `testing` — only 2 trades, no sample to judge |
| Sideways chop | +26.22% (9 trades) | +0.90% | +25.32% | `adopted`, confidence 0.4 → 0.7 |

The dip-buying rule loses badly to doing nothing in a trend and wins clearly in
chop — the classic mean-reversion lesson, produced by the machinery rather than
asserted. Note the uptrend case: the strategy barely traded, so the min-trades
guard correctly refuses to conclude anything from it.

Still open: wiring `judge()` into the student's graph so verdicts update the
`hypothesis` node's confidence and status with the backtest as linked evidence
(needs the student-facing tool, arrives with P3).

## P3 — Paper trading + guardrails (done)

- [x] Paper portfolio derived from fills, never stored separately — replay the
      fills and you get the state, the same way replaying the event log gives you
      a brain. Average cost basis with fees, realized/unrealized split, and
      selling more than held closes out rather than flipping short
- [x] Guardrail engine: max position size, max daily loss, spot-only, kill switch.
      **Size violations clamp, hard violations refuse** — a strategy asking 50%
      when the house allows 20% still trades, at 20, and the trace says it was
      clamped. There is no smaller version of "shorting", so those are refused
- [x] Refusals are persisted too: `blocked_orders` keeps what the rules stopped,
      so the maker sees the near-misses and not just the fills
- [x] Decision traces: every fill records its strategy version and rule. From
      there the chain completes itself — the strategy carries the hypotheses it
      was compiled from, and those carry sources and lessons in the graph
- [x] `tick()` composes it all with no LLM in the path (spec §6.2): free to run,
      always decides the same way

**Measured** (230 ticks over a deterministic oscillating market):

| Metric | Result |
|---|---|
| Fills | 9 |
| Clamped by house rules | 5 (50% request → 20%) |
| Blocked outright | 0 |
| Portfolio | 1000 → 966.48 (−3.35%), fees 1.77 |
| Replay check | 230 evaluations, 0 mismatches |

The strategy lost money, and the system says so — no flattery. That is exactly
the input `judge()` needs to debunk it.

## P4 — Metabolism v2 (done)

- [x] `settle()` turns realized P&L into energy, counting only what was booked
      since the last settlement — a student cannot farm energy by having its
      books read twice
- [x] Suspension enabled (`suspensionEnabled: true` from this phase): at zero
      energy, strategies are retired and holdings closed at last known price so
      nothing drifts unattended. **The knowledge graph is never touched** —
      a suspended student keeps every note, edge, and diary entry
- [x] Only the maker can `revive()` a student, never the student itself (spec §3.4)
- [x] `cycleBudget()` makes hunger cost thinking: well-fed gets the full budget,
      hungry gets half, starving gets `MIN_DAILY_CYCLES` — never zero while alive

**Measured** — the two paths that matter:

| Losing streak | Recovery from near-death |
|---|---|
| 900 → 740 → 580 → **420 hungry (2 cycles)** → 260 → **100 starving (1 cycle)** → **0 suspended** | 100 → 60 → **20 starving (still 1 cycle)** → 100 → **220 hungry** → 420 |

The second column is the point. At 20 energy the student still got a cycle, and
its active strategies kept trading at zero AI cost, so good rules could feed it
back to health. Without the floor, hunger would remove the very ability to fix
the strategies causing the hunger — pressure with no exit is just a trap.

## P5 — Benchmark bot + Alpha Score (done)

- [x] The benchmark student ("เด็กบ้านเรียน"): buys the universe in equal weights
      on the first tick the student sees the market, pays the same fees, and never
      thinks again. Opened once and never re-opened — the ruler must not move
- [x] `alphaReport()`: student return minus benchmark return over the same window
      and the same starting cash, with a verdict of ชนะ/แพ้/เสมอตลาด
- [x] `price_marks` table — the engine records every price it saw, so the
      dashboard values portfolios with no network call and valuation stays
      reproducible offline
- [x] Dashboard: Alpha Score on every classroom card (green above the market, red
      below), plus a new **เทรดและสูตร** view with the strategy shelf, the fills,
      and the orders the house rules refused

**Measured** — 270 ticks across two symbols, seeded onto มะลิ's Phase 1 brain:

| | |
|---|---|
| Fills | 21 (many clamped 40% → 20%) |
| มะลิ's return | **+0.76%** |
| Benchmark | **+25.14%** |
| **Alpha** | **−24.38% → แพ้ตลาด** |

She made money and still failed, which is the entire point of grading on alpha:
a rising market pays everyone, and only the difference is hers. The dashboard
shows the whole chain behind each fill — rule fired → strategy version → the
hypothesis it was compiled from → the guardrail that resized it.

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
