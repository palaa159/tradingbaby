/**
 * What the Maker Designer saw, said, and changed (spec §9.4 traceability).
 *
 * An agent that edits the screen unattended has to leave the same paper trail
 * the Principal does, or the maker wakes up to a different dashboard and no
 * account of why.
 */

import type { Database } from 'bun:sqlite';

export type DesignOutcome = 'clean' | 'changed' | 'reverted' | 'failed';

export interface DesignRound {
  id: number;
  at: number;
  outcome: DesignOutcome;
  /** Machine-measured problems: overflow, tiny targets, console errors. */
  hardFlags: string[];
  /** What the model argued, in its own words. */
  findings: string[];
  /** Files it actually changed, after the zone check. */
  changed: string[];
  /** The branch the round was committed to. Empty when nothing was kept. */
  branch: string;
  note: string;
  durationMs: number;
}

interface RoundRow {
  id: number;
  at: number;
  outcome: string;
  hard_flags: string;
  findings: string;
  changed: string;
  branch: string | null;
  note: string;
  duration_ms: number;
}

export function migrateDesignLog(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS design_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      hard_flags TEXT NOT NULL DEFAULT '[]',
      findings TEXT NOT NULL DEFAULT '[]',
      changed TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS design_rounds_at ON design_rounds (at DESC)');
  addColumn(db, 'design_rounds', 'branch');
}

/**
 * Add a column to a table that already exists in the maker's database.
 *
 * Spec §9.5: schema changes are additions, never rewrites — an old row keeps
 * every meaning it had, and simply has nothing to say about the new column.
 */
export function addColumn(db: Database, table: string, column: string): void {
  const present = db
    .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
  if (!present) db.run(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
}

export class DesignLog {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    migrateDesignLog(db);
  }

  record(round: Omit<DesignRound, 'id'>): void {
    this.db.run(
      `INSERT INTO design_rounds
         (at, outcome, hard_flags, findings, changed, branch, note, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        round.at,
        round.outcome,
        JSON.stringify(round.hardFlags),
        JSON.stringify(round.findings),
        JSON.stringify(round.changed),
        round.branch,
        round.note,
        round.durationMs,
      ],
    );
  }

  recent(limit = 30): DesignRound[] {
    return this.db
      .query<RoundRow, [number]>('SELECT * FROM design_rounds ORDER BY at DESC LIMIT ?')
      .all(limit)
      .map((r) => ({
        id: r.id,
        at: r.at,
        outcome: r.outcome as DesignOutcome,
        hardFlags: JSON.parse(r.hard_flags) as string[],
        findings: JSON.parse(r.findings) as string[],
        changed: JSON.parse(r.changed) as string[],
        branch: r.branch ?? '',
        note: r.note,
        durationMs: r.duration_ms,
      }));
  }
}
