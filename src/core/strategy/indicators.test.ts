import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { doji, engulfing, hammer, shootingStar, volumeSma } from './indicators.ts';
import type { Candle } from './types.ts';

function bar(open: number, high: number, low: number, close: number, volume = 100): Candle {
  return { openTime: 0, open, high, low, close, volume };
}

test('hammer needs a long lower shadow and a small body, not just a green bar', () => {
  // body 1, lower shadow 6, upper shadow 0.5 — textbook hammer
  assert.equal(hammer([bar(100, 101.5, 94, 101)])[0], 1);
  // Same direction but no shadow: just an ordinary bar.
  assert.equal(hammer([bar(100, 106, 99.5, 105)])[0], 0);
  // Long shadow both sides is indecision, not rejection of lows.
  assert.equal(hammer([bar(100, 106, 94, 101)])[0], 0);
});

test('shooting star is the mirror image and does not fire on a hammer', () => {
  assert.equal(shootingStar([bar(100, 106, 99.5, 101)])[0], 1);
  assert.equal(shootingStar([bar(100, 101.5, 94, 101)])[0], 0, 'a hammer is not a star');
  assert.equal(hammer([bar(100, 106, 99.5, 101)])[0], 0, 'and a star is not a hammer');
});

test('doji is about the body being tiny relative to the range', () => {
  assert.equal(doji([bar(100, 105, 95, 100.2)])[0], 1);
  assert.equal(doji([bar(100, 105, 95, 104)])[0], 0);
  // A flat bar has no range at all and must not divide by zero.
  assert.equal(doji([bar(100, 100, 100, 100)])[0], 0);
});

test('engulfing needs the opposite direction and a bigger body', () => {
  const down = bar(105, 105, 100, 100);
  const swallow = bar(99, 107, 99, 106);
  assert.equal(engulfing([down, swallow], 'bullish')[1], 1);
  assert.equal(engulfing([down, swallow], 'bearish')[1], 0, 'direction matters');

  // Same direction as the previous bar cannot engulf it.
  const alsoDown = bar(104, 104, 98, 99);
  assert.equal(engulfing([down, alsoDown], 'bullish')[1], 0);

  // The first bar has nothing before it.
  assert.equal(engulfing([swallow], 'bullish')[0], 0);
});

test('volume average reads volume, not price', () => {
  const bars = [bar(1, 1, 1, 1, 10), bar(1, 1, 1, 1, 20), bar(1, 1, 1, 1, 30)];
  const avg = volumeSma(bars, 3);
  assert.equal(avg[2], 20);
  assert.equal(avg[1], undefined, 'undefined before the window fills');
});

test('a textbook hammer with a small body is not disqualified by a small wick', () => {
  // Regression: judging the upper shadow against the body meant a tiny body
  // made the threshold tiny too, so real hammers scored 0 and a hammer
  // strategy never fired a single trade.
  const tinyBody = bar(100, 100.4, 94, 100.2);
  assert.equal(hammer([tinyBody])[0], 1);
});

test('shadows are judged against range, so a wick-heavy bar is still not a hammer', () => {
  // Long lower shadow but an equally long upper one: indecision, not rejection.
  assert.equal(hammer([bar(100, 110, 90, 100.5)])[0], 0);
});
