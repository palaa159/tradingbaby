import assert from 'node:assert/strict';
import { test } from 'bun:test';

import type { Candle } from '../strategy/types.ts';
import {
  bestAction,
  buildReportCard,
  combineScores,
  cutQuestion,
  exposureAfter,
  isImpossible,
  scoreAction,
} from './exam.ts';
import type { Exposure, GradedAnswer } from './types.ts';

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

const rising = bars([...new Array(100).fill(100), ...Array.from({ length: 20 }, (_, i) => 100 + i * 2)]);
const falling = bars([...new Array(100).fill(100), ...Array.from({ length: 20 }, (_, i) => 100 - i * 2)]);
const cut = (series: Candle[], holding: Exposure) =>
  cutQuestion('B', series, series === flat ? 100 : 99, 0, { contextBars: 60, horizonBars: 12, holding })!;

test('the answer key is the position the outcome justified, reached from where you stand', () => {
  assert.ok(cut(rising, 'flat').outcome.movePct > 10);
  assert.equal(bestAction(cut(rising, 'flat')), 'buy', 'get long');
  assert.equal(bestAction(cut(rising, 'long')), 'wait', 'already long — stay there');
  assert.equal(bestAction(cut(rising, 'short')), 'buy', 'wrong side of a rally — cover');

  assert.equal(bestAction(cut(falling, 'flat')), 'sell', 'get short');
  assert.equal(bestAction(cut(falling, 'short')), 'wait', 'already short — stay there');
  assert.equal(bestAction(cut(falling, 'long')), 'sell', 'get out');

  assert.equal(bestAction(cut(flat, 'flat')), 'wait', 'a flat market rewards patience');
});

test('buy and sell step along the ladder rather than meaning one fixed thing', () => {
  assert.equal(exposureAfter('sell', 'flat'), 'short', 'the academy lets you bet on a fall');
  assert.equal(exposureAfter('sell', 'long'), 'flat', 'the same word closes a long');
  assert.equal(exposureAfter('buy', 'short'), 'flat', 'and covers a short');
  assert.equal(exposureAfter('buy', 'long'), 'long', 'adding leaves you where you were');
  assert.equal(exposureAfter('wait', 'short'), 'short');
});

test('the maker can switch the short side off, and then selling from flat goes nowhere', () => {
  assert.equal(exposureAfter('sell', 'flat', false), 'flat');
  assert.ok(isImpossible('sell', 'flat', false));
  assert.ok(!isImpossible('sell', 'flat', true), 'shorting is a real trade here');
  assert.ok(!isImpossible('sell', 'long', false), 'closing a long is always allowed');

  const q = cut(falling, 'flat');
  assert.ok(
    scoreAction('sell', q, { allowShort: false }) < scoreAction('sell', q, { allowShort: true }),
    'the same answer is worth less when the school forbids it',
  );
});

test('both sides of the market are graded as mirrors of each other', () => {
  assert.equal(scoreAction('buy', cut(rising, 'flat')), scoreAction('sell', cut(falling, 'flat')));
  assert.equal(scoreAction('wait', cut(rising, 'long')), scoreAction('wait', cut(falling, 'short')));
  assert.equal(scoreAction('wait', cut(rising, 'short')), scoreAction('wait', cut(falling, 'long')));
});

test('waiting is scored by what it did, not by being cautious', () => {
  // The old bug: `wait` earned a flat 55 whatever it cost or saved.
  assert.ok(scoreAction('wait', cut(falling, 'flat')) < 60, 'sitting out a 20% fall is a real miss too');
  assert.ok(scoreAction('wait', cut(falling, 'long')) < 20, 'holding through the crash is the wrong answer');
  assert.equal(scoreAction('wait', cut(falling, 'short')), 100, 'being short through it is the right one');
  assert.equal(scoreAction('wait', cut(rising, 'long')), 100);
});

test('answering wait to everything earns nothing on average', () => {
  // The measured failure that prompted this: an empty-brained student that
  // always said `wait` outscored students that had learned something.
  const papers = (['flat', 'long', 'short'] as const).flatMap((h) => [cut(rising, h), cut(falling, h)]);
  const always = papers.map((q) => scoreAction('wait', q));
  const informed = papers.map((q) => scoreAction(bestAction(q), q));

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean(informed) > mean(always) + 30, 'reading the market has to be worth something');
  assert.ok(mean(always) < 60, `indecision must not pay: got ${mean(always)}`);
});

test('the answer key can never disagree with the marking', () => {
  for (const series of [rising, falling, flat]) {
    for (const holding of ['flat', 'long', 'short'] as const) {
      const q = cut(series, holding);
      const best = scoreAction(bestAction(q), q);
      for (const action of ['buy', 'sell', 'wait'] as const) {
        assert.ok(scoreAction(action, q) <= best, `${holding} ${action} beat the answer key`);
      }
    }
  }
});

test('missing a big move costs more than missing a small one', () => {
  const barely = bars([...new Array(100).fill(100), ...Array.from({ length: 20 }, (_, i) => 100 + i * 0.2)]);
  assert.ok(
    scoreAction('wait', cut(barely, 'flat')) > scoreAction('wait', cut(rising, 'flat')),
    'a flat constant here was the old bug',
  );
});

test('losing money is punished harder than missing out on it', () => {
  const missedTheRise = scoreAction('wait', cut(rising, 'flat'));
  const rodeTheFallDown = scoreAction('wait', cut(falling, 'long'));
  assert.ok(missedTheRise > rodeTheFallDown, 'only one of these costs the maker anything');
});

test('acting on noise is penalised, sitting through it is not', () => {
  assert.equal(scoreAction('wait', cut(flat, 'flat')), 100);
  assert.equal(scoreAction('buy', cut(flat, 'flat')), 40, 'paid to take risk the market never rewarded');
  assert.equal(scoreAction('sell', cut(flat, 'flat')), 40, 'and the short side is no cheaper');
  assert.ok(scoreAction('wait', cut(flat, 'long')) > 40, 'staying put costs nothing, even if it earns nothing');
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
