import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { alphaScore, backtest, buyAndHold } from './backtest.ts';
import { judge } from './hypothesis.ts';
import type { Candle, StrategySpec } from './types.ts';

function bars(prices: number[]): Candle[] {
  return prices.map((p, i) => ({
    openTime: i * 3_600_000,
    open: p,
    high: p,
    low: p,
    close: p,
    volume: 100,
  }));
}

/** Zig-zag: dips deep enough to trip RSI, then recovers. */
function sawtooth(cycles: number, length: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < cycles; c++) {
    for (let i = 0; i < length; i++) out.push(100 - i * 3);
    for (let i = 0; i < length; i++) out.push(100 - (length - 1) * 3 + i * 3);
  }
  return out;
}

const rsiDip: StrategySpec = {
  name: 'rsi-dip',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entry: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 35 } }],
  exit: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '>', right: { kind: 'number', value: 65 } }],
  sizePct: 100,
};

test('backtest never looks ahead and is deterministic', () => {
  const candles = bars(sawtooth(4, 20));
  const a = backtest(rsiDip, 'BTC/USDT', candles);
  const b = backtest(rsiDip, 'BTC/USDT', candles);
  assert.equal(JSON.stringify(a), JSON.stringify(b));

  for (const trade of a.trades) {
    assert.ok(trade.exitTime > trade.entryTime, 'exits come after entries');
  }
});

test('a strategy that never triggers ends flat, holding no position', () => {
  // Straight up: RSI never dips below 35, so no entry ever fires.
  const result = backtest(rsiDip, 'BTC/USDT', bars(Array.from({ length: 80 }, (_, i) => 100 + i)));
  assert.equal(result.trades.length, 0);
  assert.equal(result.finalValue, result.startingCash);
  assert.equal(result.returnPct, 0);
});

test('fees make a round trip at the same price a small loss', () => {
  const candles = bars(sawtooth(3, 20));
  const free = backtest(rsiDip, 'BTC/USDT', candles, { feeRate: 0 });
  const costly = backtest(rsiDip, 'BTC/USDT', candles, { feeRate: 0.01 });
  assert.ok(costly.finalValue < free.finalValue, 'fees cannot help');
});

test('buy-and-hold tracks the market and reports drawdown', () => {
  const up = buyAndHold(bars(Array.from({ length: 60 }, (_, i) => 100 + i)));
  assert.ok(up.returnPct > 0);

  const down = buyAndHold(bars(Array.from({ length: 60 }, (_, i) => 160 - i)));
  assert.ok(down.returnPct < 0);
  assert.ok(down.maxDrawdownPct > 0, 'a falling market drew down');
});

test('alpha is return above the benchmark, not raw profit', () => {
  const strategy = { ...buyAndHold(bars([1])), returnPct: 30 };
  const benchmark = { ...buyAndHold(bars([1])), returnPct: 40 };
  assert.equal(alphaScore(strategy, benchmark), -10);
});

test('judge: profitable but losing to the market is debunked, not adopted', () => {
  const strategy = {
    ...buyAndHold(bars([1])),
    returnPct: 30,
    maxDrawdownPct: 5,
    winRate: 80,
    trades: new Array(10).fill(null).map(() => ({ pnl: 1 })) as never,
  };
  const benchmark = { ...buyAndHold(bars([1])), returnPct: 40 };

  const verdict = judge(0.5, strategy, benchmark);
  assert.equal(verdict.status, 'debunked');
  assert.equal(verdict.alpha, -10);
  assert.ok(verdict.confidence < 0.5, 'belief drops on contrary evidence');
});

test('judge: too few trades stays testing and leaves confidence alone', () => {
  const strategy = {
    ...buyAndHold(bars([1])),
    returnPct: 90,
    trades: [{ pnl: 1 }, { pnl: 1 }] as never,
  };
  const verdict = judge(0.4, strategy, { ...buyAndHold(bars([1])), returnPct: 0 });
  assert.equal(verdict.status, 'testing');
  assert.equal(verdict.confidence, 0.4);
});

test('judge: real alpha adopts but only moves belief partway', () => {
  const strategy = {
    ...buyAndHold(bars([1])),
    returnPct: 20,
    winRate: 60,
    maxDrawdownPct: 8,
    trades: new Array(12).fill(null).map(() => ({ pnl: 1 })) as never,
  };
  const verdict = judge(0.4, strategy, { ...buyAndHold(bars([1])), returnPct: 5 });
  assert.equal(verdict.status, 'adopted');
  assert.equal(verdict.confidence, 0.7, 'halfway to certainty, never all the way');
});

test('judge: a deep drawdown debunks even with positive alpha', () => {
  const strategy = {
    ...buyAndHold(bars([1])),
    returnPct: 50,
    maxDrawdownPct: 65,
    winRate: 55,
    trades: new Array(10).fill(null).map(() => ({ pnl: 1 })) as never,
  };
  const verdict = judge(0.6, strategy, { ...buyAndHold(bars([1])), returnPct: 10 });
  assert.equal(verdict.status, 'debunked');
  assert.ok(verdict.summary.includes('เสี่ยงเกินรับไหว'));
});
