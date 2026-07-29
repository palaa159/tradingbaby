/**
 * Phase 1 entry point — run a single cycle for one student from the CLI:
 *
 *   npm run cycle -- --student=มะลิ --kind=short
 *   npm run cycle -- --student=มะลิ --kind=daily_review
 *
 * Requires a Claude subscription login (the Agent SDK handles auth).
 * The full scheduler day-loop is wired in once persistence (M3) lands —
 * without it, brains only live for the life of the process.
 */

import { MemoryEventStore, replay } from '../core/eventLog.ts';
import { personalityFromSeed } from '../core/personality.ts';
import type { Student } from '../core/types.ts';
import { DEFAULT_ACADEMY } from './academyConfig.ts';
import { runCycle } from './engine/studentAgent.ts';
import type { CycleKind } from './engine/prompts.ts';
import { BinancePublicMarketData } from './marketData.ts';

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

const student: Student = {
  id: enrollment.seed,
  name: enrollment.name,
  personality: personalityFromSeed(enrollment.seed),
  energy: config.metabolism.startingAllowance,
  enrolledAt: Date.now(),
};

const store = new MemoryEventStore();
const market = new BinancePublicMarketData(config.universe);

console.log(`🔔 ${student.name} เริ่ม${kind === 'short' ? 'รอบสั้น' : 'รอบทบทวนประจำวัน'}...`);

const result = await runCycle(kind, {
  student,
  store,
  market,
  metabolism: config.metabolism,
  models: config.models,
});

console.log('\n--- ผลของรอบ ---');
console.log(result.summary);
console.log(
  `\nพลังงานเหลือ: ${result.energyAfter} | ใช้เวลา ${(result.durationMs / 1000).toFixed(1)}s` +
    (result.costUsd !== undefined ? ` | cost $${result.costUsd.toFixed(4)}` : ''),
);
const events = store.read(student.id);
const brain = replay(events);
console.log(`\n🧠 สมองของ${student.name}ตอนนี้ (${events.length} events):`);
for (const node of brain.nodes.values()) {
  console.log(`  [${node.kind}] ${node.title} (มั่นใจ ${node.confidence})`);
}
console.log(`  เส้นเชื่อม: ${brain.edges.size}`);
