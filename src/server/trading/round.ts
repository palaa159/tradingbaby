/**
 * One trading round: every student's active strategies get exactly one look at
 * the latest closed candles, then settlement turns the result into energy
 * (spec §6.2, §3.4).
 *
 * No LLM anywhere in this path, which is the whole point — trading runs on the
 * market's clock rather than the quota's, so a student too hungry to think
 * keeps trading the rules it already proved.
 */

import type { MetabolismConfig } from '../../core/metabolism.ts';
import type { Candle } from '../../core/strategy/types.ts';
import type { GuardrailConfig } from '../../core/trading/guardrails.ts';
import { portfolioValue } from '../../core/trading/portfolio.ts';
import type { StrategyStore } from '../db/strategyStore.ts';
import type { TradingStore } from '../db/tradingStore.ts';
import { tick } from './paperTrader.ts';
import type { Metabolism, SettlementOutcome } from './settlement.ts';

export interface RoundInput {
  studentIds: readonly string[];
  /** Closed candles per symbol, oldest first. The forming bar must be dropped. */
  candles: Record<string, Candle[]>;
  at: number;
  /** Local calendar day, for the daily-loss rule. */
  day: string;
  metabolism: MetabolismConfig;
  guardrails: GuardrailConfig;
  feeRate: number;
  fullCycleBudget: number;
}

export interface StudentRound {
  studentId: string;
  filled: number;
  blocked: number;
  portfolioValue: number;
  /** Null when the student is suspended — nothing traded, nothing settled. */
  settlement: SettlementOutcome | null;
}

export function tradingRound(
  input: RoundInput,
  strategies: StrategyStore,
  trading: TradingStore,
  metabolism: Metabolism,
): StudentRound[] {
  const prices: Record<string, number> = {};
  for (const [symbol, candles] of Object.entries(input.candles)) {
    const last = candles[candles.length - 1];
    if (last) prices[symbol] = last.close;
  }

  const startingCash = input.metabolism.startingAllowance;
  const results: StudentRound[] = [];

  for (const studentId of input.studentIds) {
    if (metabolism.isSuspended(studentId)) {
      results.push({ studentId, filled: 0, blocked: 0, portfolioValue: 0, settlement: null });
      continue;
    }

    const startOfDayValue = trading.dayOpenValueOnce(
      studentId,
      input.day,
      portfolioValue(trading.portfolio(studentId, startingCash), prices),
      input.at,
    );

    const outcome = tick(
      {
        studentId,
        at: input.at,
        candles: input.candles,
        startingCash,
        startOfDayValue,
        feeRate: input.feeRate,
      },
      strategies,
      trading,
      input.guardrails,
    );

    const settlement = metabolism.settleStudent(
      studentId,
      startingCash,
      input.at,
      trading,
      strategies,
      input.fullCycleBudget,
    );

    results.push({
      studentId,
      filled: outcome.filled.length,
      blocked: outcome.blocked.length,
      portfolioValue: outcome.portfolioValue,
      settlement,
    });
  }

  return results;
}
