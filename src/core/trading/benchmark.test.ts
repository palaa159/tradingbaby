import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { alphaReport, benchmarkValue, openBenchmark, returnPct } from './benchmark.ts';

test('the benchmark spends everything, split evenly, paying fees', () => {
  const b = openBenchmark(1000, { 'BTC/USDT': 100, 'ETH/USDT': 50 }, 0, 0.001);
  assert.equal(b.holdings.length, 2);
  // 500 per symbol, minus 0.1% fee
  assert.ok(Math.abs((b.holdings[0]?.quantity ?? 0) - 4.995) < 1e-9);
  assert.ok(Math.abs((b.holdings[1]?.quantity ?? 0) - 9.99) < 1e-9);
  assert.ok(benchmarkValue(b, { 'BTC/USDT': 100, 'ETH/USDT': 50 }) < 1000, 'fees cost something');
});

test('symbols with no price are skipped rather than valued at zero', () => {
  const b = openBenchmark(1000, { 'BTC/USDT': 100, 'JUNK/USDT': 0 }, 0);
  assert.equal(b.holdings.length, 1, 'a zero price is not investable');
});

test('an empty universe leaves the benchmark in cash', () => {
  const b = openBenchmark(1000, {}, 0);
  assert.equal(benchmarkValue(b, {}), 1000);
});

test('a missing current price holds that slice at cost, not at zero', () => {
  const b = openBenchmark(1000, { A: 100, B: 100 }, 0, 0);
  // Only A has a live price; B's slice should count as its original 500.
  assert.equal(benchmarkValue(b, { A: 200 }), 1000 + 500);
});

test('alpha is skill, not weather: winning less than the market is losing', () => {
  const b = openBenchmark(1000, { A: 100 }, 0, 0);
  // Market doubled; the student only made 30%.
  const report = alphaReport(1000, 1300, b, { A: 200 });
  assert.equal(report.studentReturnPct, 30);
  assert.equal(report.benchmarkReturnPct, 100);
  assert.equal(report.alphaPct, -70);
  assert.equal(report.verdict, 'แพ้ตลาด');
});

test('losing less than the market is positive alpha', () => {
  const b = openBenchmark(1000, { A: 100 }, 0, 0);
  // Market halved; the student only lost 20%.
  const report = alphaReport(1000, 800, b, { A: 50 });
  assert.equal(report.benchmarkReturnPct, -50);
  assert.equal(report.alphaPct, 30);
  assert.equal(report.verdict, 'ชนะตลาด');
});

test('matching the market is a draw, not a win', () => {
  const b = openBenchmark(1000, { A: 100 }, 0, 0);
  const report = alphaReport(1000, 1200, b, { A: 120 });
  assert.equal(report.alphaPct, 0);
  assert.equal(report.verdict, 'เสมอตลาด');
});

test('returnPct guards against a zero base', () => {
  assert.equal(returnPct(0, 100), 0);
  assert.equal(returnPct(100, 150), 50);
});
