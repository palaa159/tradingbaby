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
import { Roster } from './db/roster.ts';
import { SettingsStore } from './db/settingsStore.ts';
import type { CycleKind } from './engine/prompts.ts';
import { AcademyBell, dayKey, msUntilNextDay } from './scheduler.ts';
import { Metabolism } from './trading/settlement.ts';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const config = DEFAULT_ACADEMY;
const academy = openAcademy(config, arg('db') ?? 'academy.db');
const ledger = new SqliteCycleLedger(academy.db);
const metabolism = new Metabolism(academy.db, config.metabolism);
const settings = new SettingsStore(academy.db);
const roster = new Roster(academy.db);
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Enrol the configured class once at boot so the roster exists before the first
// bell. Who actually attends is read fresh each day from the roster, so a
// student the maker enrols or expels on the dashboard takes effect tomorrow.
for (const s of config.students) academy.enroll(s.name, s.seed);

async function runOne(studentId: string, kind: CycleKind): Promise<void> {
  const known = roster.get(studentId);
  if (!known) throw new Error(`unknown student: ${studentId}`);
  if (known.expelled) throw new Error('ออกจากโรงเรียนแล้ว');
  // Suspension is what makes the energy real: no thinking until the maker
  // revives them. The bell writes the reason to the ledger.
  if (metabolism.isSuspended(studentId)) throw new Error('พักการเรียนอยู่ — รอคนสร้างให้กลับมาเรียน');
  // Reload: energy is mutable state and the cycle budget depends on it.
  const student = academy.enroll(known.name, known.id);
  const result = await academy.runFor(student, kind);
  console.log(
    `[${new Date().toISOString()}] ${student.name} ${kind} — ` +
      `พลังงาน ${result.energyAfter} · ${(result.durationMs / 1000).toFixed(1)}s` +
      (result.costUsd !== undefined ? ` · $${result.costUsd.toFixed(4)}` : ''),
  );
}



console.log(
  `🔔 โรงเรียนเปิดแล้ว — นักเรียน ${roster.active().length} คน: ${roster
    .active()
    .map((s) => s.name)
    .join(', ')}`,
);

for (;;) {
  const day = dayKey(Date.now());
  // Settings and roster are read per day, not per boot: the maker changing the
  // pace on the dashboard should not need a redeploy to take hold.
  const schedule = settings.schedule(config.schedule);
  const attending = roster.active();
  const bell = new AcademyBell(schedule, { runCycle: runOne, ledger, now: Date.now, sleep });

  console.log(
    `\n📅 ${day} — นักเรียน ${attending.length} คน · รอบสั้น ${schedule.shortCyclesPerDay}/คน · ` +
      `ตื่น ${Math.floor(schedule.wakingWindow[0] / 60)}:00-${Math.floor(schedule.wakingWindow[1] / 60)}:00 · ` +
      `ทบทวน ${Math.floor(schedule.dailyReviewMinute / 60)}:00`,
  );
  await bell.runDay(attending.map((s) => s.id));

  const done = ledger.day(day);
  console.log(
    `📅 ${day} จบวัน — รันจริง ${done.filter((r) => r.status === 'done').length} · ` +
      `ข้าม ${done.filter((r) => r.status === 'skipped').length}`,
  );
  await sleep(msUntilNextDay(Date.now()));
}
