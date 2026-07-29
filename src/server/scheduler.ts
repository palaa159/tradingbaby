/**
 * The academy bell (spec §2 "ตัวจัดตารางเวลา" + §4.3).
 * Plans each student's day, spreads cycles out, enforces per-student caps,
 * and backs off when the subscription quota pushes back.
 */

import type { CycleLedger } from './db/cycleLedger.ts';
import type { CycleKind } from './engine/prompts.ts';

export interface SchedulerConfig {
  /** Short cycles per student per day (cap — spec §10). */
  shortCyclesPerDay: number;
  /** Minute-of-day (0-1439, local) for the daily review. */
  dailyReviewMinute: number;
  /** Waking window for short cycles, minutes-of-day [start, end). */
  wakingWindow: [number, number];
  /** Base backoff when the SDK reports rate limiting, in ms. */
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export const DEFAULT_SCHEDULE: SchedulerConfig = {
  shortCyclesPerDay: 4,
  dailyReviewMinute: 22 * 60, // 22:00 — after a full day of watching
  wakingWindow: [8 * 60, 21 * 60],
  backoffBaseMs: 60_000,
  backoffMaxMs: 60 * 60_000,
};

export interface PlannedCycle {
  minuteOfDay: number;
  kind: CycleKind;
}

/**
 * Evenly spread short cycles through the waking window, then the daily
 * review. Pure and deterministic — the same config always yields the same
 * plan (students diverge by what they *do* in cycles, not when they wake).
 */
export function planDay(config: SchedulerConfig): PlannedCycle[] {
  const [start, end] = config.wakingWindow;
  const span = end - start;
  const cycles: PlannedCycle[] = [];
  const count = Math.max(0, config.shortCyclesPerDay);
  for (let i = 0; i < count; i++) {
    const minuteOfDay = Math.floor(start + (span * (i + 0.5)) / count);
    cycles.push({ minuteOfDay, kind: 'short' });
  }
  cycles.push({ minuteOfDay: config.dailyReviewMinute, kind: 'daily_review' });
  cycles.sort((a, b) => a.minuteOfDay - b.minuteOfDay);
  return cycles;
}

/** Local minute-of-day for a timestamp. Pure: same input, same answer. */
export function minuteOfDay(at: number): number {
  const d = new Date(at);
  return d.getHours() * 60 + d.getMinutes();
}

/** Local calendar day key — the unit the per-student daily cap is counted in. */
export function dayKey(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Milliseconds until shortly after the next hourly candle closes. The offset
 * gives the exchange a moment to publish the finished bar.
 */
export function msUntilNextBar(at: number, offsetMs = 60_000): number {
  const hour = 3_600_000;
  return Math.ceil((at + 1) / hour) * hour + offsetMs - at;
}

/** Milliseconds from `at` until the next local midnight. */
export function msUntilNextDay(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - at;
}

/**
 * How late a slot may fire and still count. Long enough that a slow cycle
 * running past the next bell does not lose it, short enough that a daemon
 * started at noon does not dump the whole morning at once.
 */
const GRACE_MS = 5 * 60_000;

/** Exponential backoff with a cap. attempt starts at 1. */
export function backoffMs(config: SchedulerConfig, attempt: number): number {
  return Math.min(config.backoffMaxMs, config.backoffBaseMs * 2 ** (attempt - 1));
}

/** True when an SDK/API error looks like quota pushback rather than a bug. */
export function isQuotaError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /rate.?limit|429|overloaded|quota|usage limit/i.test(text);
}

export interface SkippedCycle {
  student: string;
  kind: CycleKind;
  reason: string;
  at: number;
}

export interface BellDeps {
  runCycle: (student: string, kind: CycleKind) => Promise<void>;
  ledger: CycleLedger;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

/**
 * In-process runner: waits for each planned bell, then fires it for every
 * student that has not had that slot yet today.
 *
 * Two rules keep an unattended restart honest. A slot already in the ledger is
 * left alone, so coming back up mid-day resumes rather than replays. A slot
 * whose time passed while the school was down is written to the ledger as
 * missed rather than fired late — otherwise every restart would dump the
 * backlog at once and blow the daily cap in one burst.
 *
 * Skipped cycles (quota, errors) are recorded, not silently dropped —
 * "วันนี้หนูได้อยู่เงียบๆ" (spec §10).
 */
export class AcademyBell {
  readonly skipped: SkippedCycle[] = [];
  private readonly config: SchedulerConfig;
  private readonly deps: BellDeps;
  private readonly log: (line: string) => void;

  constructor(config: SchedulerConfig, deps: BellDeps) {
    this.config = config;
    this.deps = deps;
    this.log = deps.log ?? console.log;
  }

  /** Run one full planned day for the given students, sequentially. */
  async runDay(studentIds: string[]): Promise<void> {
    const { ledger, now, sleep } = this.deps;
    for (const cycle of planDay(this.config)) {
      const at = now();
      const day = dayKey(at);
      const pending = studentIds.filter(
        (id) => !ledger.attempted(day, id, cycle.kind, cycle.minuteOfDay),
      );
      if (pending.length === 0) continue;

      const waitMs = (cycle.minuteOfDay - minuteOfDay(at)) * 60_000;
      if (waitMs < -GRACE_MS) {
        for (const studentId of pending) {
          ledger.record({
            studentId,
            kind: cycle.kind,
            day,
            minuteOfDay: cycle.minuteOfDay,
            status: 'skipped',
            reason: 'missed — โรงเรียนไม่ได้เปิดตอนถึงคาบ',
            at,
          });
        }
        this.log(`slot ${cycle.minuteOfDay} (${cycle.kind}) missed — school was down`);
        continue;
      }
      if (waitMs > 0) await sleep(waitMs);

      for (const studentId of pending) {
        await this.fire(studentId, cycle, day);
      }
    }
  }

  /** One student, one slot: retry quota pushback, record whatever happens. */
  private async fire(studentId: string, cycle: PlannedCycle, day: string): Promise<void> {
    const { ledger, now, sleep } = this.deps;
    let attempt = 1;
    for (;;) {
      try {
        await this.deps.runCycle(studentId, cycle.kind);
        ledger.record({
          studentId,
          kind: cycle.kind,
          day,
          minuteOfDay: cycle.minuteOfDay,
          status: 'done',
          reason: undefined,
          at: now(),
        });
        return;
      } catch (error) {
        if (isQuotaError(error) && attempt < 5) {
          const wait = backoffMs(this.config, attempt);
          this.log(`quota pushback for ${studentId}; backing off ${wait}ms`);
          await sleep(wait);
          attempt += 1;
          continue;
        }
        const reason = error instanceof Error ? error.message : String(error);
        this.skipped.push({ student: studentId, kind: cycle.kind, reason, at: now() });
        ledger.record({
          studentId,
          kind: cycle.kind,
          day,
          minuteOfDay: cycle.minuteOfDay,
          status: 'skipped',
          reason,
          at: now(),
        });
        this.log(`cycle skipped for ${studentId} (${cycle.kind}) — วันนี้หนูได้อยู่เงียบๆ`);
        return;
      }
    }
  }
}
