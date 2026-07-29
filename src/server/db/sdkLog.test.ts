import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { test } from 'bun:test';

import { SdkLog, type SdkCallInput, type SdkCallOutcome } from './sdkLog.ts';

function input(over: Partial<SdkCallInput> = {}): SdkCallInput {
  return {
    caller: 'cycle:short',
    studentId: 'mali-2026',
    model: 'claude-haiku-4-5',
    effort: undefined,
    systemPrompt: 'เธอคือ มะลิ',
    prompt: 'ชำเลืองดูตลาด',
    maxTurns: 20,
    ...over,
  };
}

function outcome(over: Partial<SdkCallOutcome> = {}): SdkCallOutcome {
  return {
    result: 'จดโน้ตแล้ว',
    subtype: 'success',
    isError: false,
    numTurns: 7,
    costUsd: 0.1629,
    durationMs: 112_400,
    toolCalls: ['mcp__academy__graph_read', 'mcp__academy__graph_write'],
    ...over,
  };
}

test('a call survives the round trip, prompts and tool calls intact', () => {
  const log = new SdkLog(new Database(':memory:'));
  const id = log.record(input(), outcome(), 1_000);

  const saved = log.get(id);
  assert.ok(saved);
  assert.equal(saved.caller, 'cycle:short');
  assert.equal(saved.studentId, 'mali-2026');
  assert.equal(saved.model, 'claude-haiku-4-5');
  // Prompts are stored whole: a truncated prompt explains nothing later.
  assert.equal(saved.systemPrompt, 'เธอคือ มะลิ');
  assert.equal(saved.prompt, 'ชำเลืองดูตลาด');
  assert.deepEqual(saved.toolCalls, ['mcp__academy__graph_read', 'mcp__academy__graph_write']);
  assert.equal(saved.costUsd, 0.1629);
  assert.equal(saved.isError, false);
});

test('a failed call is recorded too — those are the ones worth finding', () => {
  const log = new SdkLog(new Database(':memory:'));
  log.record(
    input({ caller: 'exam:grade', model: 'claude-opus-5', effort: 'xhigh' }),
    outcome({ result: 'rate limit', subtype: 'threw', isError: true, costUsd: undefined }),
    2_000,
  );
  const [saved] = log.recent();
  assert.ok(saved);
  assert.equal(saved.isError, true);
  assert.equal(saved.subtype, 'threw');
  assert.equal(saved.effort, 'xhigh');
  assert.equal(saved.costUsd, undefined);
});

test('calls read back newest first, and can be filtered by student', () => {
  const log = new SdkLog(new Database(':memory:'));
  log.record(input({ studentId: 'mali-2026' }), outcome(), 1_000);
  log.record(input({ studentId: 'phupha-2026' }), outcome(), 2_000);
  log.record(input({ studentId: 'mali-2026' }), outcome(), 3_000);

  assert.deepEqual(log.recent().map((c) => c.at), [3_000, 2_000, 1_000]);
  assert.equal(log.forStudent('mali-2026').length, 2);
  assert.equal(log.forStudent('phupha-2026').length, 1);
  assert.equal(log.recent(1).length, 1);
});

test('the summary shows where the subscription actually goes', () => {
  const log = new SdkLog(new Database(':memory:'));
  log.record(input({ caller: 'cycle:short' }), outcome({ costUsd: 0.1 }), 1);
  log.record(input({ caller: 'cycle:short' }), outcome({ costUsd: 0.2 }), 2);
  log.record(input({ caller: 'exam:grade' }), outcome({ costUsd: 1.5, isError: true }), 3);

  const rows = log.summary();
  const short = rows.find((r) => r.caller === 'cycle:short');
  const grade = rows.find((r) => r.caller === 'exam:grade');
  assert.ok(short && grade);
  assert.equal(short.calls, 2);
  assert.ok(Math.abs(short.costUsd - 0.3) < 1e-9);
  assert.equal(short.errors, 0);
  assert.equal(grade.calls, 1);
  assert.equal(grade.errors, 1);
});

test('an empty log is empty, not a crash', () => {
  const log = new SdkLog(new Database(':memory:'));
  assert.deepEqual(log.recent(), []);
  assert.deepEqual(log.summary(), []);
  assert.equal(log.get(1), null);
});
