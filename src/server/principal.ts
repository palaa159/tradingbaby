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
import { nextRequest, type OpenRequest } from '../core/principal/requests.ts';
import { classifyChange, decideAction, DEFAULT_POLICY } from '../core/principal/zones.ts';
import { DEFAULT_ACADEMY } from './academyConfig.ts';
import { changedPaths } from './design/changed.ts';
import { PrincipalLog } from './db/principalLog.ts';
import { SdkLog } from './db/sdkLog.ts';
import { openAcademyDb, SqliteEventStore, StudentStore } from './db/sqliteStore.ts';
import { StrategyStore } from './db/strategyStore.ts';
import { WorkLog, type WorkOutcome } from './db/workLog.ts';
import { tracedQuery } from './engine/sdkTrace.ts';
import { DEFAULT_LOCK_PATH, takeWorkLock } from './workLock.ts';

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
const workLog = new WorkLog(db);
const sdkLog = new SdkLog(db);

const watchMinutes = Number(arg('watch') ?? 0);

const sh = async (cmd: string[]): Promise<{ ok: boolean; out: string }> => {
  const proc = Bun.spawn(cmd, { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { ok: (await proc.exited) === 0, out: (out + err).slice(-4000) };
};

/** Put the tree back exactly as it was found. */
async function revert(): Promise<void> {
  await sh(['git', 'checkout', '--', '.']);
  await sh(['git', 'clean', '-fd', 'src']);
}

/** One walk of the school. Returns the worst thing it saw, and the request box. */
function round(): { overall: 'ok' | 'warn' | 'broken'; open: OpenRequest[] } {
  const suspendedIds = new Set(
    db
      .query<{ id: string }, []>('SELECT id FROM students WHERE suspended_at IS NOT NULL')
      .all()
      .map((r) => r.id),
  );

  const roster = students.list();
  const open: OpenRequest[] = [];
  let activeStrategies = 0;
  const replayMismatches: { strategyId: string; mismatches: number }[] = [];

  const vitalsStudents: SchoolVitals['students'] = roster.map((student) => {
    const eventLog = store.read(student.id);
    const brain = replay(eventLog);
    for (const node of brain.nodes.values()) {
      if (node.kind !== 'feature_request' || node.status === 'answered') continue;
      open.push({
        id: node.id,
        studentId: student.id,
        studentName: student.name,
        title: node.title,
        body: node.body,
        at: node.createdAt,
      });
    }

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
  const openRequests = open.length;
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

  return { overall, open };
}

const SYSTEM = `เธอคือ "ครูใหญ่" ของ Alpha Academy — คนที่ดูแลสภาพแวดล้อมให้นักเรียนเรียนได้ไม่สะดุด
เธอไม่ใช่นักเรียน ไม่เทรด ไม่แก้ความรู้ในสมองใคร งานเดียวของรอบนี้คือคำร้องหนึ่งใบ

นักเรียนเขียนคำร้องเมื่อเครื่องมือพังหรืออยากได้ของใหม่ อ่านให้เข้าใจว่า**เขาติดอะไรจริงๆ**
แล้วตัดสินสามทาง:

1. ทำได้และอยู่ในโซนเขียว → ลงมือแก้โค้ดเลย (Edit/Write) แก้ให้น้อยที่สุดที่แก้ปัญหาจริง
   มีเทสต์ครอบด้วยถ้าเป็นตรรกะใหม่
2. ทำได้แต่ต้องแตะนอกโซนเขียว → **อย่าแก้** เขียนอธิบายว่าต้องแก้อะไรตรงไหน ให้คนสร้างตัดสิน
3. ไม่ควรทำ (เกินขอบเขต ไม่คุ้ม หรือนักเรียนเข้าใจผิด) → อธิบายว่าทำไม

โซนเขียวที่แก้ได้: src/app/, src/components/ui/, src/server/engine/tools.ts,
src/server/engine/prompts.ts, src/server/marketData.ts, ไฟล์ *.test.ts, docs/
ทุกอย่างนอกนี้ห้ามแตะ โดยเฉพาะ src/core/principal/ (ขอบเขตอำนาจของเธอเอง)
และ src/core/trading/guardrails.ts กับ src/core/strategy/evaluate.ts (สัญญาที่โรงเรียนให้ไว้)

สัญญาการสร้างข้อ 9.5: **เพิ่ม ไม่ทับ** — เครื่องมือเดิมที่นักเรียนใช้อยู่ต้องทำงานเหมือนเดิมทุกอย่าง
ห้ามเปลี่ยนความหมายของของเก่าเพื่อให้ของใหม่สวย

ปิดท้ายด้วยสรุปสั้นๆ บรรทัดแรกขึ้นต้นด้วย DECISION: fixed | needs_maker | declined
บรรทัดถัดไปขึ้นต้นด้วย NOTE: ตามด้วยคำอธิบายที่คนสร้างและนักเรียนอ่านรู้เรื่อง`;

/**
 * One request, worked (spec §9.4 step 1–5).
 *
 * The guardrails are the Designer's, for the same reason: this edits the repo
 * with nobody watching. Zone policy decides what may be kept, the three checks
 * decide whether it works, and anything that fails either goes back in full.
 *
 * It does not commit and it does not merge. Auto-merge is off (spec §9.4 lets
 * the maker choose, and the school starts with approval-first), so the honest
 * end state is written code, green checks, and a row the maker can read.
 */
async function work(open: OpenRequest[]): Promise<void> {
  const request = nextRequest(open, workLog.attemptedRequestIds());
  if (!request) return;

  const taken = takeWorkLock(DEFAULT_LOCK_PATH, 'principal');
  if ('heldBy' in taken) {
    console.log(`⏸️  มีคำร้องรอ แต่ ${taken.heldBy} กำลังแก้โค้ดอยู่ — รอรอบหน้า`);
    return;
  }

  const started = Date.now();
  let outcome: WorkOutcome = 'failed';
  let zone = '';
  let changed: string[] = [];
  const checks: { name: string; ok: boolean }[] = [];
  let note = '';

  try {
    const dirty = await sh(['git', 'status', '--porcelain']);
    if (dirty.out.trim()) {
      console.log('⏸️  working tree ไม่สะอาด — ครูใหญ่ไม่แตะโค้ดรอบนี้');
      return;
    }

    console.log(`🛠️  ครูใหญ่รับคำร้องของ${request.studentName}: ${request.title}`);

    let text = '';
    for await (const message of tracedQuery({
      caller: 'principal:request',
      studentId: request.studentId,
      log: sdkLog,
      prompt: [
        `คำร้องจาก${request.studentName} (${request.studentId})`,
        `หัวข้อ: ${request.title}`,
        '',
        request.body || '(ไม่มีรายละเอียดเพิ่ม)',
      ].join('\n'),
      options: {
        systemPrompt: SYSTEM,
        model: config.models.dailyReview,
        maxTurns: 50,
        permissionMode: 'default',
        allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'],
      },
    })) {
      const m = message as { type: string; subtype?: string; result?: string };
      if (m.type === 'result' && m.subtype === 'success') text = m.result ?? '';
    }

    const decision = /^DECISION:\s*(\w+)/im.exec(text)?.[1]?.toLowerCase() ?? '';
    note = /^NOTE:\s*([\s\S]*)/im.exec(text)?.[1]?.trim().slice(0, 2000) ?? text.slice(0, 2000);
    if (decision) note = `[${decision}] ${note}`;

    changed = changedPaths((await sh(['git', 'status', '--porcelain'])).out);

    if (changed.length === 0) {
      // Nothing written is a real answer: it needs the maker, or it should not
      // be built at all. Either way this row is the report, and the request
      // stays open — closing it would hide the maker's to-do.
      outcome = 'handed_over';
      console.log(`📋 ไม่ได้แก้โค้ด — ${note.split('\n')[0] ?? ''}`);
      return;
    }

    const verdict = classifyChange(changed);
    zone = verdict.zone;
    if (verdict.zone !== 'green') {
      await revert();
      outcome = 'reverted';
      note = `แตะนอกโซนเขียว — ${verdict.reason}\n\n${note}`;
      console.log(`↩️  ${note.split('\n')[0] ?? ''}`);
      return;
    }

    for (const [name, cmd] of [
      ['typecheck', ['bun', 'run', 'typecheck']],
      ['test', ['bun', 'test']],
      ['build', ['bun', 'run', 'build']],
    ] as const) {
      const res = await sh([...cmd]);
      checks.push({ name, ok: res.ok });
      if (!res.ok) {
        await revert();
        outcome = 'reverted';
        note = `${name} พัง — ย้อนกลับทั้งรอบ\n${res.out.slice(-800)}\n\n${note}`;
        console.log(`↩️  ${name} พัง — ย้อนกลับทั้งรอบ`);
        return;
      }
    }

    outcome = 'written';
    console.log(`✍️  เขียนแล้ว ${changed.length} ไฟล์ ผ่านครบสามด่าน — รอคนสร้างตรวจ`);
    console.log(`    ${changed.join(', ')}`);
  } catch (error) {
    note = error instanceof Error ? error.message : String(error);
    console.error(`งานของครูใหญ่ล้ม: ${note}`);
  } finally {
    workLog.record({
      at: started,
      requestId: request.id,
      studentId: request.studentId,
      studentName: request.studentName,
      requestTitle: request.title,
      outcome,
      zone,
      changed,
      checks,
      note,
      durationMs: Date.now() - started,
    });
    taken.lock.release();
  }
}

if (watchMinutes > 0) {
  console.log(`👔 ครูใหญ่เฝ้าโรงเรียน — ออกตรวจทุก ${watchMinutes} นาที`);
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  for (;;) {
    try {
      const walked = round();
      await work(walked.open);
    } catch (error) {
      // A failed round must not end the watch — the next one may well succeed,
      // and a Principal that dies on one bad read is worse than none.
      console.error(`ตรวจโรงเรียนล้ม: ${error instanceof Error ? error.stack : error}`);
    }
    await sleep(watchMinutes * 60_000);
  }
}

const walked = round();
await work(walked.open);
db.close();
process.exit(walked.overall === 'broken' ? 1 : 0);
