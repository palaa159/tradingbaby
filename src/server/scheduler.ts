/**
 * The academy bell (spec §2 "ตัวจัดตารางเวลา" + §4.3).
 * Plans each student's day, spreads cycles out, enforces per-student caps,
 * and backs off when the subscription quota pushes back.
 */

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

/**
 * Simple in-process runner: fires planned cycles for each student in turn.
 * Skipped cycles (quota, errors) are recorded, not silently dropped —
 * "วันนี้หนูได้อยู่เงียบๆ" (spec §10).
 */
export class AcademyBell {
  readonly skipped: SkippedCycle[] = [];
  private readonly config: SchedulerConfig;
  private readonly runCycleFn: (student: string, kind: CycleKind) => Promise<void>;
  private readonly log: (line: string) => void;

  constructor(
    config: SchedulerConfig,
    runCycleFn: (student: string, kind: CycleKind) => Promise<void>,
    log: (line: string) => void = console.log,
  ) {
    this.config = config;
    this.runCycleFn = runCycleFn;
    this.log = log;
  }

  /** Run one full planned day for the given students, sequentially. */
  async runDay(studentIds: string[], now: () => number = Date.now): Promise<void> {
    const plan = planDay(this.config);
    for (const cycle of plan) {
      for (const studentId of studentIds) {
        let attempt = 1;
        for (;;) {
          try {
            await this.runCycleFn(studentId, cycle.kind);
            break;
          } catch (error) {
            if (isQuotaError(error) && attempt < 5) {
              const wait = backoffMs(this.config, attempt);
              this.log(`quota pushback for ${studentId}; backing off ${wait}ms`);
              await new Promise((resolve) => setTimeout(resolve, wait));
              attempt += 1;
              continue;
            }
            this.skipped.push({
              student: studentId,
              kind: cycle.kind,
              reason: error instanceof Error ? error.message : String(error),
              at: now(),
            });
            this.log(`cycle skipped for ${studentId} (${cycle.kind}) — วันนี้หนูได้อยู่เงียบๆ`);
            break;
          }
        }
      }
    }
  }
}
