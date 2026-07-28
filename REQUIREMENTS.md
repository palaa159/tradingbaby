# TradingBaby — Requirement Specification

> **One-liner:** A trading bot that is *born knowing nothing about trading*. It grows up by
> browsing the internet, forming hypotheses, trying, failing, and learning — while its maker
> watches its brain (a knowledge graph) grow in real time.

---

## 1. Vision & Concept

TradingBaby is **not** a strategy bot. It is an experiment in *machine upbringing*:

- Each bot ("**baby**") starts with only basic instincts — it can read numbers and charts,
  knows that profit is good and loss hurts, and knows how to search for information.
  It has **zero trading knowledge**: no indicators, no strategies, no market beliefs.
- The baby learns **autonomously and curiosity-driven**: it decides what to study next based
  on what confuses it (e.g. "I lost money and don't understand why → go research that").
- Everything the baby learns lives in an external, inspectable **knowledge graph** — the
  baby's "brain". The **maker** (creator/observer) can watch the learning path, the links
  between ideas, and how beliefs strengthen or get debunked over time.
- **Multiple babies run from day one**, each with a different personality seed, growing in
  different directions. The fun is comparing how they turn out.

### Design principles (non-negotiable)

1. **Blank slate, real growth.** No pre-seeded trading knowledge. If the baby "knows" RSI,
   it must be because it read about RSI somewhere and there is a Source node to prove it.
2. **Everything is traceable.** Every trade decision links back to the knowledge nodes that
   justified it. Every node links back to its sources and to the experiences that shaped it.
3. **Beliefs are never deleted.** Wrong beliefs get marked `debunked` with evidence, and
   stay in the graph as history. The maker can see the whole intellectual journey.
4. **The maker observes, never intervenes.** No editing the graph, no teaching, no
   curriculum. The maker only watches (and controls safety guardrails + budgets).
5. **Growth is continuous, not staged.** No discrete "life stages". Maturity is an emergent,
   measurable score — not a gate the maker designs.
6. **DNA: profit is food.** The baby's core drive is survival — realized profit is the only
   food it can eat. Energy fuels thinking and learning; sustained losses mean hunger.
   This is a *real mechanic*, not narrative flavor (see §3.4).
7. **Trades are deterministic, always.** The LLM never places a trade "by feel". It
   *authors* versioned, deterministic strategies; only the strategy engine executes them.
   Same strategy version + same market data ⇒ same decisions, every time (see §6.2).

---

## 2. Actors

| Actor | Description |
|---|---|
| **Baby** (×N) | An autonomous LLM-driven agent with its own identity, personality seed, knowledge graph, diary, and paper portfolio. |
| **Maker** | Human owner. Observes dashboards, sets guardrail/budget config, starts/stops babies. Cannot edit knowledge. |
| **Scheduler** | System component that wakes babies up for their activity cycles. |

---

## 3. The Baby

### 3.1 Innate abilities (and nothing more)

At birth a baby can:
- Perceive market data (prices, candles, volume) as numbers/series.
- Feel **hunger**: profit is food, loss is starvation — the primitive drive behind
  everything it does (§3.4).
- Search and read the internet; read news and social sentiment.
- Write notes (create/update knowledge graph nodes) and write a diary.
- Form hypotheses and ask the system to test them (backtest / paper trade).

At birth a baby does **not** know: any indicator, any strategy, any market structure
concept, or even that "buy low sell high" is a thing. All of that must be acquired.

### 3.2 Personality & diary

- Each baby has a **personality seed** (e.g. cautious vs. impulsive, skeptical vs.
  trusting, risk appetite flavor) that colors its writing voice and curiosity choices.
- After each activity cycle the baby writes a **diary entry** in first person, with
  feelings ("today hurt — I sold in panic and it bounced back").
- Emotions are **narrative only**: they appear in the diary and personality, but are NOT a
  hidden state variable that mechanically alters trade sizing or decisions.

