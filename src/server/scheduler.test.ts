import assert from 'node:assert/strict';
import { test } from 'bun:test';

import type { CycleLedger, CycleRun } from './db/cycleLedger.ts';
import {
  AcademyBell,
  backoffMs,
  dayKey,
  DEFAULT_SCHEDULE,
  isQuotaError,
  minuteOfDay,
  msUntilNextDay,
  planDay,
} from './scheduler.ts';

/**
 * A school day driven by a fake clock: `sleep` moves time forward instead of
 * waiting, so a full day runs instantly and always the same way.
 */
function harness(seeded: CycleRun[] = []) {
  let clock = new Date(2026, 0, 15).getTime(); // local midnight, fixed day
  const records: CycleRun[] = [...seeded];
  const ledger: CycleLedger = {
    attempted: (day, studentId, kind, minute) =>
      records.some(
        (r) =>
          r.day === day && r.studentId === studentId && r.kind === kind && r.minuteOfDay === minute,
      ),
    record: (run) => {
      records.push(run);
    },
  };
  return {
    records,
    ledger,
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
    set: (hour: number, minute = 0) => {
      clock = new Date(2026, 0, 15, hour, minute).getTime();
    },
  };
}

const ONE_SHORT = { ...DEFAULT_SCHEDULE, shortCyclesPerDay: 1, backoffBaseMs: 1, backoffMaxMs: 2 };

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

test('clock helpers read local time', () => {
  const at = new Date(2026, 0, 15, 14, 30).getTime();
  assert.equal(minuteOfDay(at), 14 * 60 + 30);
  assert.equal(dayKey(at), '2026-01-15');
  assert.equal(msUntilNextDay(at), (24 - 14) * 3600_000 - 30 * 60_000);
});

test('bell records skipped cycles instead of dropping them silently', async () => {
  const h = harness();
  const ran: string[] = [];
  const bell = new AcademyBell(ONE_SHORT, {
    runCycle: async (student, kind) => {
      if (student === 'broken') throw new Error('boom');
      ran.push(`${student}:${kind}`);
    },
    ledger: h.ledger,
    now: h.now,
    sleep: h.sleep,
    log: () => {},
  });

  await bell.runDay(['ok', 'broken']);

  assert.equal(bell.skipped.length, 2); // short + daily_review both failed
  assert.equal(bell.skipped[0]?.student, 'broken');
  assert.equal(ran.length, 2); // ok student ran both cycles
  // Every slot lands in the ledger, successes and failures alike.
  assert.equal(h.records.length, 4);
  assert.equal(h.records.filter((r) => r.status === 'done').length, 2);
  assert.equal(h.records.filter((r) => r.status === 'skipped').length, 2);
});

test('bell waits for the bell rather than firing the day at once', async () => {
  const h = harness();
  const firedAt: number[] = [];
  const bell = new AcademyBell(ONE_SHORT, {
    runCycle: async () => {
      firedAt.push(minuteOfDay(h.now()));
    },
    ledger: h.ledger,
    now: h.now,
    sleep: h.sleep,
    log: () => {},
  });

  await bell.runDay(['ok']);

  const plan = planDay(ONE_SHORT);
  assert.deepEqual(
    firedAt,
    plan.map((c) => c.minuteOfDay),
  );
});

test('a day already in the ledger is resumed, not replayed', async () => {
  const plan = planDay(ONE_SHORT);
  const short = plan.find((c) => c.kind === 'short');
  assert.ok(short);
  const h = harness([
    {
      studentId: 'ok',
      kind: 'short',
      day: '2026-01-15',
      minuteOfDay: short.minuteOfDay,
      status: 'done',
      reason: undefined,
      at: 0,
    },
  ]);

  const ran: string[] = [];
  const bell = new AcademyBell(ONE_SHORT, {
    runCycle: async (student, kind) => {
      ran.push(`${student}:${kind}`);
    },
    ledger: h.ledger,
    now: h.now,
    sleep: h.sleep,
    log: () => {},
  });

  await bell.runDay(['ok']);
  // The short cycle was already spent today; only the review is left.
  assert.deepEqual(ran, ['ok:daily_review']);
});

test('slots missed while the school was down are recorded, not fired late', async () => {
  const h = harness();
  h.set(23, 30); // boot after every bell has rung
  const ran: string[] = [];
  const bell = new AcademyBell(ONE_SHORT, {
    runCycle: async (student, kind) => {
      ran.push(`${student}:${kind}`);
    },
    ledger: h.ledger,
    now: h.now,
    sleep: h.sleep,
    log: () => {},
  });

  await bell.runDay(['ok']);

  assert.deepEqual(ran, []); // nothing dumped in a burst
  assert.equal(h.records.length, 2);
  assert.ok(h.records.every((r) => r.status === 'skipped'));
  assert.ok(h.records.every((r) => r.reason?.startsWith('missed')));
});
