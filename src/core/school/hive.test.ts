import assert from 'node:assert/strict';
import { test } from 'bun:test';

import type { StrategySpec } from '../strategy/types.ts';
import { buildLibrary, claimKey, librarySummary, type ClaimRecord } from './hive.ts';

function spec(over: Partial<StrategySpec> = {}): StrategySpec {
  return {
    name: 'rsi-dip',
    symbols: ['BTC/USDT'],
    timeframe: '1h',
    entry: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 30 } }],
    exit: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '>', right: { kind: 'number', value: 70 } }],
    sizePct: 20,
    ...over,
  };
}

function record(studentId: string, status: 'adopted' | 'debunked', over: Partial<StrategySpec> = {}, at = 1): ClaimRecord {
  return {
    spec: spec(over),
    verdict: { studentId, studentName: studentId, status, alphaPct: status === 'adopted' ? 5 : -5, confidence: 0.7, at },
  };
}

test('the same rule written differently is still the same claim', () => {
  const a = spec({ name: 'mali-idea', symbols: ['BTC/USDT'], sizePct: 20 });
  const b = spec({ name: 'phupha-thing', symbols: ['ETH/USDT', 'BTC/USDT'], sizePct: 50 });
  assert.equal(claimKey(a), claimKey(b), 'name, symbols, and size are how you apply a belief, not the belief');
});

test('condition order does not create a different claim', () => {
  const c1 = { left: { kind: 'indicator' as const, name: 'rsi' as const, period: 14 }, op: '<' as const, right: { kind: 'number' as const, value: 30 } };
  const c2 = { left: { kind: 'indicator' as const, name: 'volume' as const }, op: '>' as const, right: { kind: 'number' as const, value: 100 } };
  assert.equal(claimKey(spec({ entry: [c1, c2] })), claimKey(spec({ entry: [c2, c1] })));
});

test('a different threshold is a different claim', () => {
  const strict = spec({ entry: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 20 } }] });
  assert.notEqual(claimKey(spec()), claimKey(strict));
});

test('one student proving something is not the school knowing it', () => {
  const library = buildLibrary([record('mali', 'adopted')], { classSize: 3 });
  assert.equal(library[0]?.consensus, 'insufficient');
  assert.equal(library[0]?.adoptedBy, 1);
});

test('three agreeing students in a class of three endorses the claim', () => {
  const library = buildLibrary(
    [record('mali', 'adopted'), record('phupha', 'adopted'), record('khaofang', 'adopted')],
    { classSize: 3 },
  );
  assert.equal(library[0]?.consensus, 'endorsed');
  assert.equal(library[0]?.adoptedBy, 3);
});

test('a large class needs more than a bare quorum', () => {
  const three = ['a', 'b', 'c'].map((id) => record(id, 'adopted'));
  // Three verifiers clears minVerifiers but not a majority of ten.
  assert.equal(buildLibrary(three, { classSize: 10 })[0]?.consensus, 'insufficient');
});

test('agreement that something fails is also knowledge', () => {
  const library = buildLibrary(
    [record('mali', 'debunked'), record('phupha', 'debunked'), record('khaofang', 'debunked')],
    { classSize: 3 },
  );
  assert.equal(library[0]?.consensus, 'rejected');
  assert.ok(library[0]?.meanAlphaPct < 0);
});

test('any real disagreement surfaces rather than being averaged away', () => {
  const library = buildLibrary(
    [record('mali', 'adopted'), record('phupha', 'debunked'), record('khaofang', 'adopted')],
    { classSize: 3 },
  );
  assert.equal(library[0]?.consensus, 'disputed', 'two against one is still an argument');
  assert.equal(library[0]?.adoptedBy, 2);
  assert.equal(library[0]?.debunkedBy, 1);
});

test('a student who changes its mind votes once, with its latest verdict', () => {
  const library = buildLibrary(
    [record('mali', 'adopted', {}, 1), record('mali', 'debunked', {}, 5)],
    { classSize: 3 },
  );
  assert.equal(library[0]?.verdicts.length, 1);
  assert.equal(library[0]?.verdicts[0]?.status, 'debunked');
});

test('live arguments are ranked above settled facts', () => {
  const disputed = [record('a', 'adopted'), record('b', 'debunked')];
  const endorsed = ['a', 'b', 'c'].map((id) =>
    record(id, 'adopted', { entry: [{ left: { kind: 'indicator', name: 'ema', period: 50 }, op: '>', right: { kind: 'number', value: 0 } }] }),
  );
  const library = buildLibrary([...endorsed, ...disputed], { classSize: 3 });
  assert.equal(library[0]?.consensus, 'disputed', 'the maker sees the fight first');
  assert.equal(library[1]?.consensus, 'endorsed');
});

test('the summary counts each kind of entry', () => {
  const library = buildLibrary(
    [
      record('a', 'adopted'),
      record('b', 'adopted'),
      record('c', 'adopted'),
      record('a', 'debunked', { timeframe: '4h' }),
      record('b', 'adopted', { timeframe: '4h' }),
    ],
    { classSize: 3 },
  );
  const summary = librarySummary(library);
  assert.equal(summary.endorsed, 1);
  assert.equal(summary.disputed, 1);
});

test('the readable statement is for people, not for matching', () => {
  const library = buildLibrary([record('mali', 'adopted')], { classSize: 3 });
  const statement = library[0]?.statement ?? '';
  assert.ok(!statement.includes('#'), 'matching sigils must not leak into what the maker reads');
  assert.ok(statement.includes('rsi(14) < 30'));
});
