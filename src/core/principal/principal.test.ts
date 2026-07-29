import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { runHealthChecks, worstSeverity, type SchoolVitals } from './health.ts';
import { classifyChange, classifyFile, decideAction, DEFAULT_POLICY } from './zones.ts';

// ---------- zones ----------

test('the promises this system makes are all red', () => {
  for (const path of [
    'src/core/trading/guardrails.ts',
    'src/core/strategy/evaluate.ts',
    'src/core/strategy/indicators.ts',
    'src/core/eventLog.ts',
  ]) {
    assert.equal(classifyFile(path).zone, 'red', path);
  }
});

test('the Principal cannot widen its own permissions', () => {
  assert.equal(classifyFile('src/core/principal/zones.ts').zone, 'red');
  assert.equal(classifyFile('src/core/principal/health.ts').zone, 'red');
});

test('anything touching real money is red however it is named', () => {
  assert.equal(classifyFile('src/server/trading/liveExchange.ts').zone, 'red');
  assert.equal(classifyFile('src/server/realMoneyAdapter.ts').zone, 'red');
});

test('an unrecognised file is yellow, never green', () => {
  assert.equal(classifyFile('src/something/brand-new.ts').zone, 'yellow');
});

test('a change is as restricted as its most restricted file', () => {
  const mixed = classifyChange([
    'docs/PHASE2.md',
    'src/app/brain/page.tsx',
    'src/core/trading/guardrails.ts',
  ]);
  assert.equal(mixed.zone, 'red');
  assert.ok(mixed.reason.includes('guardrails.ts'));
  assert.equal(mixed.perFile.length, 3);
});

test('an all-green change stays green', () => {
  const green = classifyChange(['docs/PHASE2.md', 'src/server/dashboard/queries.ts']);
  assert.equal(green.zone, 'green');
});

test('the screen and its primitives are both green — the Designer edits both', () => {
  const ui = classifyChange(['src/app/brain/page.tsx', 'src/components/ui/slider.tsx']);
  assert.equal(ui.zone, 'green');
});

test('red is refused outright, whatever the policy says', () => {
  const red = classifyChange(['src/core/eventLog.ts']);
  const permissive = { autoMergeGreen: true };
  assert.equal(decideAction(red, permissive).action, 'refuse');
});

test('yellow always waits, even with auto-merge on', () => {
  const yellow = classifyChange(['src/server/db/sqliteStore.ts']);
  assert.equal(decideAction(yellow, { autoMergeGreen: true }).action, 'await_approval');
});

test('green waits by default and merges only once the maker opts in', () => {
  const green = classifyChange(['docs/PHASE2.md']);
  assert.equal(decideAction(green, DEFAULT_POLICY).action, 'await_approval');
  assert.equal(DEFAULT_POLICY.autoMergeGreen, false, 'trust is earned, not assumed');
  assert.equal(decideAction(green, { autoMergeGreen: true }).action, 'merge');
});

// ---------- health ----------

function vitals(over: Partial<SchoolVitals> = {}): SchoolVitals {
  return {
    students: [
      { id: 'a', name: 'มะลิ', energy: 900, suspended: false, eventCount: 40, lastEventAt: 1000 },
    ],
    replayMismatches: [],
    activeStrategies: 1,
    openRequests: 0,
    now: 1000,
    ...over,
  };
}

test('a healthy school reports ok', () => {
  assert.equal(worstSeverity(runHealthChecks(vitals())), 'ok');
});

test('replay drift is broken, not a warning', () => {
  const checks = runHealthChecks(vitals({ replayMismatches: [{ strategyId: 'x', mismatches: 3 }] }));
  const replay = checks.find((c) => c.name.includes('ทำซ้ำ'));
  assert.equal(replay?.severity, 'broken');
  assert.ok(replay?.action?.includes('หยุดปล่อยของทันที'));
});

test('a mismatch count of zero is not drift', () => {
  const checks = runHealthChecks(vitals({ replayMismatches: [{ strategyId: 'x', mismatches: 0 }] }));
  assert.equal(worstSeverity(checks), 'ok');
});

test('one suspended student warns, the whole class suspended is broken', () => {
  const one = runHealthChecks(
    vitals({
      students: [
        { id: 'a', name: 'มะลิ', energy: 0, suspended: true, eventCount: 40, lastEventAt: 1000 },
        { id: 'b', name: 'ภูผา', energy: 500, suspended: false, eventCount: 20, lastEventAt: 1000 },
      ],
    }),
  );
  assert.equal(worstSeverity(one), 'warn');

  const all = runHealthChecks(
    vitals({
      students: [
        { id: 'a', name: 'มะลิ', energy: 0, suspended: true, eventCount: 40, lastEventAt: 1000 },
      ],
    }),
  );
  assert.equal(worstSeverity(all), 'broken', 'a school with nobody learning is not merely unwell');
});

test('a student who has not thought in a day and a half is flagged', () => {
  const checks = runHealthChecks(vitals({ now: 1000 + 40 * 60 * 60 * 1000 }));
  const quiet = checks.find((c) => c.name.includes('เงียบ'));
  assert.ok(quiet, 'silence is a symptom');
  assert.ok(quiet?.action?.includes('ตัวจัดตาราง'));
});

test('a suspended student is not also reported as quiet', () => {
  const checks = runHealthChecks(
    vitals({
      students: [
        { id: 'a', name: 'มะลิ', energy: 0, suspended: true, eventCount: 40, lastEventAt: 0 },
      ],
      now: 99_999_999,
    }),
  );
  assert.equal(checks.filter((c) => c.name.includes('เงียบ')).length, 0);
});

test('no proven strategies is reported as a fact, not a failure', () => {
  const checks = runHealthChecks(vitals({ activeStrategies: 0 }));
  const none = checks.find((c) => c.name === 'สูตรที่เปิดใช้อยู่');
  assert.equal(none?.severity, 'warn');
  assert.ok(none?.action?.includes('ไม่ใช่ข้อผิดพลาด'));
});

test('an empty school asks to be started rather than declaring itself broken', () => {
  const checks = runHealthChecks(vitals({ students: [] }));
  assert.equal(worstSeverity(checks), 'warn');
  assert.ok(checks.some((c) => c.action?.includes('bun run cycle')));
});
