import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { test } from 'bun:test';

import type { HealthCheck } from '../../core/principal/health.ts';
import { PrincipalLog, type PrincipalRound } from './principalLog.ts';

const CHECKS: HealthCheck[] = [
  { name: 'ความทำซ้ำได้ของสูตรเทรด', severity: 'ok', detail: 'ทุกสูตรรันซ้ำแล้วได้ผลเหมือนเดิม' },
  { name: 'สมองว่างเปล่า', severity: 'warn', detail: 'มะลิ ยังไม่มีอะไรในสมอง', action: 'เฝ้าดูต่อ' },
];

function round(over: Partial<Omit<PrincipalRound, 'id'>> = {}): Omit<PrincipalRound, 'id'> {
  return {
    at: 1_000,
    overall: 'warn',
    checks: CHECKS,
    students: 3,
    activeStrategies: 0,
    openRequests: 1,
    replayChecked: 2,
    replayMismatches: 0,
    autoMergeGreen: false,
    ...over,
  };
}

test('a round survives the round trip, checks and all', () => {
  const log = new PrincipalLog(new Database(':memory:'));
  log.record(round());

  const [saved] = log.recent();
  assert.ok(saved);
  assert.equal(saved.overall, 'warn');
  assert.equal(saved.students, 3);
  assert.equal(saved.autoMergeGreen, false);
  assert.deepEqual(saved.checks, CHECKS);
  assert.equal(saved.checks[1]?.action, 'เฝ้าดูต่อ');
});

test('rounds read back newest first, and the limit holds', () => {
  const log = new PrincipalLog(new Database(':memory:'));
  log.record(round({ at: 1_000, overall: 'ok' }));
  log.record(round({ at: 2_000, overall: 'broken' }));
  log.record(round({ at: 3_000, overall: 'warn' }));

  assert.deepEqual(
    log.recent().map((r) => r.at),
    [3_000, 2_000, 1_000],
  );
  assert.equal(log.recent(1).length, 1);
  assert.equal(log.recent(1)[0]?.overall, 'warn');
});

test('an empty log is empty, not a crash', () => {
  assert.deepEqual(new PrincipalLog(new Database(':memory:')).recent(), []);
});
