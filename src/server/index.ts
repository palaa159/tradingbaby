/**
 * Phase 1 entry point — run a single cycle for one student:
 *
 *   bun run cycle -- --student=มะลิ --kind=short
 *   bun run cycle -- --student=มะลิ --kind=daily_review
 *
 * State lives in academy.db (override with --db=path), so a student's brain
 * and energy carry over between runs. Requires a Claude subscription login;
 * the Agent SDK handles auth. For the unattended school day, see daemon.ts.
 */

import { replay } from '../core/eventLog.ts';
import { openAcademy } from './academy.ts';
import { DEFAULT_ACADEMY } from './academyConfig.ts';
import type { CycleKind } from './engine/prompts.ts';

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

const academy = openAcademy(config, arg('db') ?? 'academy.db');
const student = academy.enroll(enrollment.name, enrollment.seed);
const priorEvents = academy.store.count(student.id);

console.log(
  `🔔 ${student.name} เริ่ม${kind === 'short' ? 'รอบสั้น' : 'รอบทบทวนประจำวัน'} ` +
    `(พลังงาน ${student.energy}, สมองมี ${priorEvents} events)...`,
);

const result = await academy.runFor(student, kind);

console.log('\n--- ผลของรอบ ---');
console.log(result.summary);
console.log(
  `\nพลังงานเหลือ: ${result.energyAfter} | ใช้เวลา ${(result.durationMs / 1000).toFixed(1)}s` +
    (result.costUsd !== undefined ? ` | cost $${result.costUsd.toFixed(4)}` : ''),
);

const brain = replay(academy.store.read(student.id));
const gained = academy.store.count(student.id) - priorEvents;
console.log(`\n🧠 สมองของ${student.name} (+${gained} events รอบนี้):`);
for (const node of brain.nodes.values()) {
  console.log(`  [${node.kind}] ${node.title} (มั่นใจ ${node.confidence})`);
}
console.log(`  เส้นเชื่อม: ${brain.edges.size}`);

academy.db.close();
