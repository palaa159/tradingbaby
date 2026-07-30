import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { takeWorkLock } from './workLock.ts';

const dirs: string[] = [];
function lockPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'worklock-'));
  dirs.push(dir);
  return join(dir, 'agent.lock');
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('takeWorkLock', () => {
  test('the first caller gets it and the file appears', () => {
    const path = lockPath();
    const taken = takeWorkLock(path, 'designer');
    expect('lock' in taken).toBe(true);
    expect(existsSync(path)).toBe(true);
  });

  test('a live holder turns the second caller away, by name', () => {
    const path = lockPath();
    takeWorkLock(path, 'designer');
    const second = takeWorkLock(path, 'principal');
    expect('heldBy' in second && second.heldBy).toContain('designer');
  });

  test('releasing lets the next one in', () => {
    const path = lockPath();
    const first = takeWorkLock(path, 'designer');
    if (!('lock' in first)) throw new Error('expected the lock');
    first.lock.release();
    expect(existsSync(path)).toBe(false);
    expect('lock' in takeWorkLock(path, 'principal')).toBe(true);
  });

  test('a dead holder holds nothing', () => {
    const path = lockPath();
    // pid 2^22 is above every Linux pid_max default, so nothing is running there.
    writeFileSync(path, JSON.stringify({ pid: 4194304, who: 'ghost', at: 0 }));
    expect('lock' in takeWorkLock(path, 'principal')).toBe(true);
  });

  test('a corrupt lock file is not a permanent outage', () => {
    const path = lockPath();
    writeFileSync(path, 'not json');
    expect('lock' in takeWorkLock(path, 'principal')).toBe(true);
  });
});
