import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { FallbackMarketData, StubMarketData, type Candle, type MarketDataProvider, type MarketSnapshot } from './marketData.ts';

class DeadMarketData implements MarketDataProvider {
  calls = 0;
  universe(): readonly string[] {
    return ['BTC/USDT'];
  }
  async history(): Promise<Candle[]> {
    this.calls++;
    throw new Error('socket connection closed');
  }
  async snapshot(): Promise<MarketSnapshot> {
    this.calls++;
    throw new Error('451 restricted location');
  }
}

test('one dead venue does not stop the school from measuring anything', async () => {
  const dead = new DeadMarketData();
  const market = new FallbackMarketData([dead, new StubMarketData()]);
  const candles = await market.history('BTC/USDT', 60);
  assert.equal(candles.length, 60);
  assert.equal(dead.calls, 1, 'the dead venue was tried, then stepped over');
});

test('the venue that answered is tried first next time', async () => {
  const dead = new DeadMarketData();
  const market = new FallbackMarketData([dead, new StubMarketData()]);
  await market.history('BTC/USDT', 10);
  await market.history('BTC/USDT', 10);
  await market.snapshot('BTC/USDT');
  assert.equal(dead.calls, 1, 'a venue known to be down is not retried on every call');
});

test('when every venue is down the error names all of them', async () => {
  const market = new FallbackMarketData([new DeadMarketData(), new DeadMarketData()]);
  await assert.rejects(
    () => market.history('BTC/USDT', 10),
    (error: Error) => {
      assert.ok(error.message.includes('socket connection closed'));
      assert.ok(error.message.includes('ดึงข้อมูลตลาดไม่ได้เลยสักเจ้า'));
      return true;
    },
  );
});

test('a fallback chain still needs somewhere to read from', () => {
  assert.throws(() => new FallbackMarketData([]));
});
