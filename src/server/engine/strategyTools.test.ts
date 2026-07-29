import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { MemoryEventStore, replay } from '../../core/eventLog.ts';
import { validateSpec } from '../../core/strategy/schema.ts';
import { openAcademyDb } from '../db/sqliteStore.ts';
import { StrategyStore } from '../db/strategyStore.ts';
import { StubMarketData } from '../marketData.ts';
import { addNode, type GraphOpsContext } from './graphOps.ts';
import { adoptStrategy, testStrategy } from './strategyTools.ts';

function ctxFor(): GraphOpsContext {
  let tick = 0;
  return { studentId: 's1', store: new MemoryEventStore(), now: () => ++tick };
}

const market = new StubMarketData(['BTC/USDT', 'ETH/USDT']);

const goodSpec = {
  name: 'rsi-dip',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entry: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 35 } }],
  exit: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '>', right: { kind: 'number', value: 65 } }],
  sizePct: 20,
};

test('malformed specs are refused with errors a student can act on', () => {
  const bad = validateSpec({ ...goodSpec, name: 'Has Spaces!', sizePct: 500 });
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.ok(bad.errors.some((e) => e.includes('name')));
  assert.ok(bad.errors.some((e) => e.includes('sizePct')));
});

test('unknown fields are rejected rather than silently dropped', () => {
  const sneaky = validateSpec({ ...goodSpec, leverage: 10 });
  assert.equal(sneaky.ok, false, 'a field the engine ignores must not look accepted');
});

test('entry conditions are required — a strategy with no trigger is not a strategy', () => {
  assert.equal(validateSpec({ ...goodSpec, entry: [] }).ok, false);
});

test('testing warns about nonsense that still parses', async () => {
  const ctx = ctxFor();
  const result = await testStrategy(ctx, market, { ...goodSpec, exit: [] }, undefined);
  assert.equal(result.ok, true);
  assert.ok(result.warnings?.some((w) => w.includes('ไม่มีเงื่อนไขออก')));
});

test('symbols outside the universe stop the test instead of quietly passing', async () => {
  const ctx = ctxFor();
  const result = await testStrategy(ctx, market, { ...goodSpec, symbols: ['DOGE/USDT'] }, undefined);
  assert.equal(result.ok, false);
  assert.ok(result.errors?.[0]?.includes('ไม่มีเหรียญไหนอยู่ในรายชื่อ'));
});

test('a verdict is written back onto the hypothesis as evidence', async () => {
  const ctx = ctxFor();
  const hypo = addNode(ctx, {
    kind: 'hypothesis',
    title: 'RSI ต่ำ = น่าซื้อ',
    body: '',
    confidence: 0.3,
  });

  const result = await testStrategy(ctx, market, goodSpec, hypo.id);
  assert.equal(result.ok, true);
  assert.ok(result.verdict);

  const brain = replay(ctx.store.read('s1'));
  const updated = brain.nodes.get(hypo.id);
  assert.equal(updated?.status, result.verdict?.status, 'status follows the verdict');
  assert.equal(updated?.confidence, result.verdict?.confidence, 'so does confidence');

  const evidence = [...brain.nodes.values()].find((n) => n.kind === 'lesson');
  assert.ok(evidence, 'the numbers are kept as a lesson');
  assert.ok(evidence?.body.includes('ไม้บรรทัด'), 'including what the benchmark did');

  const edges = [...brain.edges.values()].filter((e) => e.fromNodeId === hypo.id);
  assert.equal(edges.length, 1, 'the hypothesis links to its evidence');
});

test('adoption is refused when the backtest did not earn it', async () => {
  const ctx = ctxFor();
  const strategies = new StrategyStore(openAcademyDb(':memory:'));
  // A rule that never triggers cannot accumulate evidence, so it stays testing.
  const neverFires = {
    ...goodSpec,
    entry: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 1 } }],
  };

  const result = await adoptStrategy(ctx, market, strategies, neverFires, undefined);
  assert.equal(result.ok, false);
  assert.ok(result.errors?.[0]?.includes('ยังเปิดใช้ไม่ได้'));
  assert.equal(strategies.active('s1').length, 0, 'nothing was activated');
});

test('a student cannot activate a strategy by asserting it is good', async () => {
  const ctx = ctxFor();
  const strategies = new StrategyStore(openAcademyDb(':memory:'));
  // There is simply no argument field to pass — the only path to activation
  // runs through the backtest, which is the point of the design.
  const result = await adoptStrategy(ctx, market, strategies, goodSpec, undefined);
  if (result.ok) {
    assert.equal(result.verdict?.status, 'adopted', 'activation implies the judge adopted it');
    assert.equal(strategies.active('s1').length, 1);
    const brain = replay(ctx.store.read('s1'));
    assert.ok([...brain.nodes.values()].some((n) => n.kind === 'strategy'), 'and it shows in the brain');
  } else {
    assert.equal(strategies.active('s1').length, 0, 'refusal leaves nothing behind');
  }
});
