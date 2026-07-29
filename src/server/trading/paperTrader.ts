/**
 * The paper trading loop (Phase 2 P3) — the piece that actually places orders.
 *
 * Composition, deliberately dumb: evaluate the active strategies, run each
 * order past the house rules, fill whatever survives, record everything either
 * way. No LLM anywhere in this path (spec §6.2), so it costs nothing to run and
 * always decides the same way.
 */

import { openBenchmark } from '../../core/trading/benchmark.ts';
import { checkOrder, type GuardrailConfig } from '../../core/trading/guardrails.ts';
import { portfolioValue, type PortfolioState } from '../../core/trading/portfolio.ts';
import type { Candle, StrategyVersion } from '../../core/strategy/types.ts';
import type { StrategyStore } from '../db/strategyStore.ts';
import type { TradingStore } from '../db/tradingStore.ts';

export interface TickInput {
  studentId: string;
  at: number;
  /** Candles per symbol, oldest first, for the timeframe the strategies read. */
  candles: Record<string, Candle[]>;
  startingCash: number;
  /** Portfolio value when the day opened, for the daily-loss rule. */
  startOfDayValue: number;
  feeRate: number;
}

export interface TickOutcome {
  filled: { symbol: string; side: string; quantity: number; price: number; note: string }[];
  blocked: { symbol: string; side: string; reason: string }[];
  portfolioValue: number;
}

/**
 * One decision pass across every active strategy and symbol.
 * Returns what happened so a caller can log it; everything is also persisted.
 */
export function tick(
  input: TickInput,
  strategies: StrategyStore,
  trading: TradingStore,
  guardrails: GuardrailConfig,
): TickOutcome {
  const active = strategies.active(input.studentId);
  const outcome: TickOutcome = { filled: [], blocked: [], portfolioValue: 0 };

  const prices: Record<string, number> = {};
  for (const [symbol, candles] of Object.entries(input.candles)) {
    const last = candles[candles.length - 1];
    if (last) prices[symbol] = last.close;
  }
  trading.markPrices(prices, input.at);

  // The benchmark starts the first time this student sees the market, on the
  // same cash and the same day, so alpha compares like with like (spec §7).
  trading.openBenchmarkOnce(
    input.studentId,
    openBenchmark(input.startingCash, prices, input.at, input.feeRate),
  );

  let state: PortfolioState = trading.portfolio(input.studentId, input.startingCash);

  for (const strategy of active) {
    for (const symbol of strategy.spec.symbols) {
      const candles = input.candles[symbol];
      if (!candles || candles.length === 0) continue;

      const price = prices[symbol] as number;
      const held = state.holdings.get(symbol);
      const value = portfolioValue(state, prices);

      const { orders } = strategies.runAndRecord(
        strategy,
        {
          symbol,
          candles,
          position: held ? { symbol, quantity: held.quantity, avgPrice: held.avgPrice } : null,
          portfolioValue: value,
        },
        input.at,
      );

      for (const order of orders) {
        const heldValue = (held?.quantity ?? 0) * price;
        const check = checkOrder(
          order.sizePct,
          order.side,
          {
            portfolioValue: value,
            existingPositionValue: heldValue,
            cash: state.cash,
            startOfDayValue: input.startOfDayValue,
            currentValue: value,
            wouldGoShort: order.side === 'sell' && (held?.quantity ?? 0) <= 0,
          },
          guardrails,
        );

        if (!check.allowed) {
          trading.recordBlocked(input.studentId, {
            at: input.at,
            symbol,
            side: order.side,
            reason: check.reason,
          });
          outcome.blocked.push({ symbol, side: order.side, reason: check.reason });
          continue;
        }

        const quantity =
          order.side === 'buy'
            ? ((value * check.sizePct) / 100) / price
            : (held?.quantity ?? 0) * (check.sizePct / 100);
        if (quantity <= 0) continue;

        const fee = quantity * price * input.feeRate;
        const recorded = trading.record({
          studentId: input.studentId,
          strategyId: strategy.id,
          evaluationId: null,
          at: input.at,
          symbol,
          side: order.side,
          quantity,
          price,
          fee,
          reason: order.reason,
          guardrailNote: check.note,
        });

        state = trading.portfolio(input.studentId, input.startingCash);
        outcome.filled.push({
          symbol,
          side: recorded.side,
          quantity,
          price,
          note: check.note,
        });
      }
    }
  }

  outcome.portfolioValue = portfolioValue(state, prices);
  return outcome;
}

export type { StrategyVersion };
