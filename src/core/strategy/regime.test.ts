import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { alphaByRegime, classifyRegime, segmentByRegime } from './regime.ts';
import type { Candle, StrategySpec } from './types.ts';

function bars(prices: number[]): Candle[] {
  return prices.map((p, i) => ({ openTime: i * 3_600_000, open: p, high: p, low: p, close: p, volume: 100 }));
}

const ramp = (from: number, to: number, n: number) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

/** Walks a long way and ends where it started — the case a net-move test misses. */
const zigzag = (n: number, amplitude: number) =>
  Array.from({ length: n }, (_, i) => 100 + (i % 2 === 0 ? amplitude : -amplitude));

test('a steady climb is a bull market and a steady slide is a bear one', () => {
  assert.equal(classifyRegime(bars(ramp(100, 160, 120))).regime, 'bull');
  assert.equal(classifyRegime(bars(ramp(160, 100, 120))).regime, 'bear');
});

test('a market that travels far and arrives nowhere is a range, not a trend', () => {
  const reading = classifyRegime(bars(zigzag(120, 8)));
  assert.equal(reading.regime, 'chop');
  assert.ok(reading.directionality < 0.1, 'all that movement cancelled out');
  assert.ok(reading.volatilityPct > 5, 'and it was not quiet while doing it');
});

test('a small drift is not a trend however tidy the line is', () => {
  const reading = classifyRegime(bars(ramp(100, 102, 120)));
  assert.equal(reading.regime, 'chop', 'two percent is noise');
  assert.ok(reading.directionality > 0.9, 'even though it went one way the whole time');
});

test('classification is deterministic and needs no clock', () => {
  const candles = bars(ramp(100, 160, 120));
  assert.deepEqual(classifyRegime(candles), classifyRegime(candles));
});

test('an unjudgeably short window is called a range rather than guessed at', () => {
  assert.equal(classifyRegime([]).regime, 'chop');
  assert.equal(classifyRegime(bars([100])).regime, 'chop');
});

test('history splits into the stretches that behaved differently', () => {
  const candles = bars([...ramp(100, 200, 120), ...ramp(200, 100, 120)]);
  const segments = segmentByRegime(candles, 120);
  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.regime, 'bull');
  assert.equal(segments[1]?.regime, 'bear');
  assert.equal(segments[1]?.to, candles.length - 1, 'every bar lands in some stretch');
});

test('one long rally reads as a single stretch, not a dozen identical slices', () => {
  const segments = segmentByRegime(bars(ramp(100, 400, 600)), 120);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.bars, 600);
});

const alwaysLong: StrategySpec = {
  name: 'always-long',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entry: [{ left: { kind: 'indicator', name: 'price' }, op: '>', right: { kind: 'number', value: 0 } }],
  exit: [],
  sizePct: 100,
};

test('a strategy is reported per market cycle, not as one blended number', () => {
  const candles = bars([...ramp(100, 200, 150), ...ramp(200, 100, 150)]);
  const report = alphaByRegime(alwaysLong, 'BTC/USDT', candles, { windowBars: 150 });

  const bull = report.byRegime.find((v) => v.regime === 'bull');
  const bear = report.byRegime.find((v) => v.regime === 'bear');
  assert.ok(bull && bear, 'both halves of the cycle are reported');
  assert.ok(bull.returnPct > 0, 'buying and holding a rally makes money');
  assert.ok(bear.returnPct < 0, 'and the same rule gives it back in the slide');
});

test('a buy-and-hold clone earns roughly no alpha in any regime — it is the weather', () => {
  const candles = bars([...ramp(100, 200, 150), ...ramp(200, 100, 150)]);
  const report = alphaByRegime(alwaysLong, 'BTC/USDT', candles, { windowBars: 150 });
  for (const verdict of report.byRegime) {
    assert.ok(Math.abs(verdict.alphaPct) < 1, `${verdict.regime}: copying the benchmark is not skill`);
  }
});

test('the same rules on the short side earn their alpha in the opposite market', () => {
  const candles = bars([...ramp(100, 200, 150), ...ramp(200, 100, 150)]);
  const short = alphaByRegime(
    { ...alwaysLong, name: 'always-short', direction: 'short' },
    'BTC/USDT',
    candles,
    { windowBars: 150 },
  );
  assert.equal(short.bestRegime, 'bear', 'a short strategy shines when the market falls');
  assert.equal(short.worstRegime, 'bull');
});

test('a regime the strategy never traded in is not evidence about that regime', () => {
  const neverFires: StrategySpec = {
    ...alwaysLong,
    name: 'never-fires',
    entry: [{ left: { kind: 'indicator', name: 'price' }, op: '<', right: { kind: 'number', value: 0 } }],
  };
  const report = alphaByRegime(neverFires, 'BTC/USDT', bars(ramp(100, 200, 150)), { windowBars: 150 });
  assert.equal(report.bestRegime, null);
  assert.equal(report.worstRegime, null);
});
