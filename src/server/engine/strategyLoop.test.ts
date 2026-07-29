/**
 * Phase 2's core loop, end to end: a doubt becomes a tested belief, an adopted
 * strategy, a real fill, and a decision that still reproduces afterwards.
 *
 * The refusal paths are covered next door in strategyTools.test.ts. This is the
 * other half — what happens when the evidence *does* earn adoption — which had
 * never been asserted anywhere, and never once happened in production.
 *
 * The series is a fixture rather than live market data on purpose. Whether an
 * RSI rule beats buy-and-hold on BTC this week is the market's business; that
 * the pipeline carries an earned verdict all the way to a replayable fill is
 * the code's, and only one of those should decide whether the suite is green.
 */

import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { DEFAULT_METABOLISM } from '../../core/metabolism.ts';
import type { Candle } from '../../core/strategy/types.ts';
import { DEFAULT_GUARDRAILS } from '../../core/trading/guardrails.ts';
import { openAcademyDb, SqliteEventStore, StudentStore } from '../db/sqliteStore.ts';
import { StrategyStore } from '../db/strategyStore.ts';
import { TradingStore } from '../db/tradingStore.ts';
import { tradingRound } from '../trading/round.ts';
import { Metabolism } from '../trading/settlement.ts';
import type { MarketDataProvider, MarketSnapshot } from '../marketData.ts';
import { addNode, searchNodes, type GraphOpsContext } from './graphOps.ts';
import { adoptStrategy, testStrategy } from './strategyTools.ts';

/**
 * A clean sawtooth between 90 and 100 that ends where it began, so buy-and-hold
 * earns nothing and a rule that buys the dip has something real to beat.
 */
function sawtooth(bars: number): Candle[] {
  return Array.from({ length: bars }, (_, i) => {
    const close = 95 + 5 * Math.sin((2 * Math.PI * i) / 20);
    return {
      openTime: i * 3_600_000,
      open: close,
      high: close * 1.002,
      low: close * 0.998,
      close,
      volume: 100,
    };
  });
}

class FixtureMarket implements MarketDataProvider {
  universe(): readonly string[] {
    return ['BTC/USDT'];
  }
  async history(_symbol: string, bars: number): Promise<Candle[]> {
    return sawtooth(bars);
  }
  async snapshot(symbol: string): Promise<MarketSnapshot> {
    const candles1h = sawtooth(48);
    return { symbol, price: 95, changePct24h: 0, candles1h, fetchedAt: 0 };
  }
}

const SPEC = {
  name: 'buy-the-dip',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  sizePct: 10,
  entry: [{ left: { kind: 'indicator', name: 'price' }, op: '<', right: { kind: 'number', value: 92 } }],
  exit: [{ left: { kind: 'indicator', name: 'price' }, op: '>', right: { kind: 'number', value: 98 } }],
};

function world() {
  const db = openAcademyDb(':memory:');
  const store = new SqliteEventStore(db);
  const students = new StudentStore(db);
  const strategies = new StrategyStore(db);
  const trading = new TradingStore(db);
  const metabolism = new Metabolism(db, DEFAULT_METABOLISM);
  const student = students.enroll('mali-2026', 'มะลิ', DEFAULT_METABOLISM.startingAllowance, 0);
  let clock = 1_000;
  const ctx: GraphOpsContext = { studentId: student.id, store, now: () => (clock += 1) };
  return { db, store, students, strategies, trading, metabolism, student, ctx };
}

test('evidence that earns it carries a doubt all the way to a replayable fill', async () => {
  const w = world();
  const market = new FixtureMarket();

  const hypothesis = addNode(w.ctx, {
    kind: 'hypothesis',
    title: 'ซื้อตอนราคาต่ำกว่า 92 ขายตอนเกิน 98 ชนะการนอนถือเฉยๆ',
    body: 'entry: price < 92 · exit: price > 98',
    confidence: 0.5,
  });

  // 1. The backtest decides, not the student.
  const tested = await testStrategy(w.ctx, market, SPEC, hypothesis.id);
  assert.equal(tested.ok, true, tested.errors?.join('; ') ?? 'test should run');
  assert.equal(tested.verdict?.status, 'adopted', tested.verdict?.summary ?? '');
  assert.ok((tested.verdict?.alpha ?? 0) > 2, 'alpha must clear the adoption bar');

  // 2. The verdict is written back onto the belief as evidence.
  const believed = searchNodes(w.ctx, { kind: 'hypothesis', limit: 5 })[0];
  assert.equal(believed?.status, 'adopted');
  assert.ok((believed?.confidence ?? 0) > 0.5, 'proof raises confidence');

  // 3. Activation produces an immutable, versioned strategy.
  const adopted = await adoptStrategy(w.ctx, market, w.strategies, SPEC, hypothesis.id);
  assert.equal(adopted.ok, true, adopted.errors?.join('; ') ?? 'adoption should be allowed');
  const active = w.strategies.active(w.student.id);
  assert.equal(active.length, 1);
  assert.equal(active[0]?.version, 1);
  assert.deepEqual(active[0]?.fromHypothesisIds, [hypothesis.id]);

  // 4. The runner trades it, at a price where the rule actually fires.
  const candles = sawtooth(400);
  const atDip = candles.slice(0, 216); // sin trough — price below 92
  assert.ok((atDip[atDip.length - 1]?.close ?? 99) < 92, 'fixture must end on a dip');

  const round = tradingRound(
    {
      studentIds: [w.student.id],
      candles: { 'BTC/USDT': atDip },
      at: 5_000,
      day: '2026-01-15',
      metabolism: DEFAULT_METABOLISM,
      guardrails: DEFAULT_GUARDRAILS,
      feeRate: 0.001,
      fullCycleBudget: 4,
    },
    w.strategies,
    w.trading,
    w.metabolism,
  );
  assert.equal(round[0]?.filled, 1, 'the adopted rule should fill');
  const fills = w.trading.fills(w.student.id);
  assert.equal(fills.length, 1);
  assert.equal(fills[0]?.side, 'buy');

  // 5. The §6.2 promise: the decision behind that fill reproduces exactly.
  const check = w.strategies.verifyReplay(active[0]!.id);
  assert.ok(check.checked > 0, 'the evaluation was recorded with its inputs');
  assert.deepEqual(check.mismatches, [], 'every recorded evaluation must re-run identically');

  // 6. And the fill traces back to the strategy version that caused it.
  const trace = w.trading.trace(fills[0]!.id, w.strategies);
  assert.equal(trace?.strategy?.id, active[0]?.id);
  assert.deepEqual(trace?.hypothesisIds, [hypothesis.id]);
});
