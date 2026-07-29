/**
 * Exams and the report card (spec §7, §14.2).
 *
 * Questions are cut from real market history at a point in time, and the answer
 * key is simply what the market did next. That makes grading resistant to a
 * persuasive wrong answer: an examiner cannot be talked into a good score by
 * confident prose when the price already settled the matter.
 */

import type { Candle } from '../strategy/types.ts';

export interface ExamQuestion {
  id: string;
  symbol: string;
  /** Candles up to the decision point — the student sees only this. */
  context: Candle[];
  /** What actually happened next. Never shown to the student. */
  outcome: {
    /** Percent change from the decision close to the end of the horizon. */
    movePct: number;
    /** Worst drawdown from the decision close within the horizon, percent. */
    drawdownPct: number;
    horizonBars: number;
  };
  askedAt: number;
}

export type Action = 'buy' | 'sell' | 'wait';

export interface ExamAnswer {
  questionId: string;
  studentId: string;
  action: Action;
  reasoning: string;
  /** Knowledge node ids the student cited (spec §7 — what drove the answer). */
  citedNodeIds: string[];
}

export interface GradedAnswer {
  questionId: string;
  studentId: string;
  action: Action;
  /** 0–100. */
  score: number;
  /** The action the outcome justified in hindsight. */
  bestAction: Action;
  reasoningScore: number;
  outcomeScore: number;
  comment: string;
}

export interface ReportCard {
  studentId: string;
  answered: number;
  averageScore: number;
  /** Fraction of answers whose action matched the outcome, percent. */
  actionAccuracy: number;
  /** Node ids the student cited most often across the exams. */
  mostCited: { nodeId: string; times: number }[];
  history: { at: number; score: number }[];
}
