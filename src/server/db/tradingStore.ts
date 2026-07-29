/**
 * Paper fills and their decision traces (spec §6, "ตรวจย้อนการตัดสินใจ").
 *
 * Every fill records which strategy version fired it and which recorded
 * evaluation produced it. From there the chain is already complete: the
 * strategy carries the hypotheses it was compiled from, and those hypotheses
 * carry their sources and lessons in the knowledge graph. Click a trade, walk
 * back to the belief that caused it.
 */

import type { Database } from 'bun:sqlite';

import type { Benchmark } from '../../core/trading/benchmark.ts';
import { replayFills, type Fill, type PortfolioState } from '../../core/trading/portfolio.ts';
import type { StrategyStore } from './strategyStore.ts';
import type { StrategyVersion } from '../../core/strategy/types.ts';

interface FillRow {
  id: number;
  student_id: string;
  strategy_id: string;
  evaluation_id: number | null;
  at: number;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  fee: number;
  reason: string;
  guardrail_note: string;
}

export interface RecordedFill extends Fill {
  id: number;
  studentId: string;
  strategyId: string;
  evaluationId: number | null;
  reason: string;
  guardrailNote: string;
}

export interface DecisionTrace {
  fill: RecordedFill;
  strategy: StrategyVersion | null;
  /** Hypothesis node ids the strategy was compiled from. */
  hypothesisIds: string[];
}

export interface BlockedOrder {
  at: number;
  symbol: string;
  side: string;
  reason: string;
}

