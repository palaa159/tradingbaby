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

## P6 — School sessions (done)

- [x] Round-robin pairing rather than random: over one rotation every student
      meets every other exactly once, so no pair drifts into an echo chamber and
      nobody is left out by luck. Deterministic per day, so the school replays
- [x] A session is symmetric — both students speak from their own proven notes
      and both decide what to take from the other, so one meeting moves knowledge
      in both directions
- [x] Hearsay lands as a low-confidence `concept` wired to the `conversation`
      node with `heard_from`, its body prefixed "<ชื่อ>บอกมา — ยังไม่ได้พิสูจน์เอง"
- [x] `HEARSAY_CEILING` caps belief-by-hearsay at 0.35, deliberately below what a
      strategy needs, so hearing a claim can never shortcut proving it. Skeptical
      students land lower still
- [x] `bun run school -- --day=N` runs a full day of class

**Measured** — a real session between มะลิ (20 days of notes) and ภูผา (empty brain):

- มะลิ shared her own lesson: patterns need a confirming candle, volume, and trend context
- ภูผา, brand new, **said so honestly** — "ยังไม่มีอะไรเลย... เพิ่งเริ่มเรียนไปจริงๆ" — rather
  than inventing knowledge. The blank-slate rule held under social pressure
- ภูผา recorded exactly one takeaway at confidence **0.267** (his skepticism 0.397
  against the 0.35 cap), with a `heard_from` edge
- มะลิ recorded **nothing** from ภูผา, correctly — he had nothing to give
- Cost: $0.0757 per session

The asymmetry is the interesting part: knowledge flowed from the experienced
student to the new one, and arrived as something to prove rather than something
to believe.

## P7 — Exams + report card (done)

- [x] Questions cut from price history at a decision point: the student sees the
      context bars, never the horizon. The answer key is simply what the market
      did next, so a confident wrong answer cannot argue its way to a good score
- [x] Two separate sessions (spec §14.2). The student answers with its own brain
      in front of it; the judge sees the question, the answer, and the outcome —
      but never the student's notes, name, or personality, so it grades the
      argument rather than the arguer
- [x] Split scoring: the action score is arithmetic against the outcome, the
      reasoning score is the judge's, and the outcome carries 65% because good
      reasoning that loses money is still a losing answer
- [x] Asymmetric penalties: waiting through a real move scores 55, acting on
      noise 40, taking the wrong side of a real move 10 — only one of those
      actually loses money
- [x] Report card: average, action accuracy, and which notes the student leans on
- [x] `bun run exam -- --questions=N` sits the whole class on one paper

**Measured** — first real sitting, 2 questions × 3 students:

| Student | Average | Action accuracy |
|---|---|---|
| มะลิ (20 days of notes) | 59.5 | 0% |
| ภูผา (one class session) | 59.5 | 0% |
| ข้าวฟ่าง (empty brain) | **63.5** | 0% |

The judge's critiques were specific and fair — *"ไม่วิเคราะห์ shape 113.4, ไม่ดู trend
24 แท่ง (ขาลงชัด), ไม่ตรวจ volume ล่าสุด vs เฉลี่ย 100 — เหตุผลค่อนข้างผิวเผิน"*.

### Open finding: the `wait` floor is too comfortable

Every student answered `wait` on every question, and the correct answer was
`sell` both times. Because waiting scores 55 and honest uncertainty scores well
on reasoning, **a student who knows nothing and always says "I don't know" lands
around 60** — which is how the empty-brained student outscored the one with
three weeks of notes.

That is a real scoring flaw, not a fluke of these six answers. But six answers is
also not enough to fit a curve to, so it is recorded rather than patched: revisit
once there are enough sittings to see whether knowledge ever separates from
caution. Candidate fixes are lowering the `wait` floor, or scoring `wait`
against the drawdown the student avoided rather than a flat constant.

## P8 — Connecting students to the machinery (done)

