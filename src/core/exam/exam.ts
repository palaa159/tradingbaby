/**
 * Question generation and the objective half of grading.
 *
 * Deliberately pure and LLM-free: the market already knows the answer, so the
 * part of the score that depends on being *right* is arithmetic. Only the
 * quality of the reasoning needs a judge (spec §14.2), and that judge is a
 * separate session that never sees the student's brain.
 */

import type { Candle } from '../strategy/types.ts';
import type { Action, ExamQuestion, GradedAnswer, ReportCard } from './types.ts';

export interface ExamOptions {
  /** Bars the student sees before deciding. */
  contextBars?: number;
  /** Bars of future used to settle the answer. */
  horizonBars?: number;
  /** A move smaller than this in either direction means waiting was right. */
  flatThresholdPct?: number;
}

const DEFAULTS: Required<ExamOptions> = {
  contextBars: 60,
  horizonBars: 12,
  flatThresholdPct: 1.5,
};

/**
 * Cut a question from history at `decisionIndex`. Returns null when there is
 * not enough history on either side — a question the market cannot settle is
 * not a question.
 */
export function cutQuestion(
  symbol: string,
  candles: Candle[],
  decisionIndex: number,
  askedAt: number,
  options: ExamOptions = {},
): ExamQuestion | null {
  const opts = { ...DEFAULTS, ...options };
  const start = decisionIndex - opts.contextBars;
  const end = decisionIndex + opts.horizonBars;
  if (start < 0 || end >= candles.length) return null;

  const context = candles.slice(start, decisionIndex + 1);
  const decisionClose = (candles[decisionIndex] as Candle).close;
  const future = candles.slice(decisionIndex + 1, end + 1);
  if (decisionClose <= 0 || future.length === 0) return null;

  const finalClose = (future[future.length - 1] as Candle).close;
  let lowest = decisionClose;
  for (const bar of future) if (bar.low < lowest) lowest = bar.low;

  return {
    id: `${symbol}:${decisionIndex}`,
    symbol,
    context,
    outcome: {
      movePct: ((finalClose - decisionClose) / decisionClose) * 100,
      drawdownPct: ((decisionClose - lowest) / decisionClose) * 100,
      horizonBars: opts.horizonBars,
    },
    askedAt,
  };
}

/** What the outcome justified, with hindsight. */
export function bestAction(question: ExamQuestion, options: ExamOptions = {}): Action {
  const opts = { ...DEFAULTS, ...options };
  const { movePct } = question.outcome;
  if (movePct > opts.flatThresholdPct) return 'buy';
  if (movePct < -opts.flatThresholdPct) return 'sell';
  return 'wait';
}

/**
 * Score the action against the outcome. Being wrong in the expensive direction
 * costs more than being wrong in the cautious one: buying into a fall is a
 * worse mistake than waiting through a rise, because only one of them loses
 * money.
 */
export function scoreAction(action: Action, question: ExamQuestion, options: ExamOptions = {}): number {
  const best = bestAction(question, options);
  if (action === best) return 100;
  if (action === 'wait') return 55; // missed the move, but kept the money
  if (best === 'wait') return 40; // acted on noise
  return 10; // took the wrong side of a real move
}

/**
 * Combine the objective half with the judge's read of the reasoning.
 * The outcome carries more weight — good reasoning that loses money is still
 * a losing answer, and the academy grades on results (spec §7).
 */
export function combineScores(outcomeScore: number, reasoningScore: number): number {
  return Math.round(outcomeScore * 0.65 + reasoningScore * 0.35);
}

export function buildReportCard(studentId: string, graded: GradedAnswer[], citations: string[][]): ReportCard {
  if (graded.length === 0) {
    return { studentId, answered: 0, averageScore: 0, actionAccuracy: 0, mostCited: [], history: [] };
  }

  const counts = new Map<string, number>();
  for (const list of citations) {
    for (const nodeId of list) counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
  }
  const mostCited = [...counts.entries()]
    .map(([nodeId, times]) => ({ nodeId, times }))
    .sort((a, b) => b.times - a.times || a.nodeId.localeCompare(b.nodeId))
    .slice(0, 5);

  const total = graded.reduce((sum, g) => sum + g.score, 0);
  const correct = graded.filter((g) => g.action === g.bestAction).length;

  return {
    studentId,
    answered: graded.length,
    averageScore: Math.round((total / graded.length) * 10) / 10,
    actionAccuracy: Math.round((correct / graded.length) * 1000) / 10,
    mostCited,
    history: graded.map((g, i) => ({ at: i, score: g.score })),
  };
}
