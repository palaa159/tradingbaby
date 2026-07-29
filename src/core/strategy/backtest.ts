/**
 * Backtest runner (Phase 2 P2).
 *
 * Walks history bar by bar, feeding each prefix to the *same* evaluator the
 * live engine uses (spec §6.2). No lookahead: at bar i the strategy sees only
 * candles[0..i]. Deterministic — same candles and spec give the same result
 * forever, which is what makes a hypothesis test evidence rather than an anecdote.
 */

import { evaluate } from './evaluate.ts';
import { directionOf } from './types.ts';
import type { Candle, Position, StrategySpec, TradeDirection } from './types.ts';

export interface BacktestTrade {
  symbol: string;
  direction: TradeDirection;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  returnPct: number;
  entryReason: string;
  exitReason: string;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  startingCash: number;
  finalValue: number;
  /** Total return over the window, percent. */
  returnPct: number;
  winRate: number;
  /** Worst peak-to-trough drop in portfolio value, percent. */
  maxDrawdownPct: number;
  barsTested: number;
  /**
   * Bars spent holding a position. A strategy with no exit rule finishes with
   * zero *completed* trades while having been in the market the whole time, so
   * this is the honest answer to "did it participate at all?".
   */
  barsInPosition: number;
}

export interface BacktestOptions {
  startingCash?: number;
  /** Round-trip cost as a fraction, e.g. 0.001 = 0.1% per side. */
  feeRate?: number;
  /** Bars of history required before the strategy may trade. */
  warmupBars?: number;
}

interface OpenTrade {
  entryTime: number;
  entryPrice: number;
  quantity: number;
  entryFee: number;
  entryReason: string;
}

/**
 * Single symbol, single open position at a time — matches what the DSL can
 * express today. Multi-symbol portfolios arrive with paper trading (P3).
 */
export function backtest(
  spec: StrategySpec,
  symbol: string,
  candles: Candle[],
  options: BacktestOptions = {},
): BacktestResult {
  const startingCash = options.startingCash ?? 1000;
  const feeRate = options.feeRate ?? 0.001;
  const warmup = options.warmupBars ?? 20;
  const direction = directionOf(spec);
  const long = direction === 'long';

  let cash = startingCash;
  let position: Position | null = null;
  let open: OpenTrade | null = null;
  const trades: BacktestTrade[] = [];

  let peak = startingCash;
  let maxDrawdownPct = 0;
  let barsTested = 0;
  let barsInPosition = 0;

  for (let i = warmup; i < candles.length; i++) {
    const bar = candles[i] as Candle;
    const window = candles.slice(0, i + 1);
    barsTested++;

    const { orders } = evaluate(spec, {
      symbol,
      candles: window,
      position,
      portfolioValue: cash + (position ? position.quantity * bar.close : 0),
    });

    for (const order of orders) {
      if (order.intent === 'open' && !position) {
        // Both sides are sized against cash — a short receives money on open
        // but still owes the asset, so it gets no bigger an allowance.
        const notional = (cash * order.sizePct) / 100;
        if (notional <= 0) continue;
        const quantity = notional / bar.close;
        const fee = notional * feeRate;
        cash += (long ? -notional : notional) - fee;
        position = { symbol, quantity: long ? quantity : -quantity, avgPrice: bar.close };
        open = {
          entryTime: bar.openTime,
          entryPrice: bar.close,
          quantity,
          entryFee: fee,
          entryReason: order.reason,
        };
      } else if (order.intent === 'close' && position && open) {
        const gross = open.quantity * bar.close;
        const exitFee = gross * feeRate;
        cash += (long ? gross : -gross) - exitFee;
        // A long earns the rise, a short the fall. Both pay both fees.
        const move = long ? bar.close - open.entryPrice : open.entryPrice - bar.close;
        const pnl = move * open.quantity - open.entryFee - exitFee;
        const committed = open.entryPrice * open.quantity;
        trades.push({
          symbol,
          direction,
          entryTime: open.entryTime,
          entryPrice: open.entryPrice,
          exitTime: bar.openTime,
          exitPrice: bar.close,
          quantity: open.quantity,
          pnl,
          returnPct: committed > 0 ? (pnl / committed) * 100 : 0,
          entryReason: open.entryReason,
          exitReason: order.reason,
        });
        position = null;
        open = null;
      }
    }

    if (position) barsInPosition++;
    const equity = cash + (position ? position.quantity * bar.close : 0);
    if (equity > peak) peak = equity;
    const drawdown = ((peak - equity) / peak) * 100;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
  }

  // Mark an open position to the last close so the window is comparable to
  // buy-and-hold over the same bars.
  const lastClose = (candles[candles.length - 1] as Candle | undefined)?.close ?? 0;
  const finalValue = cash + (position ? position.quantity * lastClose : 0);
  const wins = trades.filter((t) => t.pnl > 0).length;

  return {
    trades,
    startingCash,
    finalValue,
    returnPct: ((finalValue - startingCash) / startingCash) * 100,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    maxDrawdownPct,
    barsTested,
    barsInPosition,
  };
}

/**
 * Buy at the first tradable bar and hold — the benchmark Alpha Score is
 * measured against (spec §7). Same window, same fees, no thinking.
 */
export function buyAndHold(candles: Candle[], options: BacktestOptions = {}): BacktestResult {
  const startingCash = options.startingCash ?? 1000;
  const feeRate = options.feeRate ?? 0.001;
  const warmup = options.warmupBars ?? 20;

  const entry = candles[warmup];
  const exit = candles[candles.length - 1];
  if (!entry || !exit || warmup >= candles.length) {
    return {
      trades: [],
      startingCash,
      finalValue: startingCash,
      returnPct: 0,
      winRate: 0,
      maxDrawdownPct: 0,
      barsTested: 0,
      barsInPosition: 0,
    };
  }

  const quantity = (startingCash * (1 - feeRate)) / entry.close;
  let peak = startingCash;
  let maxDrawdownPct = 0;
  for (let i = warmup; i < candles.length; i++) {
    const equity = quantity * (candles[i] as Candle).close;
    if (equity > peak) peak = equity;
    const drawdown = ((peak - equity) / peak) * 100;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
  }

  const finalValue = quantity * exit.close * (1 - feeRate);
  return {
    trades: [],
    startingCash,
    finalValue,
    returnPct: ((finalValue - startingCash) / startingCash) * 100,
    winRate: 0,
    maxDrawdownPct,
    barsTested: candles.length - warmup,
    barsInPosition: candles.length - warmup,
  };
}

/**
 * Alpha: return above the benchmark over the same window (spec §7).
 * Profit is food; this is the grade.
 */
export function alphaScore(strategy: BacktestResult, benchmark: BacktestResult): number {
  return strategy.returnPct - benchmark.returnPct;
}
