/**
 * One database handle per process, shared by every route handler.
 *
 * The stores are stateless wrappers over a connection, so sharing one is both
 * correct and what the old single-process server did. The path comes from the
 * environment rather than a flag because Next owns the process arguments now.
 */

import { DEFAULT_ACADEMY } from '../academyConfig.ts';
import { SqliteCycleLedger } from '../db/cycleLedger.ts';
import { PrincipalLog } from '../db/principalLog.ts';
import { openAcademyDb, SqliteEventStore, StudentStore } from '../db/sqliteStore.ts';
import { StrategyStore } from '../db/strategyStore.ts';
import { TradingStore } from '../db/tradingStore.ts';

const db = openAcademyDb(process.env.ACADEMY_DB ?? 'academy.db');

export const config = DEFAULT_ACADEMY;
export const events = new SqliteEventStore(db);
export const students = new StudentStore(db);
export const strategies = new StrategyStore(db);
export const trading = new TradingStore(db);
export const ledger = new SqliteCycleLedger(db);
export const principalLog = new PrincipalLog(db);
