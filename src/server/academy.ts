/**
 * Shared wiring for anything that runs a student cycle.
 *
 * The one-shot CLI (index.ts) and the daemon need the same stores, the same
 * library view and the same energy bookkeeping. Keeping that in one place is
 * the point: two copies would drift, and the one that drifts is the one nobody
 * is watching.
 */

import type { Database } from 'bun:sqlite';

import { buildLibrary, type ClaimRecord } from '../core/school/hive.ts';
import type { Student } from '../core/types.ts';
import type { AcademyConfig } from './academyConfig.ts';
import { openAcademyDb, SqliteEventStore, StudentStore } from './db/sqliteStore.ts';
import { SdkLog } from './db/sdkLog.ts';
import { StrategyStore } from './db/strategyStore.ts';
import type { CycleKind } from './engine/prompts.ts';
import { runCycle, type CycleResult } from './engine/studentAgent.ts';
import { defaultMarketData } from './marketData.ts';

export interface Academy {
  db: Database;
  store: SqliteEventStore;
  students: StudentStore;
  strategies: StrategyStore;
  enroll(name: string, seed: string): Student;
  runFor(student: Student, kind: CycleKind): Promise<CycleResult>;
}

export function openAcademy(config: AcademyConfig, dbPath: string): Academy {
  const db = openAcademyDb(dbPath);
  const store = new SqliteEventStore(db);
  const students = new StudentStore(db);
  const strategies = new StrategyStore(db);
  const sdkLog = new SdkLog(db);
  const market = defaultMarketData(config.universe);

  const enroll = (name: string, seed: string): Student =>
    students.enroll(seed, name, config.metabolism.startingAllowance, Date.now());

  const runFor = async (student: Student, kind: CycleKind): Promise<CycleResult> => {
    // The library is read fresh each cycle, so a classmate proving something
    // an hour ago is on the shelf now rather than at the next restart.
    const roster = new Map(students.list().map((s) => [s.id, s.name]));
    const library = {
      entries: () => {
        const records: ClaimRecord[] = strategies.allStudents().map((entry) => ({
          spec: entry.spec,
          verdict: {
            studentId: entry.studentId,
            studentName: roster.get(entry.studentId) ?? entry.studentId,
            // Reaching activation means the judge adopted it (spec §6.2).
            status: 'adopted' as const,
            alphaPct: 0,
            confidence: 0,
            at: entry.at,
          },
        }));
        return buildLibrary(records, { classSize: Math.max(1, roster.size) });
      },
      personality: student.personality,
    };

    const result = await runCycle(kind, {
      student,
      store,
      market,
      metabolism: config.metabolism,
      models: config.models,
      strategies,
      library,
      log: sdkLog,
    });
    students.saveEnergy(student.id, result.energyAfter);
    return result;
  };

  return { db, store, students, strategies, enroll, runFor };
}
