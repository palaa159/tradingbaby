/**
 * Every call to the Claude Agent SDK, in and out (spec §9.4 traceability).
 *
 * The academy's expensive decisions are all made by a model, and until now the
 * only trace of them was a cost figure and whatever the student chose to write
 * down. This table holds the other side: which model was asked, at what effort,
 * with which system prompt and prompt, which tools it reached for, and what came
 * back. Append-only, like the event log — a record that can be edited afterwards
 * is not evidence.
 *
 * Prompts are stored whole. They are the input to a decision the maker may need
 * to explain months later, and a truncated prompt explains nothing.
 */

import type { Database } from 'bun:sqlite';

/** Which part of the academy made the call — the thing you filter by first. */
export type SdkCaller =
  | 'cycle:short'
  | 'cycle:daily_review'
  | 'exam:sit'
  | 'exam:grade'
  | 'school:share'
  | 'school:listen'
  /** The Principal working one request from the box (spec §9.4). */
  | 'principal:request'
  /** The Maker Designer's round. It used to log itself as a daily review, which
   *  put its spend on the students' bill. */
  | 'design:round';

export interface SdkCallInput {
  caller: SdkCaller;
  studentId: string | undefined;
  model: string;
  effort: string | undefined;
  systemPrompt: string | undefined;
  prompt: string;
  maxTurns: number | undefined;
}

export interface SdkCallOutcome {
  result: string | undefined;
  subtype: string | undefined;
  isError: boolean;
  numTurns: number | undefined;
  costUsd: number | undefined;
  durationMs: number;
  /** Tool names in call order, so the shape of a session is visible at a glance. */
  toolCalls: string[];
}

export interface SdkCall extends SdkCallInput, SdkCallOutcome {
  id: number;
  at: number;
}

interface SdkCallRow {
  id: number;
  at: number;
  caller: string;
  student_id: string | null;
  model: string;
  effort: string | null;
  system_prompt: string | null;
  prompt: string;
  max_turns: number | null;
  result: string | null;
  subtype: string | null;
  is_error: number;
  num_turns: number | null;
  cost_usd: number | null;
  duration_ms: number;
  tool_calls: string;
}

export function migrateSdkLog(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS sdk_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      caller TEXT NOT NULL,
      student_id TEXT,
      model TEXT NOT NULL,
      effort TEXT,
      system_prompt TEXT,
      prompt TEXT NOT NULL,
      max_turns INTEGER,
      result TEXT,
      subtype TEXT,
      is_error INTEGER NOT NULL DEFAULT 0,
      num_turns INTEGER,
      cost_usd REAL,
      duration_ms INTEGER NOT NULL,
      tool_calls TEXT NOT NULL DEFAULT '[]'
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS sdk_calls_at ON sdk_calls (at DESC)');
  db.run('CREATE INDEX IF NOT EXISTS sdk_calls_student ON sdk_calls (student_id, at DESC)');
}

function toCall(row: SdkCallRow): SdkCall {
  return {
    id: row.id,
    at: row.at,
    caller: row.caller as SdkCaller,
    studentId: row.student_id ?? undefined,
    model: row.model,
    effort: row.effort ?? undefined,
    systemPrompt: row.system_prompt ?? undefined,
    prompt: row.prompt,
    maxTurns: row.max_turns ?? undefined,
    result: row.result ?? undefined,
    subtype: row.subtype ?? undefined,
    isError: row.is_error === 1,
    numTurns: row.num_turns ?? undefined,
    costUsd: row.cost_usd ?? undefined,
    durationMs: row.duration_ms,
    toolCalls: JSON.parse(row.tool_calls) as string[],
  };
}

export class SdkLog {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    migrateSdkLog(db);
  }

  record(input: SdkCallInput, outcome: SdkCallOutcome, at: number): number {
    this.db.run(
      `INSERT INTO sdk_calls
         (at, caller, student_id, model, effort, system_prompt, prompt, max_turns,
          result, subtype, is_error, num_turns, cost_usd, duration_ms, tool_calls)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        at,
        input.caller,
        input.studentId ?? null,
        input.model,
        input.effort ?? null,
        input.systemPrompt ?? null,
        input.prompt,
        input.maxTurns ?? null,
        outcome.result ?? null,
        outcome.subtype ?? null,
        outcome.isError ? 1 : 0,
        outcome.numTurns ?? null,
        outcome.costUsd ?? null,
        outcome.durationMs,
        JSON.stringify(outcome.toolCalls),
      ],
    );
    const row = this.db.query<{ id: number }, []>('SELECT last_insert_rowid() AS id').get();
    return row?.id ?? 0;
  }

  recent(limit = 50): SdkCall[] {
    return this.db
      .query<SdkCallRow, [number]>('SELECT * FROM sdk_calls ORDER BY at DESC LIMIT ?')
      .all(limit)
      .map(toCall);
  }

  forStudent(studentId: string, limit = 50): SdkCall[] {
    return this.db
      .query<SdkCallRow, [string, number]>(
        'SELECT * FROM sdk_calls WHERE student_id = ? ORDER BY at DESC LIMIT ?',
      )
      .all(studentId, limit)
      .map(toCall);
  }

  get(id: number): SdkCall | null {
    const row = this.db.query<SdkCallRow, [number]>('SELECT * FROM sdk_calls WHERE id = ?').get(id);
    return row ? toCall(row) : null;
  }

  /** Spend and volume per caller — what the subscription is actually going on. */
  summary(): { caller: string; calls: number; costUsd: number; errors: number }[] {
    return this.db
      .query<{ caller: string; calls: number; costUsd: number; errors: number }, []>(
        `SELECT caller,
                COUNT(*) AS calls,
                COALESCE(SUM(cost_usd), 0) AS costUsd,
                SUM(is_error) AS errors
         FROM sdk_calls GROUP BY caller ORDER BY calls DESC`,
      )
      .all();
  }
}
