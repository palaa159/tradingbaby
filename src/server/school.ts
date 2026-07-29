/**
 * Run one day of school (Phase 2 P6):
 *
 *   bun run school -- --day=1 --db=academy.db
 *
 * Pairs the class round-robin, runs each meeting, and reports what each student
 * took away. Hearsay lands in their brains at low confidence with a
 * `heard_from` edge — visible in the dashboard, and still unusable as the basis
 * for a strategy until they prove it themselves.
 */

import { pairFor } from '../core/school/pairing.ts';
import type { Student } from '../core/types.ts';
import { DEFAULT_ACADEMY } from './academyConfig.ts';
import { SdkLog } from './db/sdkLog.ts';
import { openAcademyDb, SqliteEventStore, StudentStore } from './db/sqliteStore.ts';
import type { GraphOpsContext } from './engine/graphOps.ts';
import { hearsayCount, runSession } from './engine/schoolSession.ts';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const config = DEFAULT_ACADEMY;
const db = openAcademyDb(arg('db') ?? 'academy.db');
const store = new SqliteEventStore(db);
const students = new StudentStore(db);
const sdkLog = new SdkLog(db);
const day = Number(arg('day') ?? 0);

// Every configured student attends, enrolling on first sight.
const roster = new Map<string, Student>();
for (const enrollment of config.students) {
  const student = students.enroll(
    enrollment.seed,
    enrollment.name,
    config.metabolism.startingAllowance,
    Date.now(),
  );
  roster.set(student.id, student);
}

const ctxFor = (id: string): GraphOpsContext => ({ studentId: id, store, now: Date.now });
const pairs = pairFor([...roster.keys()], day);

console.log(`🔔 คาบเรียนวันที่ ${day} — จับคู่ได้ ${pairs.length} คู่\n`);

for (const pair of pairs) {
  const a = roster.get(pair.a);
  const b = roster.get(pair.b);
  if (!a || !b) continue;

  console.log(`— ${a.name} × ${b.name}`);
  const result = await runSession({
    a,
    b,
    ctxA: ctxFor(a.id),
    ctxB: ctxFor(b.id),
    model: config.models.short,
    log: sdkLog,
  });

  console.log(result.transcript.split('\n').map((line) => `  ${line}`).join('\n'));
  for (const [studentId, ids] of Object.entries(result.recorded)) {
    const student = roster.get(studentId);
    const took = ids.length - 1; // the conversation node itself is not a takeaway
    console.log(
      `  → ${student?.name}: จดไว้ ${took} เรื่อง ` +
        `(รวมที่ยังเชื่อเพื่อนอยู่ ${hearsayCount(ctxFor(studentId))} เรื่อง)`,
    );
  }
  if (result.costUsd !== undefined) console.log(`  cost $${result.costUsd.toFixed(4)}`);
  console.log();
}

db.close();
