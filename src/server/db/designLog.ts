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
  /** How many of those there were before the edit — `hardFlags.length`. */
  flagsBefore: number;
  /** How many after the round was re-audited, or null if no re-audit ran. */
  flagsAfter: number | null;
  /** What the model argued, in its own words. */
  findings: string[];
  /** Files it actually changed, after the zone check. */
  changed: string[];
  note: string;
  durationMs: number;
}

interface RoundRow {
  id: number;
  at: number;
  outcome: string;
  hard_flags: string;
  flags_before: number;
  flags_after: number | null;
  findings: string;
  changed: string;
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
      flags_before INTEGER NOT NULL DEFAULT 0,
      flags_after INTEGER,
      findings TEXT NOT NULL DEFAULT '[]',
      changed TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS design_rounds_at ON design_rounds (at DESC)');
  // Rounds recorded before guardrail 3 existed keep 0/null: no comparison was made.
  const columns = db.query<{ name: string }, []>('PRAGMA table_info(design_rounds)').all();
  const has = (name: string): boolean => columns.some((c) => c.name === name);
  if (!has('flags_before')) {
    db.run('ALTER TABLE design_rounds ADD COLUMN flags_before INTEGER NOT NULL DEFAULT 0');
  }
  if (!has('flags_after')) db.run('ALTER TABLE design_rounds ADD COLUMN flags_after INTEGER');
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
         (at, outcome, hard_flags, flags_before, flags_after, findings, changed, note, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        round.at,
        round.outcome,
        JSON.stringify(round.hardFlags),
        round.flagsBefore,
        round.flagsAfter,
        JSON.stringify(round.findings),
        JSON.stringify(round.changed),
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
        flagsBefore: r.flags_before,
        flagsAfter: r.flags_after,
        findings: JSON.parse(r.findings) as string[],
        changed: JSON.parse(r.changed) as string[],
        note: r.note,
        durationMs: r.duration_ms,
      }));
  }
}
