/**
 * Strategy versioning and the evaluation record (spec §6.2).
 *
 * Two guarantees this file exists to keep:
 *   1. An activated strategy is immutable — edits ship as a new version.
 *   2. Every evaluation stores its exact inputs, so any decision can be re-run
 *      later and must reproduce byte-identically.
 */

import type { Database } from 'bun:sqlite';

import { evaluate } from '../../core/strategy/evaluate.ts';
import type {
  EvaluationInput,
  EvaluationResult,
  StrategySpec,
  StrategyVersion,
} from '../../core/strategy/types.ts';

interface StrategyRow {
  id: string;
  student_id: string;
  version: number;
  spec: string;
  status: string;
  from_hypotheses: string;
  activated_at: number;
  retired_at: number | null;
}

interface EvaluationRow {
  id: number;
  strategy_id: string;
  at: number;
  input: string;
  result: string;
}

export function migrateStrategyTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS strategies (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      name TEXT NOT NULL,
      version INTEGER NOT NULL,
      spec TEXT NOT NULL,
      status TEXT NOT NULL,
      from_hypotheses TEXT NOT NULL,
      activated_at INTEGER NOT NULL,
      retired_at INTEGER
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS strategies_student ON strategies (student_id, status)');
  db.run(`
    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      input TEXT NOT NULL,
      result TEXT NOT NULL
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS evaluations_strategy ON evaluations (strategy_id, id)');
}

function toVersion(row: StrategyRow): StrategyVersion {
  const version: StrategyVersion = {
    id: row.id,
    studentId: row.student_id,
    version: row.version,
    spec: JSON.parse(row.spec) as StrategySpec,
    status: row.status === 'retired' ? 'retired' : 'active',
    fromHypothesisIds: JSON.parse(row.from_hypotheses) as string[],
    activatedAt: row.activated_at,
  };
  if (row.retired_at !== null) version.retiredAt = row.retired_at;
  return version;
}

export class StrategyStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    migrateStrategyTables(db);
  }

  /**
   * Activate a spec. Re-activating under the same name mints version N+1 and
   * retires the previous one — the old version stays readable forever so its
   * past decisions remain explainable.
   */
  activate(
    studentId: string,
    spec: StrategySpec,
    fromHypothesisIds: string[],
    at: number,
  ): StrategyVersion {
    const prior = this.db
      .query<{ n: number }, [string, string]>(
        'SELECT COALESCE(MAX(version), 0) AS n FROM strategies WHERE student_id = ? AND name = ?',
      )
      .get(studentId, spec.name);
    const version = (prior?.n ?? 0) + 1;

    this.db.run(
      'UPDATE strategies SET status = ?, retired_at = ? WHERE student_id = ? AND name = ? AND status = ?',
      ['retired', at, studentId, spec.name, 'active'],
    );

    const id = `${studentId}:${spec.name}:v${version}`;
    this.db.run(
      `INSERT INTO strategies (id, student_id, name, version, spec, status, from_hypotheses, activated_at, retired_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, NULL)`,
      [id, studentId, spec.name, version, JSON.stringify(spec), JSON.stringify(fromHypothesisIds), at],
    );

    return {
      id,
      studentId,
      version,
      spec,
      status: 'active',
      fromHypothesisIds,
      activatedAt: at,
    };
  }

  retire(strategyId: string, at: number): void {
    this.db.run('UPDATE strategies SET status = ?, retired_at = ? WHERE id = ?', [
      'retired',
      at,
      strategyId,
    ]);
  }

  get(strategyId: string): StrategyVersion | null {
    const row = this.db
      .query<StrategyRow, [string]>('SELECT * FROM strategies WHERE id = ?')
      .get(strategyId);
    return row ? toVersion(row) : null;
  }

  active(studentId: string): StrategyVersion[] {
    return this.db
      .query<StrategyRow, [string]>(
        "SELECT * FROM strategies WHERE student_id = ? AND status = 'active' ORDER BY activated_at",
      )
      .all(studentId)
      .map(toVersion);
  }

  all(studentId: string): StrategyVersion[] {
    return this.db
      .query<StrategyRow, [string]>(
        'SELECT * FROM strategies WHERE student_id = ? ORDER BY name, version',
      )
      .all(studentId)
      .map(toVersion);
  }

  /** Run a strategy and record exactly what it saw, so the decision can be re-run. */
  runAndRecord(strategy: StrategyVersion, input: EvaluationInput, at: number): EvaluationResult {
    const result = evaluate(strategy.spec, input);
    this.db.run('INSERT INTO evaluations (strategy_id, at, input, result) VALUES (?, ?, ?, ?)', [
      strategy.id,
      at,
      JSON.stringify(input),
      JSON.stringify(result),
    ]);
    return result;
  }

  evaluations(strategyId: string): { id: number; at: number; input: EvaluationInput; result: EvaluationResult }[] {
    return this.db
      .query<EvaluationRow, [string]>('SELECT * FROM evaluations WHERE strategy_id = ? ORDER BY id')
      .all(strategyId)
      .map((row) => ({
        id: row.id,
        at: row.at,
        input: JSON.parse(row.input) as EvaluationInput,
        result: JSON.parse(row.result) as EvaluationResult,
      }));
  }

  /**
   * The reproducibility contract, executable: re-run every recorded evaluation
   * of a strategy against its stored inputs and confirm nothing drifted.
   * Any mismatch means an upgrade broke the past — a release blocker (spec §9.5).
   */
  verifyReplay(strategyId: string): { checked: number; mismatches: number[] } {
    const strategy = this.get(strategyId);
    if (!strategy) throw new Error(`unknown strategy: ${strategyId}`);

    const mismatches: number[] = [];
    const records = this.evaluations(strategyId);
    for (const record of records) {
      const replayed = evaluate(strategy.spec, record.input);
      if (JSON.stringify(replayed) !== JSON.stringify(record.result)) {
        mismatches.push(record.id);
      }
    }
    return { checked: records.length, mismatches };
  }
}
