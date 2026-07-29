/**
 * Settings the maker can change without a redeploy (spec §8).
 *
 * Stored as JSON per key and merged over the compiled defaults, so a setting
 * the maker has never touched keeps following the default when the default
 * changes. Only whitelisted, validated fields are accepted — this table is
 * reachable from an unauthenticated screen, and the scheduler decides how much
 * of the subscription gets spent.
 */

import type { Database } from 'bun:sqlite';

import type { SchedulerConfig } from '../scheduler.ts';

export function migrateSettings(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

/** What the maker is allowed to change about the school day, and within what bounds. */
export interface ScheduleSettings {
  shortCyclesPerDay: number;
  dailyReviewMinute: number;
  wakingWindow: [number, number];
}

const MAX_SHORT_CYCLES = 24;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/**
 * Coerce whatever arrived into something the scheduler can survive. The caps
 * are the point: a waking window that ends before it starts, or 500 cycles a
 * day, would either wedge the bell or burn the month's quota by lunchtime.
 */
export function sanitizeSchedule(input: unknown, current: ScheduleSettings): ScheduleSettings {
  const raw = (input ?? {}) as Partial<Record<keyof ScheduleSettings, unknown>>;

  const shortCyclesPerDay =
    typeof raw.shortCyclesPerDay === 'number' && Number.isFinite(raw.shortCyclesPerDay)
      ? clamp(raw.shortCyclesPerDay, 0, MAX_SHORT_CYCLES)
      : current.shortCyclesPerDay;

  const dailyReviewMinute =
    typeof raw.dailyReviewMinute === 'number' && Number.isFinite(raw.dailyReviewMinute)
      ? clamp(raw.dailyReviewMinute, 0, 1439)
      : current.dailyReviewMinute;

  let [start, end] = current.wakingWindow;
  if (Array.isArray(raw.wakingWindow) && raw.wakingWindow.length === 2) {
    const [a, b] = raw.wakingWindow as [unknown, unknown];
    if (typeof a === 'number' && Number.isFinite(a)) start = clamp(a, 0, 1439);
    if (typeof b === 'number' && Number.isFinite(b)) end = clamp(b, 0, 1440);
  }
  // A window that ends before it starts spreads cycles into negative time.
  if (end <= start) end = Math.min(1440, start + 60);

  return { shortCyclesPerDay, dailyReviewMinute, wakingWindow: [start, end] };
}

export class SettingsStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    migrateSettings(db);
  }

  private read<T>(key: string): T | null {
    const row = this.db
      .query<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
      .get(key);
    return row ? (JSON.parse(row.value) as T) : null;
  }

  private write(key: string, value: unknown, at: number): void {
    this.db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), at],
    );
  }

  /** Defaults, with any maker override merged over the top. */
  schedule(defaults: SchedulerConfig): SchedulerConfig {
    const stored = this.read<Partial<ScheduleSettings>>('schedule');
    if (!stored) return defaults;
    return {
      ...defaults,
      ...(stored.shortCyclesPerDay !== undefined
        ? { shortCyclesPerDay: stored.shortCyclesPerDay }
        : {}),
      ...(stored.dailyReviewMinute !== undefined
        ? { dailyReviewMinute: stored.dailyReviewMinute }
        : {}),
      ...(stored.wakingWindow !== undefined ? { wakingWindow: stored.wakingWindow } : {}),
    };
  }

  setSchedule(input: unknown, defaults: SchedulerConfig, at: number): SchedulerConfig {
    const current = this.schedule(defaults);
    const next = sanitizeSchedule(input, {
      shortCyclesPerDay: current.shortCyclesPerDay,
      dailyReviewMinute: current.dailyReviewMinute,
      wakingWindow: current.wakingWindow,
    });
    this.write('schedule', next, at);
    return { ...defaults, ...next };
  }

  updatedAt(key: string): number | null {
    const row = this.db
      .query<{ updated_at: number }, [string]>('SELECT updated_at FROM settings WHERE key = ?')
      .get(key);
    return row?.updated_at ?? null;
  }
}
