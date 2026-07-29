import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { test } from 'bun:test';

import { DEFAULT_METABOLISM } from '../../core/metabolism.ts';
import type { Candle, StrategySpec } from '../../core/strategy/types.ts';
import { DEFAULT_GUARDRAILS } from '../../core/trading/guardrails.ts';
import { openAcademyDb, StudentStore } from '../db/sqliteStore.ts';
import { StrategyStore } from '../db/strategyStore.ts';
import { TradingStore } from '../db/tradingStore.ts';
import { tradingRound } from './round.ts';
import { Metabolism } from './settlement.ts';

/** Flat candles: enough bars for indicators, no movement to reason about. */
function candles(price: number, bars = 60): Candle[] {
  return Array.from({ length: bars }, (_, i) => ({
    openTime: i * 3.6e6,
    open: price,
    high: price * 1.01,
    low: price * 0.99,
    close: price,
    volume: 100,
  }));
}

const ALWAYS_ENTER: StrategySpec = {
  name: 'always',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entry: [{ left: { kind: 'indicator', name: 'price' }, op: '>', right: { kind: 'number', value: 0 } }],
  // Never true, so a position opened in a round stays open into the next one.
  exit: [{ left: { kind: 'indicator', name: 'price' }, op: '<', right: { kind: 'number', value: 0 } }],
  sizePct: 10,
};

function world() {
  const db = openAcademyDb(':memory:');
  const students = new StudentStore(db);
  const strategies = new StrategyStore(db);
  const trading = new TradingStore(db);
  const metabolism = new Metabolism(db, DEFAULT_METABOLISM);
  const student = students.enroll('mali-2026', 'มะลิ', DEFAULT_METABOLISM.startingAllowance, 0);
  return { db, students, strategies, trading, metabolism, student };
}

function input(over: Partial<Parameters<typeof tradingRound>[0]> = {}) {
  return {
    studentIds: ['mali-2026'],
    candles: { 'BTC/USDT': candles(100) },
    at: 1_000,
    day: '2026-01-15',
    metabolism: DEFAULT_METABOLISM,
    guardrails: DEFAULT_GUARDRAILS,
    feeRate: 0.001,
    fullCycleBudget: 4,
    ...over,
  };
}

test('a round with no active strategy trades nothing but still settles', () => {
  const w = world();
  const [result] = tradingRound(input(), w.strategies, w.trading, w.metabolism);
  assert.ok(result);
  assert.equal(result.filled, 0);
  assert.equal(result.blocked, 0);
  assert.equal(result.settlement?.suspended, false);
  assert.equal(result.settlement?.fed, 0);
});

test('an active strategy fills, and does not re-open while the position is held', () => {
  const w = world();
  w.strategies.activate('mali-2026', ALWAYS_ENTER, [], 0);

  const first = tradingRound(input(), w.strategies, w.trading, w.metabolism);
  assert.equal(first[0]?.filled, 1);

  // Same rules, same prices, one bar later: the position is open, so entry is
  // not re-evaluated and nothing new is bought.
  const second = tradingRound(input({ at: 2_000 }), w.strategies, w.trading, w.metabolism);
  assert.equal(second[0]?.filled, 0);
});

test('the day-open value is written once and survives later rounds', () => {
  const w = world();
  w.strategies.activate('mali-2026', ALWAYS_ENTER, [], 0);

  tradingRound(input(), w.strategies, w.trading, w.metabolism);
  const opened = w.trading.dayOpenValueOnce('mali-2026', '2026-01-15', 999_999, 5_000);
  assert.equal(opened, DEFAULT_METABOLISM.startingAllowance, 'first value wins');

  // A different day gets its own reading.
  const nextDay = w.trading.dayOpenValueOnce('mali-2026', '2026-01-16', 500, 6_000);
  assert.equal(nextDay, 500);
});

test('a suspended student neither trades nor settles', () => {
  const w = world();
  w.strategies.activate('mali-2026', ALWAYS_ENTER, [], 0);
  w.db.run('UPDATE students SET suspended_at = ? WHERE id = ?', [1, 'mali-2026']);

  const [result] = tradingRound(input(), w.strategies, w.trading, w.metabolism);
  assert.ok(result);
  assert.equal(result.filled, 0);
  assert.equal(result.settlement, null);
  assert.equal(w.trading.fills('mali-2026').length, 0);
});
