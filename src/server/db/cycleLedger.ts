/**
 * What actually ran, and what did not (spec §10 — "จดไว้ว่ารอบไหนโดนข้าม").
 *
 * Append-only like the event log. The daemon asks this table what it already
 * did today, so a restart resumes the day instead of replaying it and spending
 * the quota twice. A skipped cycle is recorded, never silently dropped — the
 * ledger is the evidence behind "วันนี้หนูได้อยู่เงียบๆ".
 */

import type { Database } from 'bun:sqlite';

import type { CycleKind } from '../engine/prompts.ts';

export type CycleStatus = 'done' | 'skipped';

export interface CycleRun {
  studentId: string;
  kind: CycleKind;
  /** Local calendar day, 'YYYY-MM-DD' — the unit the daily cap is counted in. */
  day: string;
  /** Which planned slot this was, so a re-plan does not double-fire one slot. */
  minuteOfDay: number;
  status: CycleStatus;
  reason: string | undefined;
  at: number;
}

/** The slice of the ledger the scheduler needs — lets it be tested without a database. */
export interface CycleLedger {
  attempted(day: string, studentId: string, kind: CycleKind, minuteOfDay: number): boolean;
  record(run: CycleRun): void;
}

interface CycleRunRow {
  student_id: string;
  kind: string;
  day: string;
  minute_of_day: number;
  status: string;
  reason: string | null;
  at: number;
}

export function migrateCycleLedger(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS cycle_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      day TEXT NOT NULL,
      minute_of_day INTEGER NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      at INTEGER NOT NULL
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS cycle_runs_day ON cycle_runs (day, student_id)');
}

export class SqliteCycleLedger implements CycleLedger {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    migrateCycleLedger(db);
  }

  /**
   * True once a slot has been *attempted*. Skipped counts as attempted on
   * purpose: a student that hit the quota wall should not be walked back into
   * the same wall for the rest of the day.
   */
  attempted(day: string, studentId: string, kind: CycleKind, minuteOfDay: number): boolean {
    const row = this.db
      .query<{ n: number }, [string, string, string, number]>(
        'SELECT COUNT(*) AS n FROM cycle_runs WHERE day = ? AND student_id = ? AND kind = ? AND minute_of_day = ?',
      )
      .get(day, studentId, kind, minuteOfDay);
    return (row?.n ?? 0) > 0;
  }

  record(run: CycleRun): void {
    this.db.run(
      'INSERT INTO cycle_runs (student_id, kind, day, minute_of_day, status, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [run.studentId, run.kind, run.day, run.minuteOfDay, run.status, run.reason ?? null, run.at],
    );
  }

  /** Per-day totals, newest first — the maker's "has the bell been ringing?" view. */
  dayCounts(limit = 14): { day: string; done: number; skipped: number }[] {
    return this.db
      .query<{ day: string; done: number; skipped: number }, [number]>(
        `SELECT day,
                SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped
         FROM cycle_runs GROUP BY day ORDER BY day DESC LIMIT ?`,
      )
      .all(limit);
  }

  /** Everything attempted on one day, oldest first — what the maker reads back. */
  day(day: string): CycleRun[] {
    return this.db
      .query<CycleRunRow, [string]>('SELECT * FROM cycle_runs WHERE day = ? ORDER BY id')
      .all(day)
      .map((row) => ({
        studentId: row.student_id,
        kind: row.kind as CycleKind,
        day: row.day,
        minuteOfDay: row.minute_of_day,
        status: row.status as CycleStatus,
        reason: row.reason ?? undefined,
        at: row.at,
      }));
  }
}
