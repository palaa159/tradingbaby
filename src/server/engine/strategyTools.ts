/**
 * The steering wheel (Phase 2 P8).
 *
 * P1–P5 built an engine students could not reach: they could write notes about
 * strategies but never author one, and never test a hypothesis against history.
 * These two tools close that gap, and with it the academy's motto — a student
 * can now Learn, Build a rule, Measure it against the market, and Repeat.
 *
 * The important constraint: adoption is not the student's decision. It writes a
 * spec and asks; the backtest and `judge()` decide, and the verdict is written
 * back into its own graph as evidence either way (spec §4.4).
 */

import { backtest, buyAndHold } from '../../core/strategy/backtest.ts';
import { judge, type Verdict } from '../../core/strategy/hypothesis.ts';
import { alphaByRegime, describeRegime, type Regime } from '../../core/strategy/regime.ts';
import { reviewSpec, validateSpec } from '../../core/strategy/schema.ts';
import { directionOf, type StrategySpec } from '../../core/strategy/types.ts';
import type { StrategyStore } from '../db/strategyStore.ts';
import type { MarketDataProvider } from '../marketData.ts';
import { addEdge, addNode, searchNodes, updateNode, type GraphOpsContext } from './graphOps.ts';

export interface TestOutcome {
  ok: boolean;
  errors?: string[];
  /** A spec that would have validated — shown with every rejection. */
  example?: unknown;
  warnings?: string[];
  perSymbol?: {
    symbol: string;
    strategyReturnPct: number;
    benchmarkReturnPct: number;
    alphaPct: number;
    trades: number;
    winRate: number;
    maxDrawdownPct: number;
  }[];
  /**
   * The same run, split by what the market was doing at the time. A single
   * blended number hides the answer the academy is actually after (spec §6,
   * rule 9): not "is this rule good" but "when is it good".
   */
  byRegime?: {
    regime: Regime;
    marketWas: string;
    alphaPct: number;
    strategyReturnPct: number;
    benchmarkReturnPct: number;
    trades: number;
    barsInPosition: number;
  }[];
  bestIn?: string;
  worstIn?: string;
  verdict?: Verdict;
  /** Set when the result was written into the student's graph. */
  recorded?: { hypothesisId: string; strategyNodeId?: string; activatedId?: string };
}

/**
 * The backtest window, in hourly candles — about six weeks.
 *
 * It was 400 (17 days), and at that width the five-trade evidence floor in
 * `judge()` was unreachable for ordinary rules. Measured on BTC/USDT: rsi 30/70
 * traded 2 times, rsi 40/60 four, an sma cross three — every one of them
 * "ยังตัดสินไม่ได้", which is what the school produced for its first day: zero
 * strategies from eighteen cycles. At 1000 the same three trade 5, 11 and 13.
 *
 * 1000 is Binance's per-request cap. Kraken serves 720 for hourly candles and
 * the fallback quietly takes what it gets — a narrower window, still wider than
 * what was there before.
 */
const BARS = 1000;

/**
 * Backtest a spec across its symbols against buy-and-hold on the same window,
 * then judge it. `hypothesisId` ties the result to the belief being tested.
 */
export async function testStrategy(
  ctx: GraphOpsContext,
  market: MarketDataProvider,
  raw: unknown,
  hypothesisId: string | undefined,
): Promise<TestOutcome> {
  const parsed = validateSpec(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, example: parsed.example };

  const warnings = reviewSpec(parsed.spec, [...market.universe()]);
  const spec: StrategySpec = parsed.spec;

  const perSymbol: NonNullable<TestOutcome['perSymbol']> = [];
  let totalAlpha = 0;
  let totalTrades = 0;
  let totalBarsInPosition = 0;
  let worstDrawdown = 0;
  let strategyReturn = 0;
  let benchmarkReturn = 0;

  const tradable = spec.symbols.filter((s) => market.universe().includes(s));
  if (tradable.length === 0) {
    return { ok: false, errors: ['ไม่มีเหรียญไหนอยู่ในรายชื่อที่อนุญาต — ทดสอบไม่ได้'], warnings };
  }

  // Regimes are read from the first tradable symbol's history: the point is
  // when this rule works, and running the split per symbol would multiply the
  // output without changing the answer.
  let regimeReport: ReturnType<typeof alphaByRegime> | null = null;

  for (const symbol of tradable) {
    const candles = await market.history(symbol, BARS);
    const run = backtest(spec, symbol, candles);
    const bench = buyAndHold(candles);
    if (!regimeReport) regimeReport = alphaByRegime(spec, symbol, candles);
    perSymbol.push({
      symbol,
      strategyReturnPct: round(run.returnPct),
      benchmarkReturnPct: round(bench.returnPct),
      alphaPct: round(run.returnPct - bench.returnPct),
      trades: run.trades.length,
      winRate: round(run.winRate),
      maxDrawdownPct: round(run.maxDrawdownPct),
    });
    totalAlpha += run.returnPct - bench.returnPct;
    totalTrades += run.trades.length;
    totalBarsInPosition += run.barsInPosition;
    worstDrawdown = Math.max(worstDrawdown, run.maxDrawdownPct);
    strategyReturn += run.returnPct;
    benchmarkReturn += bench.returnPct;
  }

  const n = tradable.length;
  // Judge on the averaged picture so one lucky symbol cannot carry a bad rule.
  const verdict = judge(
    priorConfidence(ctx, hypothesisId),
    {
      trades: new Array(totalTrades).fill({ pnl: 0 }) as never,
      startingCash: 1000,
      finalValue: 1000,
      returnPct: strategyReturn / n,
      winRate: 0,
      maxDrawdownPct: worstDrawdown,
      barsTested: BARS,
      barsInPosition: totalBarsInPosition,
    },
    {
      trades: [],
      startingCash: 1000,
      finalValue: 1000,
      returnPct: benchmarkReturn / n,
      winRate: 0,
      maxDrawdownPct: 0,
      barsTested: BARS,
      barsInPosition: BARS,
    },
  );

  const outcome: TestOutcome = { ok: true, perSymbol, verdict };
  if (warnings.length) outcome.warnings = warnings;

  if (regimeReport && regimeReport.byRegime.length > 0) {
    outcome.byRegime = regimeReport.byRegime.map((v) => ({
      regime: v.regime,
      marketWas: describeRegime(v.regime),
      alphaPct: v.alphaPct,
      strategyReturnPct: v.returnPct,
      benchmarkReturnPct: v.benchmarkPct,
      trades: v.trades,
      barsInPosition: v.barsInPosition,
    }));
    if (regimeReport.bestRegime) outcome.bestIn = describeRegime(regimeReport.bestRegime);
    if (regimeReport.worstRegime) outcome.worstIn = describeRegime(regimeReport.worstRegime);
  }

  if (hypothesisId) {
    outcome.recorded = { hypothesisId };
    recordVerdict(ctx, hypothesisId, spec, verdict, perSymbol, outcome.byRegime);
  }
  return outcome;
}

