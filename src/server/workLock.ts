/**
 * One agent in the working tree at a time.
 *
 * The Designer and the Principal both edit the repo unattended, and both revert
 * a bad round with `git checkout -- .`. If their rounds overlap, the one that
 * finishes first deletes the other's work mid-edit and reverts changes it never
 * made. Each refuses to start on a dirty tree, which is nearly enough — but two
 * rounds that both begin on a clean tree race, and the loser loses everything.
 *
 * Not a general lock. A file, a pid, and the rule that a dead holder does not
 * hold anything: a crashed agent must not lock the school out forever.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface WorkLock {
  release(): void;
}

interface Holder {
  pid: number;
  who: string;
  at: number;
}

function holderOf(path: string): Holder | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Holder;
  } catch {
    // Unreadable or half-written: treat as nobody's, and say so by taking it.
    return null;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Take the lock, or return null with who holds it. `who` is for the log line the
 * other agent prints when it backs off — a lock that cannot say who took it
 * turns an ordinary skip into a mystery.
 */
export function takeWorkLock(path: string, who: string): { lock: WorkLock } | { heldBy: string } {
  if (existsSync(path)) {
    const holder = holderOf(path);
    if (holder && alive(holder.pid)) {
      return { heldBy: `${holder.who} (pid ${holder.pid})` };
    }
    rmSync(path, { force: true });
  }

  mkdirSync(dirname(path), { recursive: true });
  const holder: Holder = { pid: process.pid, who, at: Date.now() };
  // wx fails if another process created the file between the check and here.
  try {
    writeFileSync(path, JSON.stringify(holder), { flag: 'wx' });
  } catch {
    const other = holderOf(path);
    return { heldBy: other ? `${other.who} (pid ${other.pid})` : 'อีกฝ่ายหนึ่ง' };
  }

  return {
    lock: {
      release(): void {
        const current = holderOf(path);
        // Only drop our own lock: releasing someone else's is worse than leaking.
        if (current?.pid === process.pid) rmSync(path, { force: true });
      },
    },
  };
}

export const DEFAULT_LOCK_PATH = '/var/lib/alpha-academy/agent.lock';
