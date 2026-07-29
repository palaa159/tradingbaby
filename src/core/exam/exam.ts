/**
 * Question generation and the objective half of grading.
 *
 * Deliberately pure and LLM-free: the market already knows the answer, so the
 * part of the score that depends on being *right* is arithmetic. Only the
 * quality of the reasoning needs a judge (spec §14.2), and that judge is a
 * separate session that never sees the student's brain.
 */

import type { Candle } from '../strategy/types.ts';
import type { Action, ExamQuestion, Exposure, GradedAnswer, ReportCard } from './types.ts';

export interface ExamOptions {
  /** Bars the student sees before deciding. */
  contextBars?: number;
  /** Bars of future used to settle the answer. */
  horizonBars?: number;
  /** A move smaller than this in either direction means the market asked for nothing. */
  flatThresholdPct?: number;
  /** Where the student already stands when the question is asked. */
  holding?: Exposure;
  /** The maker's switch. With the short side off, selling from flat goes nowhere. */
  allowShort?: boolean;
}

const DEFAULTS: Required<ExamOptions> = {
  contextBars: 60,
  horizonBars: 12,
  flatThresholdPct: 1.5,
  holding: 'flat',
  allowShort: true,
};

/** Changing position when the market did not ask you to is not free. */
const CHURN_PENALTY = 15;
/** Naming a move you cannot make from where you stand. */
const IMPOSSIBLE_PENALTY = 20;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

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
    id: `${symbol}:${decisionIndex}:${opts.holding}`,
    symbol,
    context,
    holding: opts.holding,
    outcome: {
      movePct: ((finalClose - decisionClose) / decisionClose) * 100,
      drawdownPct: ((decisionClose - lowest) / decisionClose) * 100,
      horizonBars: opts.horizonBars,
    },
    askedAt,
  };
}

/**
 * The positions a student can stand in, worst-for-a-rise first. `buy` steps one
 * rung up the ladder and `sell` one rung down, so every action means something
 * from everywhere and none of them is a special case: from short, `buy` covers;
 * from flat, it enters; from long, it adds.
 */
function ladder(allowShort: boolean): Exposure[] {
  return allowShort ? ['short', 'flat', 'long'] : ['flat', 'long'];
}

/** Where an action leaves the student, given where it stood. */
export function exposureAfter(action: Action, from: Exposure, allowShort = true): Exposure {
  const rungs = ladder(allowShort);
  const at = rungs.indexOf(from);
  if (at < 0) return from;
  const step = action === 'buy' ? 1 : action === 'sell' ? -1 : 0;
  return rungs[Math.max(0, Math.min(rungs.length - 1, at + step))] as Exposure;
}

/** Selling from flat when the maker has the short side switched off. */
export function isImpossible(action: Action, from: Exposure, allowShort = true): boolean {
  return !allowShort && action === 'sell' && from === 'flat';
}

/**
 * How well a position suited what the market went on to do, scaled by how big
 * the move was. Missing a 2% rise is a shrug; missing a 20% one is the whole
 * exam. A flat constant here was the old bug — it made indecision pay the same
 * whatever it cost.
 *
 * The two sides are graded as mirrors, because the academy holds no view on
 * which way a student ought to bet (spec §6, rule 9).
 */
function exposureScore(exposure: Exposure, movePct: number, threshold: number): number {
  const severity = Math.min(1, (Math.abs(movePct) - threshold) / (3 * threshold));
  const rewarded: Exposure = movePct > 0 ? 'long' : 'short';

  if (Math.abs(movePct) > threshold) {
    if (exposure === rewarded) return 100;
    // Standing aside costs opportunity; standing on the wrong side costs money,
    // and losing the maker's money is the worse of the two mistakes.
    return exposure === 'flat' ? 60 - 35 * severity : 30 - 25 * severity;
  }
  // The market asked for nothing. Standing aside is right; carrying risk for a
  // reward that never came is not wrong so much as pointless — either way round.
  return exposure === 'flat' ? 100 : 55;
}

/**
 * Score what the student did, by where it ended up rather than what it called it.
 *
 * The action word alone cannot be graded: "wait" is a bet on a fall for a
 * student already short, a bet on a rise for one already long, and no bet at
 * all for one standing in cash. Only the resulting exposure is real.
 */
export function scoreAction(action: Action, question: ExamQuestion, options: ExamOptions = {}): number {
  const opts = { ...DEFAULTS, ...options };
  const { movePct } = question.outcome;
  const current = question.holding;
  const exposure = exposureAfter(action, current, opts.allowShort);

  let score = exposureScore(exposure, movePct, opts.flatThresholdPct);

  // Moving costs something; sitting still does not. A move that improved the
  // position pays for itself — one the market ignored, or one that made things
  // worse, does not.
  const stayScore = exposureScore(current, movePct, opts.flatThresholdPct);
  const marketAskedForNothing = Math.abs(movePct) <= opts.flatThresholdPct;
  if (exposure !== current && (marketAskedForNothing || score <= stayScore)) score -= CHURN_PENALTY;

  if (isImpossible(action, current, opts.allowShort)) score -= IMPOSSIBLE_PENALTY;

  return clamp(score);
}

/**
 * The action that scores highest from where the student stands — derived by
 * scoring all three rather than reasoned out separately, so the answer key can
 * never drift from the marking. Ties go to standing still: doing nothing is the
 * cheaper way of being right.
 */
export function bestAction(question: ExamQuestion, options: ExamOptions = {}): Action {
  const actions: Action[] = ['wait', 'buy', 'sell'];
  let best: Action = 'wait';
  let bestScore = -1;
  for (const action of actions) {
    const score = scoreAction(action, question, options);
    if (score > bestScore) {
      best = action;
      bestScore = score;
    }
  }
  return best;
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
