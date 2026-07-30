/**
 * What the Principal did about a request (spec §9.4 step 4 — "รายงานคนสร้างทุกครั้ง:
 * ใครขอ ขออะไร แก้ตรงไหน ผลทดสอบเป็นยังไง").
 *
 * Separate from principal_rounds, which is the health walk. A walk happens every
 * fifteen minutes and finds nothing; a piece of work happens when a student asks
 * for something, and the maker needs the four facts above for each one.
 *
 * It is also how the Principal remembers what it has already attempted. Without
 * that, one request it cannot satisfy would be retried every round forever.
 */

import type { Database } from 'bun:sqlite';

export type WorkOutcome =
  /** Code written, checks green, waiting for the maker. */
  | 'written'
  /** Out of bounds or the checks failed — everything put back. */
  | 'reverted'
  /** The Principal read it and decided this one is the maker's call. */
  | 'handed_over'
  /** The round itself broke. */
  | 'failed';

export interface WorkItem {
  id: number;
  at: number;
  requestId: string;
  studentId: string;
  studentName: string;
  requestTitle: string;
  outcome: WorkOutcome;
  /** The zone the change landed in, once there was a change to classify. */
  zone: string;
  changed: string[];
  /** typecheck / test / build, in the order they ran. */
  checks: { name: string; ok: boolean }[];
  /** The Principal's own account of what it did and why. */
  note: string;
  durationMs: number;
}

interface WorkRow {
  id: number;
  at: number;
  request_id: string;
  student_id: string;
  student_name: string;
  request_title: string;
  outcome: string;
  zone: string;
  changed: string;
  checks: string;
  note: string;
  duration_ms: number;
}

export function migrateWorkLog(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS principal_works (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      request_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      student_name TEXT NOT NULL DEFAULT '',
      request_title TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL,
      zone TEXT NOT NULL DEFAULT '',
      changed TEXT NOT NULL DEFAULT '[]',
      checks TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS principal_works_at ON principal_works (at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS principal_works_request ON principal_works (request_id)');
}

export class WorkLog {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    migrateWorkLog(db);
  }

  record(item: Omit<WorkItem, 'id'>): void {
    this.db.run(
      `INSERT INTO principal_works
         (at, request_id, student_id, student_name, request_title, outcome, zone,
          changed, checks, note, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.at,
        item.requestId,
        item.studentId,
        item.studentName,
        item.requestTitle,
        item.outcome,
        item.zone,
        JSON.stringify(item.changed),
        JSON.stringify(item.checks),
        item.note,
        item.durationMs,
      ],
    );
  }

  /** Requests the Principal has already had a go at, successful or not. */
  attemptedRequestIds(): Set<string> {
    return new Set(
      this.db
        .query<{ request_id: string }, []>('SELECT DISTINCT request_id FROM principal_works')
        .all()
        .map((r) => r.request_id),
    );
  }

  recent(limit = 30): WorkItem[] {
    return this.db
      .query<WorkRow, [number]>('SELECT * FROM principal_works ORDER BY at DESC LIMIT ?')
      .all(limit)
      .map((r) => ({
        id: r.id,
        at: r.at,
        requestId: r.request_id,
        studentId: r.student_id,
        studentName: r.student_name,
        requestTitle: r.request_title,
        outcome: r.outcome as WorkOutcome,
        zone: r.zone,
        changed: JSON.parse(r.changed) as string[],
        checks: JSON.parse(r.checks) as { name: string; ok: boolean }[],
        note: r.note,
        durationMs: r.duration_ms,
      }));
  }
}