### 3.3 Growth model

- **Continuous growth** — no life stages. Instead the system tracks a set of longitudinal
  metrics (see §7) so the maker can watch maturity emerge.
- Capabilities are the same from day one (learn / hypothesize / paper trade); what changes
  is the quality of the knowledge behind them.

### 3.4 Metabolism — profit is food (the DNA)

Each baby has an **energy meter**, the survival mechanic at the core of its DNA:

- **Eating:** realized P&L converts to energy. Profitable closed trades feed the baby;
  losing trades drain it. (During paper trading, paper P&L feeds the meter — the
  metabolism works identically in paper and real-money modes.)
- **Burning:** every activity cycle costs energy — thinking, browsing, backtesting, and
  daily reviews all consume it. A baby that earns nothing gradually runs down.
- **Maternal milk:** a newborn starts with a finite **milk reserve** (config value) — a
  grace period to learn before it must feed itself. When the milk runs out, trading
  profit is the only food source.
- **Hunger states:** `well-fed → hungry → starving → hibernation`. Hunger reduces the
  energy available for optional cycles (a starving baby studies less and gets duller —
  survival pressure is real). At zero energy the baby enters **hibernation**: frozen,
  brain intact, visible in the nursery as hibernating. The maker may restart it
  (a fresh milk reserve) or archive it.
- **Optional darwinian mode** (config, off by default): hibernation is permanent —
  death. With a multi-baby fleet this turns the nursery into natural selection.
- The maker **cannot hand-feed** a running baby (observe-only holds); energy comes from
  trading alone.
- Hunger state is visible to the baby itself — expect it to show up in diaries and to
  shape what it gets curious about.

---

## 4. Learning System

### 4.1 Allowed knowledge sources

| Source | Description |
|---|---|
| **Internet browsing** | Web search + page reading, chosen by the baby itself. |
| **Own experience** | Every paper trade, win or loss, becomes learning material. |
| **News & social sentiment** | Financial news feeds and social sentiment as both learning material and market context. |

Explicitly **out**: maker-provided books/curriculum (the maker never feeds content).

### 4.2 Curiosity-driven direction

- The baby maintains an internal **curiosity queue**: open questions generated from
  confusion, losses, contradictions between sources, or gaps it notices in its graph.
- Each learning cycle, the baby picks what to study **entirely on its own** from this
  queue. The maker cannot inject topics.

### 4.3 Activity rhythm (cycle-based)

- Babies run in **discrete scheduled cycles**, not a continuous 24/7 loop:
  - **Short cycles** through the day: glance at the market, maybe learn one thing, maybe
    act on a tested hypothesis.
  - **Daily review cycle**: reflect on the day, write the diary entry, update the graph,
    generate new curiosity questions, run the self-quiz (see §7).
- Cycle frequency per baby is config-driven so the fleet fits the LLM budget (§10).

### 4.4 Hypothesis loop (the heart of trial-and-error)

1. **Form** — from reading or experience, the baby states a testable hypothesis
   ("RSI < 30 on 4h candles is a good entry for majors").
2. **Test** — backtest against historical data AND/OR forward-test via paper trades.
3. **Record** — results are written to the Hypothesis node with an evolving
   **confidence score** and links to the evidence (backtest runs, trade journals).
4. **Adopt / Debunk** — high-confidence hypotheses graduate into **deterministic
   strategies** (§6.2): the baby compiles them into executable rule code, which is the
   only thing allowed to place trades. Falsified hypotheses are marked **`debunked`**
   (never deleted) with the evidence attached, and the baby remembers *why* it was wrong.

---

## 5. Knowledge Graph (the brain)

### 5.1 Storage

- **Graph database** (implementation may be a relational DB with node/edge tables — see
  §11) owned by the system, one logical graph per baby.
- Rendered in a **custom web UI** (§8). Obsidian compatibility is not required.

### 5.2 Node types (typed schema)

