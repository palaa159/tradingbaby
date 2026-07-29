import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { closes, ema, rsi, sma } from './indicators.ts';
import { evaluate } from './evaluate.ts';
import type { Candle, EvaluationInput, StrategySpec } from './types.ts';

function candles(prices: number[], volume = 100): Candle[] {
  return prices.map((p, i) => ({
    openTime: i * 3_600_000,
    open: p,
    high: p,
    low: p,
    close: p,
    volume,
  }));
}

const buyLowRsi: StrategySpec = {
  name: 'RSI oversold',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entry: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 30 } }],
  exit: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '>', right: { kind: 'number', value: 70 } }],
  sizePct: 5,
};

function input(prices: number[], position: EvaluationInput['position'] = null): EvaluationInput {
  return { symbol: 'BTC/USDT', candles: candles(prices), position, portfolioValue: 1000 };
}

test('sma and ema match hand-computed values, undefined before warmup', () => {
  const values = [1, 2, 3, 4, 5];
  const s = sma(values, 3);
  assert.equal(s[0], undefined);
  assert.equal(s[1], undefined);
  assert.equal(s[2], 2); // (1+2+3)/3
  assert.equal(s[4], 4); // (3+4+5)/3

  const e = ema(values, 3);
  assert.equal(e[1], undefined);
  assert.equal(e[2], 2); // seeded with the SMA
  assert.equal(e[3], 3); // 4*0.5 + 2*0.5
});

test('rsi is 100 on a pure uptrend and low on a pure downtrend', () => {
  const up = rsi(
    closes(candles(Array.from({ length: 30 }, (_, i) => 100 + i))),
    14,
  );
  assert.equal(up[up.length - 1], 100);

  const down = rsi(
    closes(candles(Array.from({ length: 30 }, (_, i) => 200 - i))),
    14,
  );
  assert.ok((down[down.length - 1] as number) < 1);
});

test('entry fires only when every condition holds', () => {
  const falling = Array.from({ length: 40 }, (_, i) => 200 - i * 2);
  const result = evaluate(buyLowRsi, input(falling));
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0]?.side, 'buy');
  assert.equal(result.orders[0]?.sizePct, 5);
  assert.ok(result.readings['rsi(14)'] !== undefined, 'readings recorded for the trace');

  const rising = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
  assert.equal(evaluate(buyLowRsi, input(rising)).orders.length, 0);
});

test('exit closes the whole position and entry is skipped while holding', () => {
  const rising = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
  const held = { symbol: 'BTC/USDT', quantity: 1, avgPrice: 100 };
  const result = evaluate(buyLowRsi, input(rising, held));
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0]?.side, 'sell');
  assert.equal(result.orders[0]?.sizePct, 100);

  // Falling market while holding: exit does not fire, and no second buy either.
  const falling = Array.from({ length: 40 }, (_, i) => 200 - i * 2);
  assert.equal(evaluate(buyLowRsi, input(falling, held)).orders.length, 0);
});

test('crosses_above needs the actual crossing, not just being above', () => {
  const spec: StrategySpec = {
    ...buyLowRsi,
    entry: [
      {
        left: { kind: 'indicator', name: 'price' },
        op: 'crosses_above',
        right: { kind: 'indicator', name: 'sma', period: 3 },
      },
    ],
    exit: [],
  };
  // Below the average, then one bar that jumps across it.
  assert.equal(evaluate(spec, input([10, 9, 8, 7, 6, 20])).orders.length, 1);
  // Already above for several bars — no crossing on the last bar.
  assert.equal(evaluate(spec, input([10, 12, 14, 16, 18, 20])).orders.length, 0);
});

test('symbols outside the strategy universe are ignored', () => {
  const falling = Array.from({ length: 40 }, (_, i) => 200 - i * 2);
  const other = { ...input(falling), symbol: 'ETH/USDT' };
  assert.equal(evaluate(buyLowRsi, other).orders.length, 0);
});

test('evaluation is deterministic — same input, byte-identical result', () => {
  const falling = Array.from({ length: 40 }, (_, i) => 200 - i * 2);
  const a = evaluate(buyLowRsi, input(falling));
  const b = evaluate(buyLowRsi, input(falling));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
