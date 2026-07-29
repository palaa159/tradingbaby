/**
 * Market cycles (spec §6, rule 9).
 *
 * The academy's real question is not "is this strategy good?" but "when is it
 * good?" — a rule that prints money in a rally and gives it all back in a slide
 * is not one answer, it is two, and reporting a single blended number hides
 * both of them.
 *
 * So every window of history gets a label, and results are reported per label.
 * The classifier is pure and deterministic like everything else the engine
 * runs: same candles, same verdict, forever.
 */

import { backtest, buyAndHold, type BacktestOptions, type BacktestResult } from './backtest.ts';
import type { Candle, StrategySpec } from './types.ts';

export type Regime = 'bull' | 'bear' | 'chop';

export interface RegimeReading {
  regime: Regime;
  /** Net move from the first close to the last, percent. */
  movePct: number;
  /**
   * How much of the distance travelled went in one direction, 0–1. A straight
   * line scores 1; a market that walks a mile and ends where it started scores 0.
   * This is what separates a real trend from a wide, busy range.
   */
  directionality: number;
  /** Typical bar-to-bar move, percent. */
  volatilityPct: number;
  bars: number;
}

export interface RegimeOptions {
  /** A net move smaller than this is not a trend, however tidy it looks. */
  trendThresholdPct?: number;
  /** Below this share of one-way travel, the window is a range however far it moved. */
  minDirectionality?: number;
}

const REGIME_DEFAULTS: Required<RegimeOptions> = {
  trendThresholdPct: 5,
  minDirectionality: 0.3,
};