P1–P5 built an engine students could not reach. They had seven tools — read and
write notes, diary, glance at the market — and no way to author a strategy or
test a belief. `strategy` was not even a node kind they could create. The whole
Learn → **Build** → **Measure** → Repeat middle was reachable only from a script.

- [x] `strategySpecSchema` (zod, `.strict()`) validates student JSON at the tool
      boundary — the debt carried from P1. Unknown fields are rejected rather
      than silently dropped, so a spec that mentions `leverage` cannot look accepted
- [x] `reviewSpec()` warns about specs that parse but say nothing: no exit
      condition, symbols outside the universe, a comparison of two constants
- [x] `test_strategy` tool — backtests across the spec's symbols against
      buy-and-hold on the same window, judges the result, and **writes the verdict
      back onto the hypothesis** with the numbers as a linked `lesson`. This is
      the `judge()` wiring carried from P2
- [x] `adopt_strategy` tool — activates only what the judge adopted. There is no
      argument field; the sole path to activation runs through the backtest
- [x] `MarketDataProvider.history()` for backtest-length data, on both providers
- [x] `strategy` node kind and `compiled_into` edge opened to students

**Measured** — the full loop, end to end on a real database:

| Step | Result |
|---|---|
| Hypothesis created | confidence 0.3, `untested` |
| Backtest | strategy **−4.37%** vs benchmark **+2.04%** → alpha **−6.41%**, 7 trades |
| Verdict | **`debunked`**, confidence 0.3 → **0.09** |
| Written back | hypothesis status and confidence updated; `lesson` node holds the numbers |
| Malformed spec | actionable Thai errors: *"ชื่อสูตรใช้ a-z 0-9 และ - เท่านั้น"*, `sizePct` out of range |
| Activation attempt | **refused** — the judge debunked it, and there is nothing to argue with |

A belief was killed by evidence and the student could not talk its way out.

### Open finding: students form questions, not hypotheses

A real cycle with the new tools available produced three new `question` nodes and
a diary entry — and no attempt to test anything, correctly, because มะลิ holds no
`hypothesis` nodes at all. Her graph is questions, concepts, sources, and lessons.

So the loop is *connected* but not yet *travelled*: nothing in the current prompt
pushes a student from "I wonder about X" to "I claim X, testably". That is the
next gap, and it is a prompt-and-cycle-design problem rather than a missing
mechanism.

---

## Phase 2 complete

All seven pieces shipped. What exists now that did not before: students author
deterministic strategies, test them against history, trade them on paper under
rules they cannot change, feed themselves on the profit, get graded against the
market rather than against zero, teach each other without being able to copy,
and sit exams marked by a judge that never sees who wrote the answer.

Carried forward into Phase 3:
- The `wait` floor in exam scoring (see P7) needs revisiting with more sittings
- Students form questions but not hypotheses (see P8), so the loop is connected
  but not yet travelled — a prompt and cycle-design problem
- ~~`judge()` wiring~~ and ~~strategy schema validation~~ closed in P8

## Working agreement for this phase

`bun run typecheck` and `bun test` stay green at every commit. Determinism is a
product requirement, not a style preference: no `Math.random`, no wall-clock reads
inside anything the replay path touches.

## P9 — Making the loop travelled (done)

P8 connected the machinery; nothing walked through it. The first real brain held
**11 questions and 0 hypotheses** — the prompt taught students to write a question
when confused and never to turn accumulated knowledge into a testable claim.

- [x] `readBrainState()` shows a student its own shape each cycle: counts by kind,
      hypotheses still untested, and whether it has enough solid knowledge to
      commit to a claim but has not committed to one
- [x] The prompt now teaches the distinction directly — a **question** is what you
      do not know, a **hypothesis** is what you dare to claim and can measure —
      with a worked example of the difference
- [x] Cycles adapt: a daily review with enough knowledge and nothing pending asks
      for a hypothesis; a short cycle with something pending switches its main job
      to testing it
- [x] `safe()` wraps tool handlers that touch the network so an exception can
      never escape and kill the in-process MCP bridge

