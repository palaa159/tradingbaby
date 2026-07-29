/**
 * Backtest runner (Phase 2 P2).
 *
 * Walks history bar by bar, feeding each prefix to the *same* evaluator the
 * live engine uses (spec §6.2). No lookahead: at bar i the strategy sees only
 * candles[0..i]. Deterministic — same candles and spec give the same result
 * forever, which is what makes a hypothesis test evidence rather than an anecdote.
 */

import { evaluate } from './evaluate.ts';
import type { Candle, Position, StrategySpec } from './types.ts';

export interface BacktestTrade {
  symbol: string;
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

  let cash = startingCash;
  let position: Position | null = null;
  let open: OpenTrade | null = null;
  const trades: BacktestTrade[] = [];

  let peak = startingCash;
  let maxDrawdownPct = 0;
  let barsTested = 0;

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
      if (order.side === 'buy' && !position) {
        const spend = (cash * order.sizePct) / 100;
        if (spend <= 0) continue;
        const quantity = (spend * (1 - feeRate)) / bar.close;
        cash -= spend;
        position = { symbol, quantity, avgPrice: bar.close };
        open = {
          entryTime: bar.openTime,
          entryPrice: bar.close,
          quantity,
          entryReason: order.reason,
        };
      } else if (order.side === 'sell' && position && open) {
        const proceeds = position.quantity * bar.close * (1 - feeRate);
        const cost = open.quantity * open.entryPrice;
        cash += proceeds;
        trades.push({
          symbol,
          entryTime: open.entryTime,
          entryPrice: open.entryPrice,
          exitTime: bar.openTime,
          exitPrice: bar.close,
          quantity: position.quantity,
          pnl: proceeds - cost,
          returnPct: ((proceeds - cost) / cost) * 100,
          entryReason: open.entryReason,
          exitReason: order.reason,
        });
        position = null;
        open = null;
      }
    }

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
  };
}

/**
 * Alpha: return above the benchmark over the same window (spec §7).
 * Profit is food; this is the grade.
 */
export function alphaScore(strategy: BacktestResult, benchmark: BacktestResult): number {
  return strategy.returnPct - benchmark.returnPct;
}
