import assert from 'node:assert/strict';
import { test } from 'bun:test';

import type { Candle, EvaluationInput, StrategySpec } from '../../core/strategy/types.ts';
import { openAcademyDb } from './sqliteStore.ts';
import { StrategyStore } from './strategyStore.ts';

const spec: StrategySpec = {
  name: 'rsi-dip',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entry: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 30 } }],
  exit: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '>', right: { kind: 'number', value: 70 } }],
  sizePct: 5,
};

function fallingInput(): EvaluationInput {
  const candles: Candle[] = Array.from({ length: 40 }, (_, i) => {
    const p = 200 - i * 2;
    return { openTime: i * 3_600_000, open: p, high: p, low: p, close: p, volume: 100 };
  });
  return { symbol: 'BTC/USDT', candles, position: null, portfolioValue: 1000 };
}

test('activating twice mints v2 and retires v1, keeping v1 readable', () => {
  const store = new StrategyStore(openAcademyDb(':memory:'));

  const v1 = store.activate('s1', spec, ['hypo-1'], 1000);
  assert.equal(v1.version, 1);
  assert.equal(v1.status, 'active');

  const v2 = store.activate('s1', { ...spec, sizePct: 8 }, ['hypo-1', 'hypo-2'], 2000);
  assert.equal(v2.version, 2);

  const old = store.get(v1.id);
  assert.equal(old?.status, 'retired', 'v1 retired, not deleted');
  assert.equal(old?.retiredAt, 2000);
  assert.equal(old?.spec.sizePct, 5, 'v1 spec is untouched by the v2 edit');

  assert.equal(store.active('s1').length, 1);
  assert.equal(store.active('s1')[0]?.version, 2);
  assert.equal(store.all('s1').length, 2);
});

test('recorded evaluations replay byte-identically', () => {
  const store = new StrategyStore(openAcademyDb(':memory:'));
  const strategy = store.activate('s1', spec, [], 1000);

  const result = store.runAndRecord(strategy, fallingInput(), 1100);
  assert.equal(result.orders[0]?.side, 'buy');

  store.runAndRecord(strategy, { ...fallingInput(), symbol: 'ETH/USDT' }, 1200);

  const check = store.verifyReplay(strategy.id);
  assert.equal(check.checked, 2);
  assert.deepEqual(check.mismatches, []);
});

test('replay catches drift when a decision no longer reproduces', () => {
  const db = openAcademyDb(':memory:');
  const store = new StrategyStore(db);
  const strategy = store.activate('s1', spec, [], 1000);
  store.runAndRecord(strategy, fallingInput(), 1100);

  // Simulate a regression: the stored decision says "sell" but the engine says "buy".
  db.run("UPDATE evaluations SET result = ? WHERE strategy_id = ?", [
    JSON.stringify({ orders: [{ symbol: 'BTC/USDT', side: 'sell', sizePct: 100, reason: 'x' }], readings: {} }),
    strategy.id,
  ]);

  const check = store.verifyReplay(strategy.id);
  assert.equal(check.checked, 1);
  assert.equal(check.mismatches.length, 1, 'drift is detected, not silently accepted');
});

test('evaluations keep the exact inputs they saw', () => {
  const store = new StrategyStore(openAcademyDb(':memory:'));
  const strategy = store.activate('s1', spec, [], 1000);
  store.runAndRecord(strategy, fallingInput(), 1100);

  const records = store.evaluations(strategy.id);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.at, 1100);
  assert.equal(records[0]?.input.candles.length, 40);
  assert.equal(records[0]?.input.portfolioValue, 1000);
});
