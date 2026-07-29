/**
 * The maker's control over who is in the school (spec §3.4).
 *
 * Enrolment, renaming, suspension and revival are explicitly the maker's call,
 * not the student's. Two lines this deliberately does not cross:
 *
 * Nothing here edits knowledge. The maker observes brains and never writes to
 * them (spec §8) — the event log stays the students' own.
 *
 * Expulsion is a flag, never a DELETE. The build contract (§9.5) says old
 * brains, diaries and event logs stay readable forever; dropping the rows would
 * make every past decision by that student unexplainable, which is precisely
 * what the contract forbids. An expelled student stops being taught and stops
 * trading, and their record survives.
 */

import type { Database } from 'bun:sqlite';

import { personalityFromSeed } from '../../core/personality.ts';
import type { Student } from '../../core/types.ts';

export interface RosterEntry extends Student {
  suspended: boolean;
  expelled: boolean;
}

interface RosterRow {
  id: string;
  name: string;
  energy: number;
  enrolled_at: number;
  suspended_at: number | null;
  expelled_at: number | null;
}

export function migrateRoster(db: Database): void {
  // Self-sufficient on purpose: `suspended_at` is otherwise created by the
  // metabolism migration, and the roster must not depend on which store
  // happened to open the database first.
  const columns = db.query<{ name: string }, []>('PRAGMA table_info(students)').all();
  const has = (name: string) => columns.some((c) => c.name === name);
  if (!has('suspended_at')) db.run('ALTER TABLE students ADD COLUMN suspended_at INTEGER');
  if (!has('expelled_at')) db.run('ALTER TABLE students ADD COLUMN expelled_at INTEGER');
}

function toEntry(row: RosterRow): RosterEntry {
  return {
    id: row.id,
    name: row.name,
    personality: personalityFromSeed(row.id),
    energy: row.energy,
    enrolledAt: row.enrolled_at,
    suspended: row.suspended_at != null,
    expelled: row.expelled_at != null,
  };
}

export class Roster {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    migrateRoster(db);
  }

  all(): RosterEntry[] {
    return this.db
      .query<RosterRow, []>(
        'SELECT id, name, energy, enrolled_at, suspended_at, expelled_at FROM students ORDER BY enrolled_at',
      )
      .all()
      .map(toEntry);
  }

  get(id: string): RosterEntry | null {
    const row = this.db
      .query<RosterRow, [string]>(
        'SELECT id, name, energy, enrolled_at, suspended_at, expelled_at FROM students WHERE id = ?',
      )
      .get(id);
    return row ? toEntry(row) : null;
  }

  /** Who the bell should ring for: enrolled, not suspended, not expelled. */
  active(): RosterEntry[] {
    return this.all().filter((s) => !s.suspended && !s.expelled);
  }

  /**
   * Enrol a new student. The seed *is* the id and the personality is derived
   * from it, so re-using a seed brings back the same student rather than
   * creating a twin.
   */
  enroll(seed: string, name: string, startingEnergy: number, at: number): RosterEntry {
    const existing = this.get(seed);
    if (existing) return existing;
    this.db.run('INSERT INTO students (id, name, energy, enrolled_at) VALUES (?, ?, ?, ?)', [
      seed,
      name,
      startingEnergy,
      at,
    ]);
    return this.get(seed) as RosterEntry;
  }

  /** Renaming is cosmetic on purpose: the id and personality come from the seed. */
  rename(id: string, name: string): void {
    this.db.run('UPDATE students SET name = ? WHERE id = ?', [name, id]);
  }

  suspend(id: string, at: number): void {
    this.db.run('UPDATE students SET suspended_at = ?, energy = 0 WHERE id = ?', [at, id]);
  }

  revive(id: string, allowance: number): void {
    this.db.run('UPDATE students SET suspended_at = NULL, energy = ? WHERE id = ?', [allowance, id]);
  }

  expel(id: string, at: number): void {
    this.db.run('UPDATE students SET expelled_at = ?, energy = 0 WHERE id = ?', [at, id]);
  }

  readmit(id: string, allowance: number): void {
    this.db.run(
      'UPDATE students SET expelled_at = NULL, suspended_at = NULL, energy = ? WHERE id = ?',
      [allowance, id],
    );
  }
}
