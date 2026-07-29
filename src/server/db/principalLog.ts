/**
 * The Principal's rounds, written down (spec §9.4 — "จดลงสมุดและรายงานคนสร้าง").
 *
 * Until now the Principal printed its findings and exited, so the maker could
 * only see the school's health by being at the terminal at the right moment.
 * A watchman whose observations vanish is not a watchman. Every round lands
 * here, checks and all, so the dashboard can show what was true and when.
 */

import type { Database } from 'bun:sqlite';

import type { HealthCheck, Severity } from '../../core/principal/health.ts';

export interface PrincipalRound {
  id: number;
  at: number;
  overall: Severity;
  checks: HealthCheck[];
  students: number;
  activeStrategies: number;
  openRequests: number;
  /** Strategies whose recorded evaluations were re-run this round (spec §9.5). */
  replayChecked: number;
  replayMismatches: number;
  autoMergeGreen: boolean;
}

interface RoundRow {
  id: number;
  at: number;
  overall: string;
  checks: string;
  students: number;
  active_strategies: number;
  open_requests: number;
  replay_checked: number;
  replay_mismatches: number;
  auto_merge_green: number;
}

export function migratePrincipalLog(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS principal_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      overall TEXT NOT NULL,
      checks TEXT NOT NULL,
      students INTEGER NOT NULL,
      active_strategies INTEGER NOT NULL,
      open_requests INTEGER NOT NULL,
      replay_checked INTEGER NOT NULL,
      replay_mismatches INTEGER NOT NULL,
      auto_merge_green INTEGER NOT NULL
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS principal_rounds_at ON principal_rounds (at DESC)');
}

export class PrincipalLog {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    migratePrincipalLog(db);
  }

  record(round: Omit<PrincipalRound, 'id'>): void {
    this.db.run(
      `INSERT INTO principal_rounds
         (at, overall, checks, students, active_strategies, open_requests,
          replay_checked, replay_mismatches, auto_merge_green)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        round.at,
        round.overall,
        JSON.stringify(round.checks),
        round.students,
        round.activeStrategies,
        round.openRequests,
        round.replayChecked,
        round.replayMismatches,
        round.autoMergeGreen ? 1 : 0,
      ],
    );
  }

  recent(limit = 50): PrincipalRound[] {
    return this.db
      .query<RoundRow, [number]>('SELECT * FROM principal_rounds ORDER BY at DESC LIMIT ?')
      .all(limit)
      .map((row) => ({
        id: row.id,
        at: row.at,
        overall: row.overall as Severity,
        checks: JSON.parse(row.checks) as HealthCheck[],
        students: row.students,
        activeStrategies: row.active_strategies,
        openRequests: row.open_requests,
        replayChecked: row.replay_checked,
        replayMismatches: row.replay_mismatches,
        autoMergeGreen: row.auto_merge_green === 1,
      }));
  }
}