**Measured** — the nudge worked on the first try. มะลิ, whose brain had produced
only questions for three weeks, wrote two hypotheses in one review:

> "ถ้า Hammer ปรากฏในช่วง downtrend พร้อม volume สูงกว่าค่าเฉลี่ย 20 วัน แล้วซื้อ จะชนะการถือเฉย ๆ"
> "RSI(14) ต่ำกว่า 30 บน 1h → ซื้อ → ออกเมื่อ RSI สูงกว่า 70 จะชนะการถือเฉย ๆ"

Both are framed as *beating buy-and-hold* rather than as making money, which is
the alpha framing the prompt teaches. The next short cycle switched to testing
mode on its own.

### The student found two real defects by using the thing

Trying to test those hypotheses, มะลิ recorded, unprompted:

- `[lesson] ระบบทดสอบยังไม่รองรับ candlestick pattern (มั่นใจ 0.8)` — correct. The
  DSL has indicators and comparisons, so Hammer and other shape patterns are
  simply not expressible. A real limitation, discovered by trying to use it
- `[lesson] เครื่องมือ test_strategy ขัดข้อง socket closed (มั่นใจ 0.95)` — a real
  bug. The geo-blocked exchange threw, the exception escaped the MCP handler,
  and the bridge died. Fixed here by `safe()`; the geo-block is environmental
  but the failure mode was ours

She then went and researched RSI and moving averages instead, and formed a third
hypothesis. That is the metabolism and the "never end a cycle empty-handed" rule
doing exactly what they were written for.

Carried to Phase 3: the DSL cannot express candlestick patterns, which is a
genuine gap between what students learn from the internet and what they are
allowed to test.

## P10 — Candlestick patterns, because a student asked (done)

Closing the gap มะลิ found in P9: she learned Hammer, Doji, and Shooting Star
from the internet, wrote a hypothesis about them, and the DSL could not express
any of it. Built exactly what her three real hypotheses need — nothing more.

- [x] Shape patterns as indicators returning 1 or 0 per bar: `hammer`,
      `shooting_star`, `doji`, `engulfing_bullish`, `engulfing_bearish`. They
      compose with the existing comparison operators (`hammer > 0`) rather than
      needing new syntax
- [x] `vol_sma` — average volume over a window, for "volume above its 20-bar
      average", which two of her hypotheses needed
- [x] The schema warns when a pattern is given a `period`, since shapes read one
      bar and the value would otherwise be silently ignored
- [x] Patterns check shape only. "Hammer *in a downtrend*" is left to the student
      to add as a second condition, which keeps each primitive honest about what
      it actually verifies

**Her hypothesis is now expressible**, and validates:

```json
entry: [ hammer > 0, volume > vol_sma(20) ]
exit:  [ rsi(14) > 65 ]
```

### A bug found the same way the student found hers

The first backtest of that strategy fired **zero trades**. The cause was in the
`hammer()` I had just written: it judged the upper shadow against the *body*
(`upperShadow <= body * 0.6`). That breaks precisely where hammers live — a tiny
body makes the threshold tiny, so any upper wick at all disqualifies a textbook
hammer. Shadows are now judged against the bar's **range**, which is what the
classic definition actually means.

After the fix the same strategy fires 7 trades and returns 26.02% against a
benchmark's 141.29% — it works, and it loses to buy-and-hold in a strong
uptrend, which is the same lesson P2 measured and exactly what `judge()` exists
to tell her.

Two regression tests pin the fix: a small-bodied hammer must be detected, and a
bar with long shadows on both sides must not be.

---

# Phase 3 — "โรงเรียนเต็มรูปแบบ"

## H1 — Hive mind: the school library (done)

The hard part of consensus is deciding when two students believe *the same
thing*. Comparing their prose is a trap — they write differently, and a fuzzy
text match fills the library with near-duplicates and false agreement.

The canonical form was already sitting in the codebase. A tested claim here *is*
a strategy spec, and two specs either encode the same rule or they do not. So:

