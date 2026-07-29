import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { cycleBudget, DEFAULT_METABOLISM, settle } from '../../core/metabolism.ts';
import type { StrategySpec } from '../../core/strategy/types.ts';
import { openAcademyDb, StudentStore } from '../db/sqliteStore.ts';
import { StrategyStore } from '../db/strategyStore.ts';
import { TradingStore } from '../db/tradingStore.ts';
import { Metabolism } from './settlement.ts';

const spec: StrategySpec = {
  name: 'rsi-dip',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entry: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 35 } }],
  exit: [],
  sizePct: 10,
};

function setup(energy = 100) {
  const db = openAcademyDb(':memory:');
  const students = new StudentStore(db);
  const strategies = new StrategyStore(db);
  const trading = new TradingStore(db);
  const metabolism = new Metabolism(db, DEFAULT_METABOLISM);
  students.enroll('s1', 'มะลิ', energy, 1000);
  db.run('UPDATE students SET energy = ? WHERE id = ?', [energy, 's1']);
  return { db, students, strategies, trading, metabolism };
}

function profitOf(trading: TradingStore, pnl: number, at = 2000) {
  // A round trip that books exactly `pnl`.
  trading.record({
    studentId: 's1', strategyId: 'x', evaluationId: null, at,
    symbol: 'BTC/USDT', side: 'buy', quantity: 1, price: 100, fee: 0,
    reason: '', guardrailNote: '',
  });
  trading.record({
    studentId: 's1', strategyId: 'x', evaluationId: null, at: at + 1,
    symbol: 'BTC/USDT', side: 'sell', quantity: 1, price: 100 + pnl, fee: 0,
    reason: '', guardrailNote: '',
  });
}

test('settle only counts P&L booked since the last settlement', () => {
  const config = DEFAULT_METABOLISM;
  const first = settle(100, 0, 30, config, 1);
  assert.equal(first.energy, 130);
  assert.equal(first.settledPnl, 30);

  // Reading the books again must not feed the same profit twice.
  const again = settle(first.energy, first.settledPnl, 30, config, 1);
  assert.equal(again.fed, 0);
  assert.equal(again.energy, 130);
});

test('hunger buys fewer cycles but never zero while alive', () => {
  assert.equal(cycleBudget('well_fed', 4), 4);
  assert.equal(cycleBudget('hungry', 4), 2);
  assert.equal(cycleBudget('starving', 4), 1, 'a starving student still gets to think');
  assert.equal(cycleBudget('suspended', 4), 0);
});

test('profit feeds energy through the store', () => {
  const { trading, strategies, metabolism } = setup(100);
  profitOf(trading, 40);

  const out = metabolism.settleStudent('s1', 1000, 3000, trading, strategies, 4);
  assert.equal(out.suspended, false);
  assert.equal(out.fed, 40);
  assert.equal(out.energy, 140);
  assert.ok(out.note.includes('กินกำไร'));

  // Settling again with no new trades changes nothing.
  const again = metabolism.settleStudent('s1', 1000, 3100, trading, strategies, 4);
  assert.equal(again.fed, 0);
  assert.equal(again.energy, 140);
});

test('a loss deep enough suspends: strategies retired, positions closed, brain intact', () => {
  const { trading, strategies, metabolism, db } = setup(20);
  const strategy = strategies.activate('s1', spec, ['h1'], 1000);

  profitOf(trading, -50); // energy 20 - 50 → clamped to 0
  // Still holding something when the lights go out.
  trading.record({
    studentId: 's1', strategyId: 'x', evaluationId: null, at: 2500,
    symbol: 'ETH/USDT', side: 'buy', quantity: 2, price: 50, fee: 0,
    reason: '', guardrailNote: '',
  });

  const out = metabolism.settleStudent('s1', 1000, 4000, trading, strategies, 4);
  assert.equal(out.suspended, true);
  assert.equal(out.cyclesAllowedToday, 0);
  assert.equal(strategies.get(strategy.id)?.status, 'retired', 'strategies stop trading');
  assert.equal(trading.portfolio('s1', 1000).holdings.size, 0, 'positions closed, none left drifting');

  const events = db.query('SELECT COUNT(*) AS n FROM events').get() as { n: number };
  assert.equal(events.n, 0, 'suspension never touches the knowledge graph');
  assert.equal(metabolism.isSuspended('s1'), true);
});

test('a suspended student stays stopped until the maker revives them', () => {
  const { trading, strategies, metabolism } = setup(10);
  profitOf(trading, -20);
  metabolism.settleStudent('s1', 1000, 4000, trading, strategies, 4);

  const while_out = metabolism.settleStudent('s1', 1000, 5000, trading, strategies, 4);
  assert.equal(while_out.suspended, true);
  assert.equal(while_out.fed, 0, 'no metabolism while suspended');

  metabolism.revive('s1', 900);
  assert.equal(metabolism.isSuspended('s1'), false);
  const back = metabolism.settleStudent('s1', 1000, 6000, trading, strategies, 4);
  assert.equal(back.suspended, false);
  assert.equal(back.energy, 900);
  assert.equal(back.cyclesAllowedToday, 4);
});

test('suspension can be turned off, and then zero energy only means starving', () => {
  const db = openAcademyDb(':memory:');
  new StudentStore(db).enroll('s1', 'ภูผา', 5, 1000);
  const trading = new TradingStore(db);
  const strategies = new StrategyStore(db);
  const lenient = new Metabolism(db, { ...DEFAULT_METABOLISM, suspensionEnabled: false });

  profitOf(trading, -50);
  const out = lenient.settleStudent('s1', 1000, 4000, trading, strategies, 4);
  assert.equal(out.suspended, false);
  assert.equal(out.energy, 0);
  assert.equal(out.hunger, 'starving');
  assert.equal(out.cyclesAllowedToday, 1, 'still gets the daily minimum');
});