export function classifyRegime(candles: Candle[], options: RegimeOptions = {}): RegimeReading {
  const opts = { ...REGIME_DEFAULTS, ...options };
  const first = candles[0]?.close ?? 0;
  const last = candles[candles.length - 1]?.close ?? 0;

  if (candles.length < 2 || first <= 0) {
    return { regime: 'chop', movePct: 0, directionality: 0, volatilityPct: 0, bars: candles.length };
  }

  let travel = 0;
  let swing = 0;
  for (let i = 1; i < candles.length; i++) {
    const prev = (candles[i - 1] as Candle).close;
    const close = (candles[i] as Candle).close;
    const step = Math.abs(close - prev);
    travel += step;
    if (prev > 0) swing += step / prev;
  }

  const movePct = ((last - first) / first) * 100;
  const directionality = travel > 0 ? Math.abs(last - first) / travel : 0;
  const volatilityPct = (swing / (candles.length - 1)) * 100;

  const trending =
    Math.abs(movePct) >= opts.trendThresholdPct && directionality >= opts.minDirectionality;
  const regime: Regime = !trending ? 'chop' : movePct > 0 ? 'bull' : 'bear';

  return {
    regime,
    movePct: round(movePct),
    directionality: round(directionality),
    volatilityPct: round(volatilityPct),
    bars: candles.length,
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface RegimeSegment extends RegimeReading {
  /** Index of the first candle, inclusive. */
  from: number;
  /** Index of the last candle, inclusive. */
  to: number;
}

/**
 * Cut history into stretches that behaved the same way. Neighbouring windows
 * with the same label are merged, so a six-month rally reads as one bull run
 * rather than a dozen identical slices — and the merged stretch is reclassified
 * from its own full span, because two adjacent halves can each look like a
 * trend while the whole is a round trip.
 */
export function segmentByRegime(
  candles: Candle[],
  windowBars = 120,
  options: RegimeOptions = {},
): RegimeSegment[] {
  if (candles.length === 0 || windowBars < 2) return [];

  const windows: { from: number; to: number; regime: Regime }[] = [];
  for (let start = 0; start < candles.length; start += windowBars) {
    const end = Math.min(start + windowBars, candles.length) - 1;
    // A trailing stub too short to judge belongs to the stretch before it.
    if (end - start < 1 && windows.length > 0) {
      (windows[windows.length - 1] as { to: number }).to = end;
      continue;
    }
    const reading = classifyRegime(candles.slice(start, end + 1), options);
    const previous = windows[windows.length - 1];
    if (previous && previous.regime === reading.regime) previous.to = end;
    else windows.push({ from: start, to: end, regime: reading.regime });
  }

  return windows.map((window) => ({
    ...classifyRegime(candles.slice(window.from, window.to + 1), options),
    from: window.from,
    to: window.to,
  }));
}

export interface RegimeVerdict {
  regime: Regime;
  /** Stretches of this kind found in the window. */
  segments: number;
  bars: number;
  /** Mean of the strategy's returns across those stretches, percent. */
  returnPct: number;
  /** Mean of buy-and-hold's returns across the same stretches, percent. */
  benchmarkPct: number;
  /** returnPct − benchmarkPct: skill, with the weather subtracted (spec §7). */
  alphaPct: number;
  trades: number;
  /** Bars spent in the market — what makes "it never participated" answerable. */
  barsInPosition: number;
  worstDrawdownPct: number;
}

export interface RegimeReport {
  byRegime: RegimeVerdict[];
  segments: RegimeSegment[];
  /** The regime this strategy earned the most alpha in, if it earned any. */
  bestRegime: Regime | null;
  /** The regime it did worst in — usually the more useful half of the answer. */
  worstRegime: Regime | null;
}

/**
 * Run a strategy separately through each kind of market the window contains.
 *
 * This is the shape of answer the academy is after: not "this rule returned
 * 12%" but "this rule returned 12% in a rally and lost 8% in a slide, and here
 * is how it did against doing nothing in each". Now that students can bet
 * either way, the blended number is worse than useless — a short strategy
 * measured over a full cycle averages its best market against its worst and
 * reports mediocrity in both.
 */
export function alphaByRegime(
  spec: StrategySpec,
  symbol: string,
  candles: Candle[],
  options: BacktestOptions & RegimeOptions & { windowBars?: number } = {},
): RegimeReport {
  const segments = segmentByRegime(candles, options.windowBars ?? 120, options);
  const warmup = options.warmupBars ?? 20;

  const collected = new Map<Regime, { runs: BacktestResult[]; marks: BacktestResult[]; bars: number }>();
  for (const segment of segments) {
    const slice = candles.slice(segment.from, segment.to + 1);
    // A stretch shorter than the warm-up can say nothing about the strategy.
    if (slice.length <= warmup + 1) continue;
    const bucket = collected.get(segment.regime) ?? { runs: [], marks: [], bars: 0 };
    bucket.runs.push(backtest(spec, symbol, slice, options));
    bucket.marks.push(buyAndHold(slice, options));
    bucket.bars += slice.length;
    collected.set(segment.regime, bucket);
  }

  const byRegime: RegimeVerdict[] = [];
  for (const [regime, bucket] of collected) {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const returnPct = mean(bucket.runs.map((r) => r.returnPct));
    const benchmarkPct = mean(bucket.marks.map((r) => r.returnPct));
    byRegime.push({
      regime,
      segments: bucket.runs.length,
      bars: bucket.bars,
      returnPct: round(returnPct),
      benchmarkPct: round(benchmarkPct),
      alphaPct: round(returnPct - benchmarkPct),
      trades: bucket.runs.reduce((sum, r) => sum + r.trades.length, 0),
      barsInPosition: bucket.runs.reduce((sum, r) => sum + r.barsInPosition, 0),
      worstDrawdownPct: round(Math.max(...bucket.runs.map((r) => r.maxDrawdownPct))),
    });
  }

  byRegime.sort((a, b) => b.alphaPct - a.alphaPct);
  // A regime the strategy sat out is not evidence about that regime. Time in
  // the market is the test, not completed trades: a rule with no exit finishes
  // with zero round trips having been fully invested throughout.
  const judged = byRegime.filter((v) => v.barsInPosition > 0);
  return {
    byRegime,
    segments,
    bestRegime: judged[0]?.regime ?? null,
    worstRegime: judged[judged.length - 1]?.regime ?? null,
  };
}

export function describeRegime(regime: Regime): string {
  return { bull: 'ตลาดขาขึ้น', bear: 'ตลาดขาลง', chop: 'ตลาดออกข้าง' }[regime];
}