| Type | Purpose | Key fields |
|---|---|---|
| `Concept` | A piece of understanding ("what is RSI") | title, body, confidence, status |
| `Hypothesis` | A testable belief | statement, confidence, status (`untested` / `testing` / `adopted` / `debunked`), test results |
| `Strategy` | Deterministic, versioned trading rules compiled from adopted hypotheses | rule code/spec, version, status (`active` / `retired`), backtest fingerprint, linked hypotheses |
| `TradeJournal` | One paper trade | symbol, side, size, entry/exit, P&L, reasoning text, linked knowledge |
| `Lesson` | A conclusion drawn from experience | body, source trades/events |
| `Source` | Where knowledge came from | URL/reference, retrieved-at, summary |
| `Question` | An open curiosity item | question text, priority, status |
| `DiaryEntry` | Daily first-person reflection | body, mood, date |

Edges are typed too (e.g. `learned_from`, `supports`, `contradicts`, `debunked_by`,
`compiled_into`, `decided_by`, `spawned_question`). All nodes/edges carry **timestamps**
and belong to exactly one baby.

### 5.3 Time-travel (first-class feature)

- Every node/edge mutation is recorded as an **append-only event log**.
- The UI provides a **timeline slider**: pick any moment and see the graph exactly as the
  baby's brain was at that time; play the growth as an animation ("replay the childhood").

### 5.4 Belief lifecycle

- Beliefs are strengthened/weakened by evidence via confidence scores.
- Falsified knowledge is **marked `debunked` + evidence, never deleted** — the graph is
  also the baby's autobiography.

---

## 6. Trading

| Aspect | Decision |
|---|---|
| Market | **Crypto** (spot only) |
| Execution | **Paper trading** in MVP-era, with an **exchange-agnostic execution interface** so a real-money adapter (e.g. Binance via ccxt) can be added later without refactoring |
| Symbol universe | Maker-configured safe universe (e.g. top 20–50 by market cap); the baby freely chooses what to focus on **within** that universe |
| Timeframe / style | **Discovered by the baby** through experimentation. Hard floor: no sub-minute/HFT behavior (LLM latency + cost make it meaningless) |
| Market data | Free exchange data via **ccxt** (OHLCV, tickers). No paid data in v1 |
| Decision trace | Every order records the strategy version that fired and **links to the graph nodes behind it** ("bought via Strategy #4 v2 ← Hypothesis #12 + Lesson from trade #105") |

### 6.1 Guardrails ("house rules")

- All guardrails are **maker-configurable settings** (not hard-coded), stored per baby or
  fleet-wide. The baby can *see* the rules but can **never modify** them.
- Default set (enabled out of the box, values adjustable):
  - max position size (% of portfolio)
  - max daily loss → auto-pause trading for the day
  - spot only, no leverage/short
  - maker kill switch (pause a baby or the whole fleet instantly)
- Guardrails are enforced **during paper trading too**, so discipline is part of the
  baby's upbringing, not bolted on later.

### 6.2 Deterministic strategy engine (hard requirement)

**Every trade must be deterministic and reproducible.** The division of labor is strict:

- **The LLM never places orders.** Its job is upstream: learn, hypothesize, and
  **author strategies** — deterministic rule programs (e.g. a typed rule spec or sandboxed
  pure function: inputs = market data + portfolio state, outputs = orders).
- **The strategy engine is the only order source.** It evaluates active strategy versions
  against market data on a fixed schedule with no LLM in the loop.
- **Reproducibility contract:**
  - Strategies are **immutable once activated** — a change means a new version.
  - No randomness, no wall-clock reads, no external calls inside a strategy; every input
    (candles, portfolio snapshot, config) is recorded per evaluation.
  - **Replay:** the engine can re-run any strategy version over any recorded data window
    and must byte-for-byte reproduce the original decisions — this powers honest
    backtests, debugging, and the decision-trace UI.
