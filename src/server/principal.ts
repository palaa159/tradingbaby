/**
 * The Principal's rounds (Phase 3 H2):
 *
 *   bun run principal -- --db=academy.db
 *   bun run principal -- --watch=15          # keep walking, every 15 minutes
 *   bun run principal -- --classify=src/app/brain/page.tsx,docs/X.md
 *
 * Walks the school, writes down what it finds, and reads the students' request
 * box. It does not write code here — the zone policy decides what it *would* be
 * allowed to do, and auto-merge is off until the maker turns it on (spec §9.4).
 *
 * Every round is recorded to principal_rounds, so the maker reads the rounds on
 * the dashboard rather than having to be at the terminal when one happens.
 */

import { replay } from '../core/eventLog.ts';
import { runHealthChecks, worstSeverity, type SchoolVitals } from '../core/principal/health.ts';
import { classifyChange, decideAction, DEFAULT_POLICY } from '../core/principal/zones.ts';
import { DEFAULT_ACADEMY } from './academyConfig.ts';
import { PrincipalLog } from './db/principalLog.ts';
import { openAcademyDb, SqliteEventStore, StudentStore } from './db/sqliteStore.ts';
import { StrategyStore } from './db/strategyStore.ts';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

// A dry-run classifier the maker can use before asking for anything.
const toClassify = arg('classify');
if (toClassify) {
  const verdict = classifyChange(toClassify.split(',').map((p) => p.trim()));
  const decision = decideAction(verdict, DEFAULT_POLICY);
  const badge = { green: '🟢', yellow: '🟡', red: '🔴' }[verdict.zone];
  console.log(`${badge} โซน${verdict.zone} — ${verdict.reason}`);
  for (const file of verdict.perFile) {
    console.log(`   ${{ green: '🟢', yellow: '🟡', red: '🔴' }[file.zone]} ${file.path}`);
  }
  console.log(`\nครูใหญ่จะ: ${decision.action} — ${decision.explanation}`);
  process.exit(0);
}

const config = DEFAULT_ACADEMY;
const db = openAcademyDb(arg('db') ?? 'academy.db');
const store = new SqliteEventStore(db);
const students = new StudentStore(db);
const strategies = new StrategyStore(db);
const log = new PrincipalLog(db);

const watchMinutes = Number(arg('watch') ?? 0);

/** One walk of the school. Returns the worst thing it saw. */
function round(): 'ok' | 'warn' | 'broken' {
  const suspendedIds = new Set(
    db
      .query<{ id: string }, []>('SELECT id FROM students WHERE suspended_at IS NOT NULL')
      .all()
      .map((r) => r.id),
  );

  const roster = students.list();
  let openRequests = 0;
  let activeStrategies = 0;
  const replayMismatches: { strategyId: string; mismatches: number }[] = [];

  const vitalsStudents: SchoolVitals['students'] = roster.map((student) => {
    const eventLog = store.read(student.id);
    const brain = replay(eventLog);
    openRequests += [...brain.nodes.values()].filter(
      (n) => n.kind === 'feature_request' && n.status !== 'answered',
    ).length;

    const own = strategies.all(student.id);
    activeStrategies += own.filter((s) => s.status === 'active').length;
    for (const strategy of own) {
      const check = strategies.verifyReplay(strategy.id);
      if (check.checked > 0) {
        replayMismatches.push({ strategyId: strategy.id, mismatches: check.mismatches.length });
      }
    }

    return {
      id: student.id,
      name: student.name,
      energy: student.energy,
      suspended: suspendedIds.has(student.id),
      eventCount: eventLog.length,
      lastEventAt: eventLog[eventLog.length - 1]?.at ?? 0,
    };
  });

  const at = Date.now();
  const vitals: SchoolVitals = {
    students: vitalsStudents,
    replayMismatches,
    activeStrategies,
    openRequests,
    now: at,
  };

  const checks = runHealthChecks(vitals);
  const overall = worstSeverity(checks);

  log.record({
    at,
    overall,
    checks,
    students: roster.length,
    activeStrategies,
    openRequests,
    replayChecked: replayMismatches.length,
    replayMismatches: replayMismatches.filter((m) => m.mismatches > 0).length,
    autoMergeGreen: DEFAULT_POLICY.autoMergeGreen,
  });

  const badge = { ok: '✅', warn: '⚠️', broken: '🚨' }[overall];
  console.log(`${badge} ครูใหญ่ออกตรวจโรงเรียน — สรุป: ${overall}\n`);
  for (const check of checks) {
    const mark = { ok: '  ✓', warn: '  ⚠', broken: '  ✗' }[check.severity];
    console.log(`${mark} ${check.name}: ${check.detail}`);
    if (check.action) console.log(`     → ${check.action}`);
  }

  console.log(
    `\nนักเรียน ${roster.length} คน · สูตรที่เปิดใช้ ${activeStrategies} · ` +
      `การประเมินที่ตรวจซ้ำแล้ว ${replayMismatches.length} สูตร · คำร้องค้าง ${openRequests}`,
  );
  console.log(
    `โหมด merge อัตโนมัติ: ${DEFAULT_POLICY.autoMergeGreen ? 'เปิด' : 'ปิด'} ` +
      '(spec ข้อ 9.4 — เริ่มด้วยขออนุมัติก่อนเสมอ)',
  );

  return overall;
}

if (watchMinutes > 0) {
  console.log(`👔 ครูใหญ่เฝ้าโรงเรียน — ออกตรวจทุก ${watchMinutes} นาที`);
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  for (;;) {
    try {
      round();
    } catch (error) {
      // A failed round must not end the watch — the next one may well succeed,
      // and a Principal that dies on one bad read is worse than none.
      console.error(`ตรวจโรงเรียนล้ม: ${error instanceof Error ? error.stack : error}`);
    }
    await sleep(watchMinutes * 60_000);
  }
}

const overall = round();
db.close();
process.exit(overall === 'broken' ? 1 : 0);
