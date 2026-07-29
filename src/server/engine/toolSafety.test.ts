import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { MemoryEventStore } from '../../core/eventLog.ts';
import type { Candle, MarketSnapshot } from '../marketData.ts';
import type { MarketDataProvider } from '../marketData.ts';
import { testStrategy } from './strategyTools.ts';
import type { GraphOpsContext } from './graphOps.ts';

/** Stands in for the geo-blocked exchange that broke the first real backtest. */
class BrokenMarket implements MarketDataProvider {
  universe(): readonly string[] {
    return ['BTC/USDT'];
  }
  async snapshot(): Promise<MarketSnapshot> {
    throw new Error('The socket connection was closed unexpectedly');
  }
  async history(): Promise<Candle[]> {
    throw new Error('The socket connection was closed unexpectedly');
  }
}

function ctxFor(): GraphOpsContext {
  let tick = 0;
  return { studentId: 's1', store: new MemoryEventStore(), now: () => ++tick };
}

const spec = {
  name: 'rsi-dip',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entry: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 35 } }],
  exit: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '>', right: { kind: 'number', value: 65 } }],
  sizePct: 20,
};

test('a dead market surfaces as an error, not a thrown handler', async () => {
  // Before the fix this exception escaped the MCP handler, killed the bridge,
  // and the student saw a bare "socket closed" it could do nothing with.
  const ctx = ctxFor();
  await assert.rejects(
    () => testStrategy(ctx, new BrokenMarket(), spec, undefined),
    /socket connection was closed/,
    'the underlying call still fails loudly for the caller to wrap',
  );
});

test('validation runs before any network call, so a bad spec fails fast', async () => {
  const ctx = ctxFor();
  // A malformed spec must never reach the market, broken or not.
  const result = await testStrategy(ctx, new BrokenMarket(), { ...spec, sizePct: 900 }, undefined);
  assert.equal(result.ok, false);
  assert.ok(result.errors?.some((e) => e.includes('sizePct')));
});
