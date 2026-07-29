import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { isLogName, LOG_NAMES, tail } from './processLogs.ts';

test('only the four known logs are names at all', () => {
  assert.deepEqual([...LOG_NAMES].sort(), ['dashboard', 'daemon', 'principal', 'trader'].sort());
});

test('anything that looks like a path is not a log name', () => {
  // The dashboard is served unauthenticated on a public hostname. If a caller
  // could name a file, this endpoint would be an arbitrary-file read.
  for (const hostile of [
    '../../../etc/passwd',
    '/etc/shadow',
    'daemon/../../etc/passwd',
    './daemon',
    'DAEMON',
    '',
    'academy.db',
    '..',
  ]) {
    assert.equal(isLogName(hostile), false, `${hostile} must not resolve`);
  }
});

test('the four real names do resolve', () => {
  for (const ok of LOG_NAMES) assert.equal(isLogName(ok), true);
});

test('a missing log reads as empty rather than throwing', async () => {
  const t = await tail('dashboard', 5);
  assert.ok(Array.isArray(t.lines));
  assert.equal(t.name, 'dashboard');
  assert.ok(t.lines.length <= 5);
});

test('inherited object properties are not log names', () => {
  // Object.hasOwn rather than `in`, or 'constructor' and 'toString' resolve.
  for (const inherited of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(isLogName(inherited), false, `${inherited} must not resolve`);
  }
});
