import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { DEFAULT_GUARDRAILS } from '../../core/trading/guardrails.ts';
import type { Candle, StrategySpec } from '../../core/strategy/types.ts';
import { openAcademyDb } from '../db/sqliteStore.ts';
import { StrategyStore } from '../db/strategyStore.ts';
import { TradingStore } from '../db/tradingStore.ts';
import { tick } from './paperTrader.ts';

const dipBuyer: StrategySpec = {
  name: 'rsi-dip',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entry: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 35 } }],
  exit: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '>', right: { kind: 'number', value: 65 } }],
  sizePct: 50, // deliberately above the 20% house limit
};

function bars(prices: number[]): Candle[] {
  return prices.map((p, i) => ({ openTime: i * 3.6e6, open: p, high: p, low: p, close: p, volume: 100 }));
}

const falling = bars(Array.from({ length: 40 }, (_, i) => 200 - i * 2));
const rising = bars(Array.from({ length: 40 }, (_, i) => 100 + i * 2));

function setup() {
  const db = openAcademyDb(':memory:');
  const strategies = new StrategyStore(db);
  const trading = new TradingStore(db);
  const strategy = strategies.activate('s1', dipBuyer, ['hypo-7'], 1000);
  return { db, strategies, trading, strategy };
}

function input(candles: Candle[], over: Partial<Parameters<typeof tick>[0]> = {}) {
  return {
    studentId: 's1',
    at: 2000,
    candles: { 'BTC/USDT': candles },
    startingCash: 1000,
    startOfDayValue: 1000,
    feeRate: 0.001,
    ...over,
  };
}

test('a fired entry becomes a real fill, clamped by the house rules', () => {
  const { strategies, trading } = setup();
  const out = tick(input(falling), strategies, trading, DEFAULT_GUARDRAILS);

  assert.equal(out.filled.length, 1);
  assert.equal(out.filled[0]?.side, 'buy');
  assert.ok(out.filled[0]?.note.includes('ลดขนาดไม้'), 'the 50% request was clamped to 20%');

  const state = trading.portfolio('s1', 1000);
  const held = state.holdings.get('BTC/USDT');
  assert.ok(held && held.quantity > 0);
  // 20% of a 1000 portfolio, not the 50% the strategy asked for.
  assert.ok(Math.abs(held.quantity * held.avgPrice - 200) < 2);
});

test('no signal means no fill and no blocked order', () => {
  const { strategies, trading } = setup();
  const out = tick(input(rising), strategies, trading, DEFAULT_GUARDRAILS);
  assert.equal(out.filled.length, 0);
  assert.equal(out.blocked.length, 0);
});

test('the kill switch stops the fill and records why', () => {
  const { strategies, trading } = setup();
  const halted = { ...DEFAULT_GUARDRAILS, killSwitch: true };
  const out = tick(input(falling), strategies, trading, halted);

  assert.equal(out.filled.length, 0);
  assert.equal(out.blocked.length, 1);
  assert.ok(out.blocked[0]?.reason.includes('ปุ่มหยุดฉุกเฉิน'));
  assert.equal(trading.blocked('s1').length, 1, 'refusals are history too');
  assert.equal(trading.fills('s1').length, 0);
});

test('every fill traces back to its strategy version and hypotheses', () => {
  const { strategies, trading, strategy } = setup();
  tick(input(falling), strategies, trading, DEFAULT_GUARDRAILS);

  const fill = trading.fills('s1')[0];
  assert.ok(fill);
  const trace = trading.trace(fill.id, strategies);
  assert.equal(trace?.strategy?.id, strategy.id);
  assert.equal(trace?.strategy?.version, 1);
  assert.deepEqual(trace?.hypothesisIds, ['hypo-7']);
  assert.ok(trace?.fill.reason.includes('เปิดฝั่งขึ้นเพราะ'), 'the rule that fired is on the fill');
});

test('a later strategy version does not rewrite an old trade', () => {
  const { strategies, trading, strategy } = setup();
  tick(input(falling), strategies, trading, DEFAULT_GUARDRAILS);
  strategies.activate('s1', { ...dipBuyer, sizePct: 5 }, ['hypo-9'], 3000);

  const fill = trading.fills('s1')[0];
  const trace = trading.trace(fill!.id, strategies);
  assert.equal(trace?.strategy?.id, strategy.id, 'still points at v1');
  assert.equal(trace?.strategy?.status, 'retired');
  assert.deepEqual(trace?.hypothesisIds, ['hypo-7'], 'v2 beliefs did not leak backwards');
});

test('every evaluation is recorded and replays identically', () => {
  const { strategies, trading, strategy } = setup();
  tick(input(falling), strategies, trading, DEFAULT_GUARDRAILS);

  const check = strategies.verifyReplay(strategy.id);
  assert.ok(check.checked > 0);
  assert.deepEqual(check.mismatches, []);
});

test('exits close the position after an entry', () => {
  const { strategies, trading } = setup();
  tick(input(falling), strategies, trading, DEFAULT_GUARDRAILS);
  assert.equal(trading.portfolio('s1', 1000).holdings.size, 1);

  tick(input(rising, { at: 5000 }), strategies, trading, DEFAULT_GUARDRAILS);
  assert.equal(trading.portfolio('s1', 1000).holdings.size, 0, 'sold out on the exit rule');
  assert.equal(trading.fills('s1').length, 2);
});
