import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { StubMarketData } from '../marketData.ts';
import { marketGlance } from './tools.ts';

test('no bars arg — behaves exactly like the old fixed 12h glance', async () => {
  const market = new StubMarketData();
  const result = await marketGlance(market, 'BTC/USDT');
  assert.equal((result.last12h as unknown[]).length, 12);
  assert.equal((result.last12hVolume as unknown[]).length, 12);
  assert.equal('candles' in result, false, 'no bars requested — no extra field added');
  assert.equal('candlesVolume' in result, false);
});

test('phupha-2026: bars lets a student look back past 12h, e.g. for a 1000-candle backtest review', async () => {
  const market = new StubMarketData();
  const result = await marketGlance(market, 'BTC/USDT', 1000);
  assert.equal((result.candles as unknown[]).length, 1000);
  assert.equal((result.candlesVolume as unknown[]).length, 1000);
  // old fields stay put — nothing about the original response shape changed
  assert.equal((result.last12h as unknown[]).length, 12);
});

test('bars is trimmed to exactly what was asked, even if the provider over-returns', async () => {
  // Binance's history() floors requests below 50 bars to 50 — market_glance
  // must still hand back exactly what the student asked for.
  class OverReturningMarket extends StubMarketData {
    override async history(symbol: string): Promise<import('../marketData.ts').Candle[]> {
      return super.history(symbol, 50);
    }
  }
  const result = await marketGlance(new OverReturningMarket(), 'BTC/USDT', 5);
  assert.equal((result.candles as unknown[]).length, 5);
});
