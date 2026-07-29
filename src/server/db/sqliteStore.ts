/**
 * SQLite persistence (Phase 1 M3).
 *
 * The `events` table is the source of truth — append-only, kept forever
 * (spec §5.3, §14.4). Brains are rebuilt by replaying it, so nothing else
 * needs to be authoritative. `students` holds only mutable runtime state
 * (energy) plus enrollment facts.
 */

import { Database } from 'bun:sqlite';

import type { EventStore, GraphEvent } from '../../core/eventLog.ts';
import { personalityFromSeed } from '../../core/personality.ts';
import type { Student } from '../../core/types.ts';

interface EventRow {
  at: number;
  payload: string;
}

interface StudentRow {
  id: string;
  name: string;
  energy: number;
  enrolled_at: number;
}

export function openAcademyDb(path = 'academy.db'): Database {
  const db = new Database(path, { create: true });
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      energy REAL NOT NULL,
      enrolled_at INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      payload TEXT NOT NULL
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS events_student_seq ON events (student_id, seq)');
  return db;
}

/** Append-only event log backed by SQLite. Same contract as MemoryEventStore. */
export class SqliteEventStore implements EventStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  append(studentId: string, event: GraphEvent): void {
    const last = this.db
      .query<{ at: number }, [string]>('SELECT at FROM events WHERE student_id = ? ORDER BY seq DESC LIMIT 1')
      .get(studentId);
    if (last && event.at < last.at) {
      throw new Error(
        `event log is append-only: event at ${event.at} is earlier than last event at ${last.at}`,
      );
    }
    this.db.run('INSERT INTO events (student_id, at, payload) VALUES (?, ?, ?)', [
      studentId,
      event.at,
      JSON.stringify(event),
    ]);
  }

  read(studentId: string): readonly GraphEvent[] {
    const rows = this.db
      .query<EventRow, [string]>('SELECT at, payload FROM events WHERE student_id = ? ORDER BY seq')
      .all(studentId);
    return rows.map((row) => JSON.parse(row.payload) as GraphEvent);
  }

  /** Event count, for status output without materializing every payload. */
  count(studentId: string): number {
    const row = this.db
      .query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM events WHERE student_id = ?')
      .get(studentId);
    return row?.n ?? 0;
  }
}

/** Enrollment + mutable runtime state (energy) for students. */
export class StudentStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Load a student, enrolling them on first sight. Personality is always
   * re-derived from the seed (id), never stored — same seed, same student.
   */
  enroll(id: string, name: string, startingEnergy: number, enrolledAt: number): Student {
    const existing = this.db
      .query<StudentRow, [string]>('SELECT id, name, energy, enrolled_at FROM students WHERE id = ?')
      .get(id);

    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        personality: personalityFromSeed(existing.id),
        energy: existing.energy,
        enrolledAt: existing.enrolled_at,
      };
    }

    this.db.run('INSERT INTO students (id, name, energy, enrolled_at) VALUES (?, ?, ?, ?)', [
      id,
      name,
      startingEnergy,
      enrolledAt,
    ]);
    return {
      id,
      name,
      personality: personalityFromSeed(id),
      energy: startingEnergy,
      enrolledAt,
    };
  }

  saveEnergy(id: string, energy: number): void {
    this.db.run('UPDATE students SET energy = ? WHERE id = ?', [energy, id]);
  }

  list(): Student[] {
    const rows = this.db
      .query<StudentRow, []>('SELECT id, name, energy, enrolled_at FROM students ORDER BY enrolled_at')
      .all();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      personality: personalityFromSeed(row.id),
      energy: row.energy,
      enrolledAt: row.enrolled_at,
    }));
  }
}
