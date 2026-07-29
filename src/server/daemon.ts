/**
 * The school day, unattended (spec §4.3, §10).
 *
 *   bun run daemon -- --db=academy.db
 *
 * Plans the day, waits for each bell, runs every student's cycle, and writes
 * what happened to the cycle ledger. Restart-safe by construction: slots
 * already in the ledger are never run twice, so a restart mid-afternoon
 * resumes the day instead of replaying it and spending the quota again.
 *
 * Runs forever — one planned day, then a wait for the next local midnight.
 */

import { openAcademy } from './academy.ts';
import { DEFAULT_ACADEMY } from './academyConfig.ts';
import { SqliteCycleLedger } from './db/cycleLedger.ts';
import type { CycleKind } from './engine/prompts.ts';
import { AcademyBell, dayKey, msUntilNextDay } from './scheduler.ts';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const config = DEFAULT_ACADEMY;
const academy = openAcademy(config, arg('db') ?? 'academy.db');
const ledger = new SqliteCycleLedger(academy.db);
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Enrol once at boot so the roster exists before the first bell; each cycle
// reloads the student anyway, to pick up energy spent since.
const roster = config.students.map((s) => academy.enroll(s.name, s.seed));
const byId = new Map(roster.map((s) => [s.id, s]));

async function runOne(studentId: string, kind: CycleKind): Promise<void> {
  const known = byId.get(studentId);
  if (!known) throw new Error(`unknown student: ${studentId}`);
  // Reload: energy is mutable state and the cycle budget depends on it.
  const student = academy.enroll(known.name, known.id);
  const result = await academy.runFor(student, kind);
  console.log(
    `[${new Date().toISOString()}] ${student.name} ${kind} — ` +
      `พลังงาน ${result.energyAfter} · ${(result.durationMs / 1000).toFixed(1)}s` +
      (result.costUsd !== undefined ? ` · $${result.costUsd.toFixed(4)}` : ''),
  );
}

const bell = new AcademyBell(config.schedule, {
  runCycle: runOne,
  ledger,
  now: Date.now,
  sleep,
});

console.log(
  `🔔 โรงเรียนเปิดแล้ว — นักเรียน ${roster.length} คน: ${roster.map((s) => s.name).join(', ')}`,
);
console.log(
  `   รอบสั้น ${config.schedule.shortCyclesPerDay} รอบ/คน/วัน · ` +
    `ทบทวน ${Math.floor(config.schedule.dailyReviewMinute / 60)}:00 · ` +
    `ตื่น ${Math.floor(config.schedule.wakingWindow[0] / 60)}:00-${Math.floor(config.schedule.wakingWindow[1] / 60)}:00`,
);

for (;;) {
  const day = dayKey(Date.now());
  console.log(`\n📅 ${day}`);
  await bell.runDay(roster.map((s) => s.id));

  const done = ledger.day(day);
  console.log(
    `📅 ${day} จบวัน — รันจริง ${done.filter((r) => r.status === 'done').length} · ` +
      `ข้าม ${done.filter((r) => r.status === 'skipped').length}`,
  );
  await sleep(msUntilNextDay(Date.now()));
}