/**
 * Activate a spec that earned it. Refuses anything the judge did not adopt —
 * the student cannot argue its way past a backtest (spec §6.2).
 */
export async function adoptStrategy(
  ctx: GraphOpsContext,
  market: MarketDataProvider,
  strategies: StrategyStore,
  raw: unknown,
  hypothesisId: string | undefined,
): Promise<TestOutcome> {
  const result = await testStrategy(ctx, market, raw, hypothesisId);
  if (!result.ok || !result.verdict) return result;

  if (result.verdict.status !== 'adopted') {
    return {
      ...result,
      ok: false,
      errors: [
        `ยังเปิดใช้ไม่ได้ — ผลทดสอบว่า "${result.verdict.status}": ${result.verdict.summary}`,
      ],
    };
  }

  const parsed = validateSpec(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, example: parsed.example };

  const at = ctx.now();
  const activated = strategies.activate(
    ctx.studentId,
    parsed.spec,
    hypothesisId ? [hypothesisId] : [],
    at,
  );

  const node = addNode(ctx, {
    kind: 'strategy',
    title: `สูตร ${parsed.spec.name} v${activated.version}`,
    body:
      `${result.verdict.summary}\n\n` +
      `${JSON.stringify(parsed.spec, null, 1)}\n\nid: ${activated.id}`,
    confidence: result.verdict.confidence,
    links: hypothesisId ? [{ kind: 'compiled_into', toNodeId: hypothesisId }] : [],
  });

  return {
    ...result,
    recorded: { hypothesisId: hypothesisId ?? '', strategyNodeId: node.id, activatedId: activated.id },
  };
}

function priorConfidence(ctx: GraphOpsContext, hypothesisId: string | undefined): number {
  if (!hypothesisId) return 0.3;
  const found = searchNodes(ctx, { kind: 'hypothesis', limit: 100 }).find((n) => n.id === hypothesisId);
  return found?.confidence ?? 0.3;
}

/**
 * Write the verdict back onto the hypothesis, with the numbers attached as a
 * lesson. A debunked belief keeps its node and gains an explanation — the
 * academy never deletes a belief, it annotates it (spec principle 3).
 */
function recordVerdict(
  ctx: GraphOpsContext,
  hypothesisId: string,
  spec: StrategySpec,
  verdict: Verdict,
  perSymbol: NonNullable<TestOutcome['perSymbol']>,
  byRegime: TestOutcome['byRegime'],
): void {
  updateNode(ctx, {
    nodeId: hypothesisId,
    confidence: verdict.confidence,
    status: verdict.status,
  });

  const side = directionOf(spec) === 'short' ? 'เล่นขาลง' : 'เล่นขาขึ้น';
  // The conditions go into the note, not just the number. A lesson that says
  // "this rule works" without saying when is a lesson that will be misapplied.
  const conditions = (byRegime ?? [])
    .map(
      (r) =>
        `${r.marketWas}: alpha ${r.alphaPct}% (สูตร ${r.strategyReturnPct}% · ` +
        `ไม้บรรทัด ${r.benchmarkReturnPct}% · ${r.trades} เทรด)`,
    )
    .join('\n');

  const evidence = addNode(ctx, {
    kind: 'lesson',
    title: `ผลทดสอบสูตร ${spec.name} (${side}): ${verdict.status}`,
    body:
      `${verdict.summary}\n\n` +
      perSymbol
        .map(
          (s) =>
            `${s.symbol}: สูตร ${s.strategyReturnPct}% · ไม้บรรทัด ${s.benchmarkReturnPct}% · ` +
            `alpha ${s.alphaPct}% · ${s.trades} เทรด · ขาดทุนหนักสุด ${s.maxDrawdownPct}%`,
        )
        .join('\n') +
      (conditions ? `\n\nแยกตามสภาพตลาด:\n${conditions}` : ''),
    confidence: 0.9, // the measurement itself is solid, whatever it says
  });

  addEdge(ctx, {
    kind: verdict.status === 'debunked' ? 'debunked_by' : 'supports',
    fromNodeId: hypothesisId,
    toNodeId: evidence.id,
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