- **Where the baby's "judgment" lives:** in *which* strategies it writes, activates, and
  retires (an LLM-side decision made during activity cycles) — never in per-trade
  discretion. Activation/retirement events are logged like any other graph mutation.

### 6.3 Real-money mode (future, design-for-now)

- Two modes: **auto** (baby trades within guardrails) and **approval** (every order is
  pushed to the maker for confirm/reject before execution).
- Migration path: paper → approval-mode real money (small) → auto.
- Not built in MVP; the execution interface and guardrail engine must make it possible.

---

## 7. Measuring Growth ("is it getting smarter?")

Two measurement tracks, both charted over time per baby:

1. **Trading performance & survival** — P&L, win rate, Sharpe, max drawdown on the paper
   portfolio (rolling windows, so early failures don't drown later progress), plus the
   **energy curve**: how well the baby feeds itself over time (§3.4).
2. **Auto-quiz** — the system periodically generates exam questions from *real current
   market situations* (e.g. "here is yesterday's chart for X — what would you do and
   why?"). Answers are scored (LLM-judged rubric) and stored, producing a longitudinal
   "report card". Quizzes also snapshot which knowledge the baby cited — showing not just
   *that* it improved, but *what knowledge* drove the improvement.

Fleet view: side-by-side comparison of babies on both tracks.

---

## 8. Maker Dashboard (web app)

The product is a **web app** with these views:

1. **Nursery (fleet overview)** — all babies: status, age, **energy/hunger state**,
   portfolio value, latest diary snippet, growth sparklines. Compare babies side by side.
2. **Brain view (per baby)** — interactive knowledge graph: color by node type, size/glow
   by confidence, `debunked` visually distinct. Click a node for full content + history +
   linked evidence. **Timeline slider / replay** (§5.3).
3. **Diary** — chronological diary entries; the emotional narrative of growing up.
4. **Trades & strategies** — paper trade blotter and the strategy roster (versions,
   active/retired, backtest fingerprints); click any trade → the strategy version that
   fired, its recorded inputs, a **replay** button, and the knowledge nodes behind it
   (decision trace §6).
5. **Report card** — quiz scores and performance metrics over time.
6. **Settings (the only write surface)** — guardrail values, symbol universe, cycle
   frequency/budget caps, baby lifecycle (create baby with personality seed, pause,
   archive), kill switch.

Maker interaction is **observe-only** everywhere except Settings.

---

## 9. Multi-Baby Architecture

- The system runs **N babies concurrently from day one** (default fleet: start with 2–3
  within budget).
- Per baby: isolated knowledge graph, diary, paper portfolio, personality seed, config.
- Shared: market data feed, scheduler, execution engine, guardrail engine, dashboard.
- Babies do **not** share knowledge with each other (isolated minds; comparing their
  divergence is the point).

---

## 10. Runtime & Budget

| Aspect | Decision |
|---|---|
| Hosting | Small VPS / cloud instance, runs 24/7 |
| LLM engine | **Claude Agent SDK authenticated with the maker's Claude subscription** (Pro/Max plan login) — no metered API billing. The engine must run within the subscription's rate/usage limits |
| Cost envelope | Subscription fee + small VPS (~$50–150/month total). No per-token spend |
| Usage tiering | Small/fast model (Haiku-class) for routine cycles (market glance, quick notes); large model (Sonnet/Opus-class) for deep work (daily review, hypothesis/strategy authoring, quiz answers) |
| Usage control | Per-baby daily cycle caps in config; the scheduler spreads cycles across the day, backs off when subscription limits are hit, and logs skipped cycles ("baby had a quiet day"). The deterministic strategy engine (§6.2) keeps trading itself at **zero LLM cost** |

---

## 11. Proposed Tech Stack

*(Maker delegated the choice; this is the recommendation with reasoning.)*

- **Language: TypeScript end-to-end** — one language for agent engine, API, and web;
  ccxt has a first-class JS build; the Claude Agent SDK is TypeScript-native.
- **Agent brain: Claude Agent SDK on subscription auth** (decided, §10) — tool-use loops
  for browsing, note-writing, hypothesis testing, and strategy authoring; custom tools
  exposed to the agent: `market_data`, `graph_read/write`, `run_backtest`,
  `author_strategy`, `diary_write`.
- **Strategy engine: deterministic evaluator** for baby-authored strategies — a typed
  rule spec (preferred) or sandboxed pure functions (e.g. isolated-vm) with recorded
  inputs and replay support (§6.2). No LLM calls at evaluation time.
- **Backend: Node.js worker + scheduler** (cron-style cycles per baby) + REST/WS API.
- **Database: PostgreSQL** (or SQLite for the very first prototype) with `nodes`,
  `edges`, and an append-only `events` table — this *is* the graph DB and gives
  time-travel for free by replaying events. A dedicated graph DB (Neo4j) is not needed
  at this scale.
- **Web: Next.js + React**; graph rendering with a force-graph/WebGL library
  (e.g. `react-force-graph` / sigma.js); charts for metrics.
- **Market data & execution: ccxt** behind an internal `ExecutionEngine` interface with
  `PaperExchange` (MVP) and later `LiveExchange` implementations.
- **Deploy: Docker Compose on a small VPS.**

Alternative considered: Python engine (stronger backtest ecosystem) + TS frontend —
rejected for v1 to keep one codebase; revisit if backtesting needs outgrow JS tooling.

---

## 12. Phased Delivery

### Phase 1 — "It's alive" (MVP)

**Goal: watch a baby learn and its brain grow. No trading yet.**

- 1–3 babies with personality seeds, cycle scheduler, per-baby cycle caps
  (Agent SDK + subscription auth from day one).
- Learning loop: curiosity queue → internet browsing → typed nodes/edges into the graph.
- Market perception (read-only ccxt data) so learning has real context.
- Diary writing.
- **Metabolism v1**: energy meter + milk reserve burning down with activity (no feeding
  yet — trading arrives in Phase 2, so the milk clock creates urgency to learn).
- Dashboard: nursery (with energy state), brain view with **live graph growth**,
  timeline slider, diary view.

**MVP acceptance:** maker opens the dashboard, watches a baby's graph gain nodes and
links in near-real-time as it studies, scrubs the timeline back to day 1, and reads the
diary of a growing mind.

### Phase 2 — "First steps" (trial-and-error)

- Hypothesis loop with backtesting + confidence scores + debunk lifecycle.
- **Deterministic strategy engine** (author → activate → evaluate → replay, §6.2).
- Paper trading + guardrail engine + decision traces.
- **Metabolism v2**: paper P&L feeds the energy meter; hunger states + hibernation live.
- Trades & strategies view; auto-quiz + report card.

### Phase 3 — "Growing up"

- Fleet comparison analytics; richer sentiment/news ingestion.
- Real-money adapter with approval mode + kill switch (small capital).
- Product-hardening (auth, multi-user) **only if** the experiment deserves it.

---

## 13. Out of Scope (v1)

- Real-money trading (designed-for, not built).
- Leverage, shorting, derivatives.
- Maker teaching/feeding content or editing the graph.
- Baby-to-baby knowledge sharing.
- HFT / sub-minute trading.
- Paid market-data providers.

## 14. Open Questions (park for implementation)

1. Which news/sentiment sources are practical within a $0 data budget (RSS, public APIs)?
2. Quiz scoring rubric details — self-judged vs. separate judge model call.
3. Exact personality-seed dimensions and how strongly they should steer curiosity.
4. Retention policy for the event log at scale (years of replay data).
5. Metabolism tuning: P&L→energy conversion rate, cycle costs, milk reserve size, and
   whether darwinian mode should ever be the default.
6. Strategy authoring format: typed rule DSL (safer, easier to validate/replay) vs.
   sandboxed TypeScript functions (more expressive) — lean DSL first.
