import assert from 'node:assert/strict';
import { test } from 'bun:test';

import type { Candle } from '../strategy/types.ts';
import { bestAction, buildReportCard, combineScores, cutQuestion, scoreAction } from './exam.ts';
import type { GradedAnswer } from './types.ts';

function bars(prices: number[]): Candle[] {
  return prices.map((p, i) => ({
    openTime: i * 3.6e6,
    open: p,
    high: p * 1.01,
    low: p * 0.99,
    close: p,
    volume: 100,
  }));
}

const flat = bars(new Array(200).fill(100));

test('a question needs history on both sides or it is not asked', () => {
  assert.equal(cutQuestion('B', flat, 10, 0), null, 'not enough context');
  assert.equal(cutQuestion('B', flat, 195, 0), null, 'not enough future to settle it');
  assert.ok(cutQuestion('B', flat, 100, 0), 'comfortably inside history');
});

test('the student sees the context and never the outcome bars', () => {
  const q = cutQuestion('B', flat, 100, 0, { contextBars: 60, horizonBars: 12 });
  assert.equal(q?.context.length, 61, 'context includes the decision bar itself');
  assert.equal(q?.context[q.context.length - 1]?.openTime, flat[100]?.openTime);
});

test('the answer key is simply what the market did next', () => {
  const rising = bars([...new Array(100).fill(100), ...Array.from({ length: 20 }, (_, i) => 100 + i * 2)]);
  const q = cutQuestion('B', rising, 99, 0, { contextBars: 60, horizonBars: 12 });
  assert.ok((q?.outcome.movePct ?? 0) > 10);
  assert.equal(bestAction(q!), 'buy');

  const falling = bars([...new Array(100).fill(100), ...Array.from({ length: 20 }, (_, i) => 100 - i * 2)]);
  const qf = cutQuestion('B', falling, 99, 0, { contextBars: 60, horizonBars: 12 });
  assert.equal(bestAction(qf!), 'sell');

  assert.equal(bestAction(cutQuestion('B', flat, 100, 0)!), 'wait', 'a flat market rewards patience');
});

test('being cautiously wrong costs less than being expensively wrong', () => {
  const rising = bars([...new Array(100).fill(100), ...Array.from({ length: 20 }, (_, i) => 100 + i * 2)]);
  const q = cutQuestion('B', rising, 99, 0, { contextBars: 60, horizonBars: 12 })!;

  assert.equal(scoreAction('buy', q), 100, 'right call');
  const waited = scoreAction('wait', q);
  const wrongSide = scoreAction('sell', q);
  assert.ok(waited > wrongSide, 'missing a rise beats shorting into it');
  assert.ok(waited < 100);
});

test('acting on noise is penalised but not as hard as the wrong side', () => {
  const q = cutQuestion('B', flat, 100, 0)!;
  assert.equal(scoreAction('wait', q), 100);
  assert.equal(scoreAction('buy', q), 40, 'traded a flat market');
});

test('the outcome outweighs the prose', () => {
  // Beautiful reasoning, wrong call.
  assert.equal(combineScores(10, 100), 42);
  // Clumsy reasoning, right call.
  assert.equal(combineScores(100, 30), 76);
});

function graded(over: Partial<GradedAnswer>): GradedAnswer {
  return {
    questionId: 'q',
    studentId: 's1',
    action: 'buy',
    score: 80,
    bestAction: 'buy',
    reasoningScore: 70,
    outcomeScore: 100,
    comment: '',
    ...over,
  };
}

test('an empty report card is empty rather than a divide by zero', () => {
  const card = buildReportCard('s1', [], []);
  assert.equal(card.answered, 0);
  assert.equal(card.averageScore, 0);
  assert.equal(card.actionAccuracy, 0);
});

test('the report card averages scores and counts action accuracy separately', () => {
  const card = buildReportCard(
    's1',
    [graded({ score: 100 }), graded({ score: 40, action: 'wait', bestAction: 'buy' })],
    [],
  );
  assert.equal(card.answered, 2);
  assert.equal(card.averageScore, 70);
  assert.equal(card.actionAccuracy, 50, 'one of two calls matched the outcome');
});

test('the report card surfaces which knowledge the student leans on', () => {
  const card = buildReportCard('s1', [graded({}), graded({}), graded({})], [
    ['rsi-note', 'volume-note'],
    ['rsi-note'],
    ['rsi-note', 'trend-note'],
  ]);
  assert.equal(card.mostCited[0]?.nodeId, 'rsi-note');
  assert.equal(card.mostCited[0]?.times, 3);
  assert.equal(card.mostCited.length, 3);
});
