/**
 * Exam sittings kept (spec §7 "สมุดพก").
 *
 * The report card was being printed to a terminal and thrown away, which made
 * the institution's own grade the one number nobody could look up afterwards.
 * A grade that only exists in a scrollback is not a record.
 *
 * Both halves are stored: the card as the maker reads it, and every graded
 * answer behind it, so "why is my average 35" has an answer rather than a
 * shrug.
 */

import type { Database } from 'bun:sqlite';

import type { GradedAnswer, ReportCard } from '../../core/exam/types.ts';

export interface StoredSitting {
  id: number;
  at: number;
  studentId: string;
  answered: number;
  averageScore: number;
  actionAccuracy: number;
  mostCited: { nodeId: string; times: number }[];
  answers: GradedAnswer[];
}

interface SittingRow {
  id: number;
  at: number;
  student_id: string;
  answered: number;
  average_score: number;
  action_accuracy: number;
  most_cited: string;
  answers: string;
}

export function migrateExamTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS exam_sittings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      student_id TEXT NOT NULL,
      answered INTEGER NOT NULL,
      average_score REAL NOT NULL,
      action_accuracy REAL NOT NULL,
      most_cited TEXT NOT NULL DEFAULT '[]',
      answers TEXT NOT NULL DEFAULT '[]'
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS exam_sittings_student ON exam_sittings (student_id, at DESC)');
}

function toSitting(row: SittingRow): StoredSitting {
  return {
    id: row.id,
    at: row.at,
    studentId: row.student_id,
    answered: row.answered,
    averageScore: row.average_score,
    actionAccuracy: row.action_accuracy,
    mostCited: JSON.parse(row.most_cited) as { nodeId: string; times: number }[],
    answers: JSON.parse(row.answers) as GradedAnswer[],
  };
}

export class ExamStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    migrateExamTables(db);
  }

  record(card: ReportCard, answers: GradedAnswer[], at: number): void {
    this.db.run(
      `INSERT INTO exam_sittings
         (at, student_id, answered, average_score, action_accuracy, most_cited, answers)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        at,
        card.studentId,
        card.answered,
        card.averageScore,
        card.actionAccuracy,
        JSON.stringify(card.mostCited),
        JSON.stringify(answers),
      ],
    );
  }

  forStudent(studentId: string, limit = 20): StoredSitting[] {
    return this.db
      .query<SittingRow, [string, number]>(
        'SELECT * FROM exam_sittings WHERE student_id = ? ORDER BY at DESC LIMIT ?',
      )
      .all(studentId, limit)
      .map(toSitting);
  }

  recent(limit = 40): StoredSitting[] {
    return this.db
      .query<SittingRow, [number]>('SELECT * FROM exam_sittings ORDER BY at DESC LIMIT ?')
      .all(limit)
      .map(toSitting);
  }

  /** The trend the maker actually wants: is the class getting smarter? */
  trend(studentId: string): { at: number; averageScore: number; actionAccuracy: number }[] {
    return this.db
      .query<{ at: number; averageScore: number; actionAccuracy: number }, [string]>(
        'SELECT at, average_score AS averageScore, action_accuracy AS actionAccuracy FROM exam_sittings WHERE student_id = ? ORDER BY at',
      )
      .all(studentId);
  }
}
