import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { AcademyBell, backoffMs, DEFAULT_SCHEDULE, isQuotaError, planDay } from './scheduler.ts';

test('planDay spreads short cycles in the waking window and ends with review', () => {
  const plan = planDay(DEFAULT_SCHEDULE);
  assert.equal(plan.length, DEFAULT_SCHEDULE.shortCyclesPerDay + 1);
  assert.equal(plan[plan.length - 1]?.kind, 'daily_review');

  const [start, end] = DEFAULT_SCHEDULE.wakingWindow;
  for (const cycle of plan.filter((c) => c.kind === 'short')) {
    assert.ok(cycle.minuteOfDay >= start && cycle.minuteOfDay < end);
  }
  // deterministic: same config, same plan
  assert.deepEqual(planDay(DEFAULT_SCHEDULE), plan);
});

test('backoff grows exponentially and caps', () => {
  assert.equal(backoffMs(DEFAULT_SCHEDULE, 1), 60_000);
  assert.equal(backoffMs(DEFAULT_SCHEDULE, 2), 120_000);
  assert.equal(backoffMs(DEFAULT_SCHEDULE, 20), DEFAULT_SCHEDULE.backoffMaxMs);
});

test('quota errors are recognized', () => {
  assert.ok(isQuotaError(new Error('429 rate limit exceeded')));
  assert.ok(isQuotaError(new Error('usage limit reached')));
  assert.ok(!isQuotaError(new Error('TypeError: undefined is not a function')));
});

test('bell records skipped cycles instead of dropping them silently', async () => {
  const config = { ...DEFAULT_SCHEDULE, shortCyclesPerDay: 1, backoffBaseMs: 1, backoffMaxMs: 2 };
  const failures: string[] = [];
  const bell = new AcademyBell(
    config,
    async (student, kind) => {
      if (student === 'broken') throw new Error('boom');
      failures.push(`${student}:${kind}`);
    },
    () => {},
  );

  await bell.runDay(['ok', 'broken'], () => 123);
  assert.equal(bell.skipped.length, 2); // short + daily_review both failed
  assert.equal(bell.skipped[0]?.student, 'broken');
  assert.equal(bell.skipped[0]?.at, 123);
  assert.equal(failures.length, 2); // ok student ran both cycles
});
