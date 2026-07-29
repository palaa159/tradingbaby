import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { HEARSAY_CEILING, hearsayConfidence, pairFor } from './pairing.ts';

test('a class of fewer than two has no sessions', () => {
  assert.deepEqual(pairFor([], 0), []);
  assert.deepEqual(pairFor(['a'], 0), []);
});

test('pairing is deterministic for a given day', () => {
  const ids = ['mali', 'phupha', 'khaofang', 'daen'];
  assert.deepEqual(pairFor(ids, 3), pairFor(ids, 3));
  // Order of the input must not matter.
  assert.deepEqual(pairFor(ids, 3), pairFor([...ids].reverse(), 3));
});

test('over one rotation everyone meets everyone exactly once', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const seen = new Map<string, number>();
  for (let day = 0; day < ids.length - 1; day++) {
    for (const pair of pairFor(ids, day)) {
      const key = `${pair.a}|${pair.b}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  assert.equal(seen.size, 6, 'all 4-choose-2 pairs occurred');
  for (const count of seen.values()) assert.equal(count, 1, 'and none of them twice');
});

test('an odd class gives exactly one student a bye each day', () => {
  const ids = ['a', 'b', 'c'];
  for (let day = 0; day < 6; day++) {
    const pairs = pairFor(ids, day);
    assert.equal(pairs.length, 1);
    const busy = new Set([pairs[0]?.a, pairs[0]?.b]);
    assert.equal(busy.size, 2, 'nobody is paired with themselves');
  }
});

test('the rotation wraps and negative days are still valid', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(pairFor(ids, 0), pairFor(ids, 3));
  assert.deepEqual(pairFor(ids, -1), pairFor(ids, 2));
});

test('hearsay can never reach the confidence a proof would', () => {
  for (const skepticism of [0, 0.25, 0.5, 0.75, 1]) {
    const c = hearsayConfidence(skepticism);
    assert.ok(c <= HEARSAY_CEILING, 'capped no matter how credulous');
    assert.ok(c > 0, 'but hearing something still counts for something');
  }
});

test('skeptical students believe classmates less than credulous ones', () => {
  assert.ok(hearsayConfidence(0.9) < hearsayConfidence(0.1));
  assert.equal(hearsayConfidence(0), HEARSAY_CEILING, 'the most credulous still hits only the cap');
});
