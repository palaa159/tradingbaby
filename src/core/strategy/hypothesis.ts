/**
 * Hypothesis lifecycle (spec §4.4).
 *
 * Confidence is never hand-set — it is a function of evidence. This module owns
 * that function so a student cannot talk itself into believing something; it has
 * to produce backtest results that move the number.
 */

import type { BacktestResult } from './backtest.ts';
import type { NodeStatus } from '../types.ts';

export interface Verdict {
  /** New confidence, 0..1. */
  confidence: number;
  status: Extract<NodeStatus, 'adopted' | 'debunked' | 'testing'>;
  /** Human-readable justification, stored on the node as evidence. */
  summary: string;
  alpha: number;
}

export interface JudgeOptions {
  /** Trades needed before a result counts as evidence rather than noise. */
  minTrades?: number;
  /** Alpha above which a hypothesis may be adopted, in percentage points. */
  adoptAlpha?: number;
  /** Alpha below which it is debunked. */
  debunkAlpha?: number;
  /** A drawdown this deep debunks regardless of return. */
  maxDrawdownPct?: number;
}

const DEFAULTS: Required<JudgeOptions> = {
  minTrades: 5,
  adoptAlpha: 2,
  debunkAlpha: -2,
  maxDrawdownPct: 40,
};

/**
 * Judge a hypothesis against one backtest window.
 *
 * Beating buy-and-hold is the bar, not making money: a strategy that returns
 * +30% in a market that returned +40% has negative alpha and has not earned
 * belief (spec §7).
 */
export function judge(
  prior: number,
  strategy: BacktestResult,
  benchmark: BacktestResult,
  options: JudgeOptions = {},
): Verdict {
  const opts = { ...DEFAULTS, ...options };
  const alpha = strategy.returnPct - benchmark.returnPct;
  const trades = strategy.trades.length;

  if (trades < opts.minTrades) {
    return {
      confidence: clamp(prior),
      status: 'testing',
      summary:
        `ยังตัดสินไม่ได้: เทรดแค่ ${trades} ครั้ง (ต้องการ ${opts.minTrades}) ` +
        `alpha ${alpha.toFixed(2)}% — ต้องทดสอบช่วงอื่นเพิ่ม`,
      alpha,
    };
  }

  if (strategy.maxDrawdownPct > opts.maxDrawdownPct) {
    return {
      confidence: clamp(prior * 0.4),
      status: 'debunked',
      summary:
        `ตีตก: ขาดทุนหนักสุด ${strategy.maxDrawdownPct.toFixed(1)}% ` +
        `เกินเพดาน ${opts.maxDrawdownPct}% แม้ alpha จะ ${alpha.toFixed(2)}% — เสี่ยงเกินรับไหว`,
      alpha,
    };
  }

  if (alpha >= opts.adoptAlpha) {
    // Evidence moves belief partway, not all the way: one good window is not proof.
    return {
      confidence: clamp(prior + (1 - prior) * 0.5),
      status: 'adopted',
      summary:
        `รับเข้า: alpha +${alpha.toFixed(2)}% (สูตรได้ ${strategy.returnPct.toFixed(2)}% ` +
        `ไม้บรรทัดได้ ${benchmark.returnPct.toFixed(2)}%) จาก ${trades} เทรด ` +
        `ชนะ ${strategy.winRate.toFixed(0)}% ขาดทุนหนักสุด ${strategy.maxDrawdownPct.toFixed(1)}%`,
      alpha,
    };
  }

  if (alpha <= opts.debunkAlpha) {
    return {
      confidence: clamp(prior * 0.3),
      status: 'debunked',
      summary:
        `ตีตก: alpha ${alpha.toFixed(2)}% (สูตรได้ ${strategy.returnPct.toFixed(2)}% ` +
        `ไม้บรรทัดได้ ${benchmark.returnPct.toFixed(2)}%) จาก ${trades} เทรด — แพ้การไม่ทำอะไรเลย`,
      alpha,
    };
  }

  return {
    confidence: clamp(prior * 0.8),
    status: 'testing',
    summary:
      `ก้ำกึ่ง: alpha ${alpha.toFixed(2)}% จาก ${trades} เทรด — ` +
      `ดีกว่าไม้บรรทัดไม่ชัดพอจะเชื่อ ต้องหาหลักฐานเพิ่ม`,
    alpha,
  };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
}
