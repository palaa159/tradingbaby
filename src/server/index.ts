/**
 * Phase 1 entry point — run a single cycle for one student:
 *
 *   bun run cycle -- --student=มะลิ --kind=short
 *   bun run cycle -- --student=มะลิ --kind=daily_review
 *
 * State lives in academy.db (override with --db=path), so a student's brain
 * and energy carry over between runs. Requires a Claude subscription login;
 * the Agent SDK handles auth.
 */

import { replay } from '../core/eventLog.ts';
import type { Student } from '../core/types.ts';
import { DEFAULT_ACADEMY } from './academyConfig.ts';
import { openAcademyDb, SqliteEventStore, StudentStore } from './db/sqliteStore.ts';
import { StrategyStore } from './db/strategyStore.ts';
import { buildLibrary, type ClaimRecord } from '../core/school/hive.ts';
import { runCycle } from './engine/studentAgent.ts';
import type { CycleKind } from './engine/prompts.ts';
import { defaultMarketData } from './marketData.ts';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const config = DEFAULT_ACADEMY;
const studentName = arg('student') ?? config.students[0]?.name;
const kind = (arg('kind') ?? 'short') as CycleKind;

const enrollment = config.students.find((s) => s.name === studentName);
if (!enrollment) {
  console.error(`unknown student: ${studentName}`);
  process.exit(1);
}

const db = openAcademyDb(arg('db') ?? 'academy.db');
const store = new SqliteEventStore(db);
const students = new StudentStore(db);
const strategies = new StrategyStore(db);

const student: Student = students.enroll(
  enrollment.seed,
  enrollment.name,
  config.metabolism.startingAllowance,
  Date.now(),
);

const priorEvents = store.count(student.id);
const market = defaultMarketData(config.universe);

console.log(
  `🔔 ${student.name} เริ่ม${kind === 'short' ? 'รอบสั้น' : 'รอบทบทวนประจำวัน'} ` +
    `(พลังงาน ${student.energy}, สมองมี ${priorEvents} events)...`,
);

// The library is read fresh each call, so a classmate proving something
// mid-cycle is visible immediately rather than at the next restart.
const roster = new Map(students.list().map((s) => [s.id, s.name]));
const library = {
  entries: () => {
    const records: ClaimRecord[] = strategies.allStudents().map((entry) => ({
      spec: entry.spec,
      verdict: {
        studentId: entry.studentId,
        studentName: roster.get(entry.studentId) ?? entry.studentId,
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
});

students.saveEnergy(student.id, result.energyAfter);

console.log('\n--- ผลของรอบ ---');
console.log(result.summary);
console.log(
  `\nพลังงานเหลือ: ${result.energyAfter} | ใช้เวลา ${(result.durationMs / 1000).toFixed(1)}s` +
    (result.costUsd !== undefined ? ` | cost $${result.costUsd.toFixed(4)}` : ''),
);

const brain = replay(store.read(student.id));
const gained = store.count(student.id) - priorEvents;
console.log(`\n🧠 สมองของ${student.name} (+${gained} events รอบนี้):`);
for (const node of brain.nodes.values()) {
  console.log(`  [${node.kind}] ${node.title} (มั่นใจ ${node.confidence})`);
}
console.log(`  เส้นเชื่อม: ${brain.edges.size}`);

db.close();
