import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { test } from 'bun:test';

import { SqliteCycleLedger, type CycleRun } from './cycleLedger.ts';

function ledger(): SqliteCycleLedger {
  return new SqliteCycleLedger(new Database(':memory:'));
}

function run(over: Partial<CycleRun> = {}): CycleRun {
  return {
    studentId: 'mali-2026',
    kind: 'short',
    day: '2026-01-15',
    minuteOfDay: 870,
    status: 'done',
    reason: undefined,
    at: 1_000,
    ...over,
  };
}

test('a slot is not attempted until it is recorded', () => {
  const l = ledger();
  assert.equal(l.attempted('2026-01-15', 'mali-2026', 'short', 870), false);
  l.record(run());
  assert.equal(l.attempted('2026-01-15', 'mali-2026', 'short', 870), true);
});

test('attempted is scoped by day, student, kind and slot', () => {
  const l = ledger();
  l.record(run());
  assert.equal(l.attempted('2026-01-16', 'mali-2026', 'short', 870), false, 'other day');
  assert.equal(l.attempted('2026-01-15', 'phupha-2026', 'short', 870), false, 'other student');
  assert.equal(l.attempted('2026-01-15', 'mali-2026', 'daily_review', 870), false, 'other kind');
  assert.equal(l.attempted('2026-01-15', 'mali-2026', 'short', 1320), false, 'other slot');
});

test('a skipped cycle counts as attempted, so the wall is hit once', () => {
  const l = ledger();
  l.record(run({ status: 'skipped', reason: '429 rate limit exceeded' }));
  assert.equal(l.attempted('2026-01-15', 'mali-2026', 'short', 870), true);
  assert.equal(l.day('2026-01-15')[0]?.reason, '429 rate limit exceeded');
});

test('the day reads back in order, with reasons intact', () => {
  const l = ledger();
  l.record(run({ minuteOfDay: 870, at: 1 }));
  l.record(run({ kind: 'daily_review', minuteOfDay: 1320, status: 'skipped', reason: 'boom', at: 2 }));

  const day = l.day('2026-01-15');
  assert.equal(day.length, 2);
  assert.deepEqual(
    day.map((r) => [r.kind, r.status, r.reason]),
    [
      ['short', 'done', undefined],
      ['daily_review', 'skipped', 'boom'],
    ],
  );
  assert.deepEqual(l.day('2026-01-16'), []);
});