- [x] `claimKey()` — the identity of a claim is its sorted entry and exit
      conditions plus timeframe. Name, symbols, and position size are excluded
      deliberately: those are choices about *applying* a belief, not the belief
- [x] `buildLibrary()` groups every tested claim in the school by that key, one
      vote per student, most recent verdict winning so a student that changed its
      mind does not vote twice
- [x] Consensus needs `max(minVerifiers, majority of the class)` in agreement —
      three verifiers endorse in a class of three, but not in a class of ten
- [x] **Disagreement surfaces at any size.** Two students who tested the same
      rule and reached opposite conclusions is the most interesting thing that
      can happen here, so `disputed` ranks above `endorsed` in the listing
- [x] Agreement that something *fails* is knowledge too — `rejected` is a real
      state, not an absence
- [x] Dashboard **ห้องสมุดกลาง** view and `/api/library`

**Measured** — three students, six claims:

| Consensus | Claim | Who |
|---|---|---|
| `disputed` | rsi(14) < 20 → exit rsi > 80 | มะลิ adopted · ภูผา debunked |
| `endorsed` | rsi(14) < 30 → exit rsi > 70 | มะลิ · ภูผา · ข้าวฟ่าง all adopted, mean alpha +5.37% |
| `insufficient` | rsi(14) < 25 → exit rsi > 75 | ข้าวฟ่าง alone |

The endorsed claim was authored by three students under three different names,
on different symbols, at different position sizes — and the canonical key
correctly recognised it as one belief. One student proving something is not the
school knowing it; that is the whole point of the threshold.

## H2 — The Principal (done, in approval mode)

The caretaker from spec §9.4. Built with its authority deliberately incomplete:
the spec asks this of itself — *"เริ่มด้วยโหมดขออนุมัติก่อน แล้วค่อยปลดเป็น merge
อัตโนมัติเมื่อชุดทดสอบแน่นพอ"* — so `autoMergeGreen` ships **off**.

**Three zones, decided by which files a change touches:**

| Zone | Files | Action |
|---|---|---|
| 🔴 red | guardrails, the evaluator and indicators, the event log, the Principal's own zone rules, anything named for real money | refuse and hand to the maker |
| 🟡 yellow | `server/db/`, metabolism, strategy types, scheduler, trading | write it, open a PR, wait |
| 🟢 green | dashboard, student tools and prompts, market data, tests, docs | merge — **once the maker opts in** |

The red list is not a list of risky files. It is the list of promises this system
makes: guardrails are what stop a student losing the maker's money, the evaluator
is what keeps every past trade explainable, the event log is the students'
memory. A caretaker that can quietly edit those is not a caretaker.

`core/principal/` is red too. An agent that can widen its own permissions has
none. Anything unrecognised is **yellow, never green** — an unknown file is not a
safe file — and a change is as restricted as its most restricted file.

**Health rounds** — each check names a next step, because a check that reports
"something is wrong" without one is just anxiety:

- Replay drift across every recorded evaluation. `broken`, not a warning: if the
  past has stopped reproducing, nothing else matters (contract §9.5)
- Suspended students (`broken` when it is the whole class), students silent for
  more than a day and a half, empty brains, no proven strategies, open requests

**Measured on the real school:**

```
⚠️ ครูใหญ่ออกตรวจโรงเรียน — สรุป: warn
  ✓ ความทำซ้ำได้ของสูตรเทรด: ทุกสูตรรันซ้ำแล้วได้ผลเหมือนเดิม
  ⚠ นักเรียนที่เงียบไป: ข้าวฟ่าง ไม่ได้คิดอะไรมากกว่าหนึ่งวันครึ่ง
  ⚠ สมองว่างเปล่า: ข้าวฟ่าง ยังไม่มีอะไรในสมองเลย
```

Both true: ข้าวฟ่าง was enrolled and never ran a cycle. The Principal found a
real gap on its first round.

`bun run principal -- --classify=<paths>` dry-runs the zone decision, so the
maker can ask "what would you be allowed to do here?" before asking for anything.
