/**
 * Metabolism v2 (Phase 2 P4) — where profit becomes food.
 *
 * Settlement is the moment the academy's DNA becomes real: realized P&L turns
 * into energy, energy buys thinking, and running out stops the student. The
 * escape hatch matters as much as the pressure — active strategies keep trading
 * at zero AI cost, and even a starving student keeps one cycle a day, so a
 * student with good rules can eat its way back (spec §3.4).
 */

import type { Database } from 'bun:sqlite';

import { cycleBudget, hungerState, settle, type MetabolismConfig } from '../../core/metabolism.ts';
import type { HungerState } from '../../core/types.ts';
import type { StrategyStore } from '../db/strategyStore.ts';
import type { TradingStore } from '../db/tradingStore.ts';

export interface SettlementOutcome {
  studentId: string;
  fed: number;
  energy: number;
  hunger: HungerState;
  cyclesAllowedToday: number;
  suspended: boolean;
  note: string;
}

function addColumnIfMissing(db: Database, table: string, column: string, ddl: string): void {
  const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

export function migrateMetabolismColumns(db: Database): void {
  addColumnIfMissing(db, 'students', 'settled_pnl', 'REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'students', 'suspended_at', 'INTEGER');
}

export class Metabolism {
  private readonly db: Database;
  private readonly config: MetabolismConfig;

  constructor(db: Database, config: MetabolismConfig) {
    this.db = db;
    this.config = config;
    migrateMetabolismColumns(db);
  }

  isSuspended(studentId: string): boolean {
    const row = this.db
      .query<{ suspended_at: number | null }, [string]>(
        'SELECT suspended_at FROM students WHERE id = ?',
      )
      .get(studentId);
    return row?.suspended_at != null;
  }

  /**
   * Turn newly realized profit into energy and apply the consequences.
   * Idempotent: only P&L booked since the last call counts.
   */
  settleStudent(
    studentId: string,
    startingCash: number,
    at: number,
    trading: TradingStore,
    strategies: StrategyStore,
    fullCycleBudget: number,
  ): SettlementOutcome {
    const row = this.db
      .query<{ energy: number; settled_pnl: number; suspended_at: number | null }, [string]>(
        'SELECT energy, settled_pnl, suspended_at FROM students WHERE id = ?',
      )
      .get(studentId);
    if (!row) throw new Error(`unknown student: ${studentId}`);

    if (row.suspended_at != null) {
      return {
        studentId,
        fed: 0,
        energy: 0,
        hunger: 'suspended',
        cyclesAllowedToday: 0,
        suspended: true,
        note: 'ถูกพักการเรียนอยู่ — รอคนสร้างให้กลับมาเรียน',
      };
    }

    const realized = trading.portfolio(studentId, startingCash).realizedPnl;
    const result = settle(
      row.energy,
      row.settled_pnl,
      realized,
      this.config,
      this.config.pnlToEnergyRate,
    );

    this.db.run('UPDATE students SET energy = ?, settled_pnl = ? WHERE id = ?', [
      result.energy,
      result.settledPnl,
      studentId,
    ]);

    if (result.suspended) {
      this.suspend(studentId, at, trading, strategies, startingCash);
      return {
        studentId,
        fed: result.fed,
        energy: 0,
        hunger: 'suspended',
        cyclesAllowedToday: 0,
        suspended: true,
        note: 'พลังงานหมด — พักการเรียน ปลดสูตรทั้งหมด ปิดตำแหน่งที่ถืออยู่ สมองยังอยู่ครบ',
      };
    }

    const hunger = hungerState(result.energy, this.config);
    const cycles = cycleBudget(hunger, fullCycleBudget);
    return {
      studentId,
      fed: result.fed,
      energy: result.energy,
      hunger,
      cyclesAllowedToday: cycles,
      suspended: false,
      note:
        result.fed === 0
          ? 'ไม่มีกำไรใหม่มาป้อน'
          : result.fed > 0
            ? `กินกำไร ${result.fed.toFixed(2)} หน่วย`
            : `เสียพลังงาน ${Math.abs(result.fed).toFixed(2)} หน่วยจากการขาดทุน`,
    };
  }

  /**
   * Suspension stops everything but keeps the brain (spec §3.4): strategies are
   * retired and holdings sold at the last known price, so no position drifts
   * while nobody is watching. Knowledge and diaries are untouched.
   */
  private suspend(
    studentId: string,
    at: number,
    trading: TradingStore,
    strategies: StrategyStore,
    startingCash: number,
  ): void {
    for (const strategy of strategies.active(studentId)) {
      strategies.retire(strategy.id, at);
    }

    const state = trading.portfolio(studentId, startingCash);
    for (const holding of state.holdings.values()) {
      trading.record({
        studentId,
        strategyId: 'suspension',
        evaluationId: null,
        at,
        symbol: holding.symbol,
        side: 'sell',
        quantity: holding.quantity,
        price: holding.avgPrice,
        fee: 0,
        reason: 'ปิดตำแหน่งเพราะถูกพักการเรียน',
        guardrailNote: '',
      });
    }

    this.db.run('UPDATE students SET suspended_at = ?, energy = 0 WHERE id = ?', [at, studentId]);
  }

  /** The maker's call, never the student's (spec §3.4). */
  revive(studentId: string, allowance: number): void {
    this.db.run('UPDATE students SET suspended_at = NULL, energy = ? WHERE id = ?', [
      allowance,
      studentId,
    ]);
  }
}