export function migrateTradingTables(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS fills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      strategy_id TEXT NOT NULL,
      evaluation_id INTEGER,
      at INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      fee REAL NOT NULL,
      reason TEXT NOT NULL,
      guardrail_note TEXT NOT NULL
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS fills_student ON fills (student_id, id)');
  db.run(`
    CREATE TABLE IF NOT EXISTS day_open_values (
      student_id TEXT NOT NULL,
      day TEXT NOT NULL,
      value REAL NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY (student_id, day)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS blocked_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      at INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      reason TEXT NOT NULL
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS blocked_student ON blocked_orders (student_id, id)');
  // Last price the engine actually saw per symbol. Lets the dashboard value
  // portfolios without a network call, and keeps valuation reproducible.
  db.run(`
    CREATE TABLE IF NOT EXISTS price_marks (
      symbol TEXT PRIMARY KEY,
      at INTEGER NOT NULL,
      price REAL NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS benchmarks (
      student_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      quantity REAL NOT NULL,
      started_at INTEGER NOT NULL,
      starting_cash REAL NOT NULL,
      PRIMARY KEY (student_id, symbol)
    )
  `);
}

function toFill(row: FillRow): RecordedFill {
  return {
    id: row.id,
    studentId: row.student_id,
    strategyId: row.strategy_id,
    evaluationId: row.evaluation_id,
    at: row.at,
    symbol: row.symbol,
    side: row.side === 'sell' ? 'sell' : 'buy',
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    reason: row.reason,
    guardrailNote: row.guardrail_note,
  };
}

export class TradingStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    migrateTradingTables(db);
  }

  record(fill: Omit<RecordedFill, 'id'>): RecordedFill {
    this.db.run(
      `INSERT INTO fills (student_id, strategy_id, evaluation_id, at, symbol, side, quantity, price, fee, reason, guardrail_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fill.studentId,
        fill.strategyId,
        fill.evaluationId,
        fill.at,
        fill.symbol,
        fill.side,
        fill.quantity,
        fill.price,
        fill.fee,
        fill.reason,
        fill.guardrailNote,
      ],
    );
    const row = this.db.query<{ id: number }, []>('SELECT last_insert_rowid() AS id').get();
    return { ...fill, id: row?.id ?? 0 };
  }

  /** A refused order is still history — the maker should see what the rules stopped. */
  recordBlocked(studentId: string, blocked: BlockedOrder): void {
    this.db.run(
      'INSERT INTO blocked_orders (student_id, at, symbol, side, reason) VALUES (?, ?, ?, ?, ?)',
      [studentId, blocked.at, blocked.symbol, blocked.side, blocked.reason],
    );
  }

  fills(studentId: string): RecordedFill[] {
    return this.db
      .query<FillRow, [string]>('SELECT * FROM fills WHERE student_id = ? ORDER BY id')
      .all(studentId)
      .map(toFill);
  }

  blocked(studentId: string): BlockedOrder[] {
    return this.db
      .query<{ at: number; symbol: string; side: string; reason: string }, [string]>(
        'SELECT at, symbol, side, reason FROM blocked_orders WHERE student_id = ? ORDER BY id',
      )
      .all(studentId);
  }

  /** Portfolio is derived from fills, never stored separately. */
  portfolio(studentId: string, startingCash: number): PortfolioState {
    return replayFills(startingCash, this.fills(studentId));
  }

  /** Remember the last price the engine saw, so valuation needs no network. */
  markPrices(prices: Record<string, number>, at: number): void {
    for (const [symbol, price] of Object.entries(prices)) {
      this.db.run(
        `INSERT INTO price_marks (symbol, at, price) VALUES (?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET at = excluded.at, price = excluded.price`,
        [symbol, at, price],
      );
    }
  }

  lastPrices(): Record<string, number> {
    const rows = this.db
      .query<{ symbol: string; price: number }, []>('SELECT symbol, price FROM price_marks')
      .all();
    return Object.fromEntries(rows.map((r) => [r.symbol, r.price]));
  }

  /**
   * The portfolio value the day opened at, written once per student per day.
   * The daily-loss rule is measured against it, so it has to outlive the
   * process — a restart that re-seeded it would hand back a fresh loss budget
   * and let a bad day keep going.
   */
  dayOpenValueOnce(studentId: string, day: string, value: number, at: number): number {
    const existing = this.db
      .query<{ value: number }, [string, string]>(
        'SELECT value FROM day_open_values WHERE student_id = ? AND day = ?',
      )
      .get(studentId, day);
    if (existing) return existing.value;
    this.db.run('INSERT INTO day_open_values (student_id, day, value, at) VALUES (?, ?, ?, ?)', [
      studentId,
      day,
      value,
      at,
    ]);
    return value;
  }

  /** Open the benchmark once; later calls are no-ops so the ruler never moves. */
  openBenchmarkOnce(studentId: string, benchmark: Benchmark): Benchmark {
    const existing = this.benchmark(studentId);
    if (existing) return existing;
    for (const holding of benchmark.holdings) {
      this.db.run(
        'INSERT INTO benchmarks (student_id, symbol, quantity, started_at, starting_cash) VALUES (?, ?, ?, ?, ?)',
        [studentId, holding.symbol, holding.quantity, benchmark.startedAt, benchmark.startingCash],
      );
    }
    return benchmark;
  }

  benchmark(studentId: string): Benchmark | null {
    const rows = this.db
      .query<{ symbol: string; quantity: number; started_at: number; starting_cash: number }, [string]>(
        'SELECT symbol, quantity, started_at, starting_cash FROM benchmarks WHERE student_id = ? ORDER BY symbol',
      )
      .all(studentId);
    if (rows.length === 0) return null;
    return {
      startedAt: rows[0]?.started_at ?? 0,
      startingCash: rows[0]?.starting_cash ?? 0,
      holdings: rows.map((r) => ({ symbol: r.symbol, quantity: r.quantity })),
    };
  }

  /** Walk one fill back to the strategy version and the beliefs behind it. */
  trace(fillId: number, strategies: StrategyStore): DecisionTrace | null {
    const row = this.db.query<FillRow, [number]>('SELECT * FROM fills WHERE id = ?').get(fillId);
    if (!row) return null;
    const fill = toFill(row);
    const strategy = strategies.get(fill.strategyId);
    return {
      fill,
      strategy,
      hypothesisIds: strategy?.fromHypothesisIds ?? [],
    };
  }
}
