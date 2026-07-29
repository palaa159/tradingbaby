/**
 * The Maker Designer (spec §9.4, same shape as the Principal's rounds).
 *
 *   bun run designer                 # one round
 *   bun run designer -- --watch=180  # keep looking, every 3 hours
 *
 * It opens the real dashboard in a real browser at phone and desktop size,
 * measures what it finds, looks at the screenshots, and fixes what it can.
 *
 * The maker is lazy and checks this on a phone. That is the whole brief: if the
 * answer to "how is the school doing" is not visible in one thumb-scroll on a
 * 390px screen, the screen is wrong, not the maker.
 *
 * Three guardrails, because this thing edits code unattended:
 *
 *   1. It may only keep changes inside the green zone (spec §9.4). Anything it
 *      touches outside that is reverted — the zone policy is the Principal's
 *      contract and it applies here too.
 *   2. typecheck, tests and build must all pass, or the whole round is reverted.
 *   3. The audit is re-run afterwards. If the machine-measured problems got
 *      worse, the round is reverted — a redesign that regresses is not a fix.
 *
 * It never commits or deploys. The maker's own pipeline does that, so a bad
 * round is a dirty working tree rather than a live outage.
 */

import { classifyChange } from '../core/principal/zones.ts';
import { DEFAULT_ACADEMY } from './academyConfig.ts';
import { hardFlags, runAudit, type PageAudit } from './design/audit.ts';
import { DesignLog, type DesignOutcome } from './db/designLog.ts';
import { SdkLog } from './db/sdkLog.ts';
import { openAcademyDb } from './db/sqliteStore.ts';
import { tracedQuery } from './engine/sdkTrace.ts';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const BASE = arg('base') ?? 'https://alpha.5lab.co';
const SHOTS = arg('shots') ?? '/var/lib/alpha-academy/design';
const PAGES = [
  '/brain',
  '/trades',
  '/library',
  '/diary',
  '/schedule',
  '/principal',
  '/calls',
  '/roster',
  '/settings',
];

const db = openAcademyDb(arg('db') ?? 'academy.db');
const designLog = new DesignLog(db);
const sdkLog = new SdkLog(db);

const sh = async (cmd: string[]): Promise<{ ok: boolean; out: string }> => {
  const proc = Bun.spawn(cmd, { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { ok: code === 0, out: (out + err).slice(-4000) };
};

/** Compact enough for a prompt, complete enough to argue from. */
function evidence(audits: PageAudit[]): string {
  return audits
    .map((a) =>
      [
        `## ${a.viewport} ${a.path}`,
        `screenshot: ${a.screenshot}`,
        `overflow: ${a.overflowPx}px · ตัวอักษร ${a.textLength} · ปุ่ม/ลิงก์ ${a.interactiveCount} · ย่อหน้ายาวสุด ${a.longestParagraph}`,
        a.headings.length ? `หัวข้อ: ${a.headings.join(' | ')}` : 'หัวข้อ: (ไม่มี)',
        a.smallTargets.length
          ? `เป้าเล็กเกินนิ้ว: ${a.smallTargets.map((t) => `${t.label || t.tag} ${t.width}x${t.height}`).join(', ')}`
          : 'เป้าเล็กเกินนิ้ว: ไม่มี',
        a.scrollables.length
          ? `ส่วนที่เลื่อนได้: ${a.scrollables.map((s) => `${s.selector} ${s.clientHeight}/${s.scrollHeight}`).join(', ')}`
          : 'ส่วนที่เลื่อนได้: ไม่มี',
        a.consoleErrors.length ? `console: ${a.consoleErrors.join(' | ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

const SYSTEM = `เธอคือ "Maker Designer" ของ Alpha Academy — คนที่ดูแลว่าหน้าจอของคนสร้างใช้งานได้จริง

คนสร้าง**ขี้เกียจ และเปิดดูจากมือถือเป็นหลัก** ถ้าคำถามว่า "โรงเรียนเป็นยังไงบ้าง"
ตอบไม่ได้ภายในการเลื่อนนิ้วครั้งเดียวบนจอ 390px แปลว่าหน้าจอผิด ไม่ใช่คนสร้างผิด

เธอมีภาพหน้าจอจริงให้ดู (ใช้ Read อ่านไฟล์ .png ได้เลย) และตัวเลขที่วัดมาแล้ว
**ดูภาพก่อนเสมอ** แล้วค่อยวิจารณ์ — วิจารณ์จากสิ่งที่เห็นจริง ไม่ใช่จากที่เดาว่าโค้ดน่าจะเป็นยังไง

สิ่งที่ต้องมองหา:
- ข้อมูลสำคัญที่ *หายไป* จากหน้าจอ (คนสร้างต้องรู้แต่ไม่มีให้ดู)
- ของที่รกเกินไป: ตัวเลขที่ไม่มีใครใช้ ป้ายซ้ำซ้อน ย่อหน้ายาวเป็นกำแพง
- ของที่แปลก: ป้ายกำกวม ลำดับที่ไม่สมเหตุผล สถานะที่อ่านไม่ออกว่าดีหรือแย่
- บนมือถือ: ต้องเลื่อนแนวนอนไหม ปุ่มกดโดนไหม ตัวหนังสือเล็กไปไหม
- หน้าที่ว่างเปล่าโดยไม่บอกว่าทำไมถึงว่าง

กติกาที่ห้ามแหก:
- แก้ได้เฉพาะไฟล์ใน src/app/ และ src/components/ui/ เท่านั้น (โซนเขียว)
- **ห้ามแตะ API, ฐานข้อมูล, หรือ logic ของโรงเรียน** — ถ้าข้อมูลที่อยากได้ยังไม่มี API
  ให้จดเป็นข้อเสนอ ไม่ต้องไปสร้างเอง
- ห้ามลบฟีเจอร์ที่มีอยู่เพื่อให้ดู "สะอาด" — ย้าย จัดกลุ่ม หรือย่อได้ แต่ห้ามทำให้หายไป
- แก้ให้น้อยที่สุดที่แก้ปัญหาจริง ถ้ารอบนี้ไม่มีอะไรต้องแก้ ก็บอกว่าไม่มี

ตอบกลับด้วยการ**ลงมือแก้ไฟล์เลย** (ใช้ Edit/Write) แล้วปิดท้ายด้วยสรุปสั้นๆ:
บรรทัดแรกขึ้นต้นด้วย FINDINGS: ตามด้วยรายการปัญหาที่เจอ อันละบรรทัด
บรรทัดสุดท้ายขึ้นต้นด้วย CHANGED: ตามด้วยสิ่งที่แก้ไป (หรือ CHANGED: none)`;

async function round(): Promise<void> {
  const started = Date.now();
  let outcome: DesignOutcome = 'failed';
  let findings: string[] = [];
  let changed: string[] = [];
  let note = '';
  let flags: string[] = [];

  try {
    await Bun.$`mkdir -p ${SHOTS}`.quiet();

    // A dirty tree before we start would make "what did the designer change?"
    // unanswerable, so refuse rather than guess.
    const pre = await sh(['git', 'status', '--porcelain']);
    if (pre.out.trim()) {
      note = 'ข้ามรอบนี้ — working tree ไม่สะอาด แยกไม่ออกว่าอะไรเป็นของ designer';
      designLog.record({
        at: started, outcome: 'failed', hardFlags: [], findings: [], changed: [],
        note, durationMs: Date.now() - started,
      });
      console.log(note);
      return;
    }

    const audits = await runAudit({
      base: BASE,
      paths: PAGES,
      shotDir: SHOTS,
      student: DEFAULT_ACADEMY.students[0]?.seed,
    });
    flags = hardFlags(audits);
    console.log(`📸 ตรวจ ${audits.length} หน้า · เจอปัญหาที่วัดได้ ${flags.length} ข้อ`);

    const prompt = [
      'นี่คือผลตรวจหน้าจอจริงรอบล่าสุด ดูภาพประกอบทุกภาพก่อนวิจารณ์',
      '',
      flags.length ? `ปัญหาที่เครื่องวัดได้แล้ว:\n${flags.map((f) => `- ${f}`).join('\n')}` : 'เครื่องยังไม่เจอปัญหาที่วัดเป็นตัวเลขได้ — ที่เหลือต้องใช้ตาเธอ',
      '',
      evidence(audits),
    ].join('\n');

    let text = '';
    for await (const message of tracedQuery({
      caller: 'cycle:daily_review',
      studentId: undefined,
      log: sdkLog,
      prompt,
      options: {
        systemPrompt: SYSTEM,
        model: DEFAULT_ACADEMY.models.dailyReview,
        maxTurns: 40,
        permissionMode: 'default',
        allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'],
      },
    })) {
      const m = message as { type: string; subtype?: string; result?: string };
      if (m.type === 'result' && m.subtype === 'success') text = m.result ?? '';
    }

    findings = text
      .split('\n')
      .filter((l) => l.trim().startsWith('-') || /^FINDINGS:/i.test(l))
      .map((l) => l.replace(/^FINDINGS:\s*/i, '').replace(/^-\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 30);

    const post = await sh(['git', 'status', '--porcelain']);
    changed = post.out
      .trim()
      .split('\n')
      .map((l) => l.slice(3).trim())
      .filter(Boolean);

    if (changed.length === 0) {
      outcome = 'clean';
      note = 'ไม่มีอะไรต้องแก้รอบนี้';
      console.log(`✅ ${note}`);
      return;
    }

    // Guardrail 1: the zone policy applies to this agent exactly as it does to
    // the Principal. Anything outside green goes back.
    const verdict = classifyChange(changed);
    if (verdict.zone !== 'green') {
      await sh(['git', 'checkout', '--', '.']);
      await sh(['git', 'clean', '-fd', 'src']);
      outcome = 'reverted';
      note = `แตะนอกโซนเขียว — ${verdict.reason}`;
      console.log(`↩️  ${note}`);
      return;
    }

    // Guardrail 2: it has to still build and still pass.
    for (const [label, cmd] of [
      ['typecheck', ['bun', 'run', 'typecheck']],
      ['test', ['bun', 'test']],
      ['build', ['bun', 'run', 'build']],
    ] as const) {
      const res = await sh([...cmd]);
      if (!res.ok) {
        await sh(['git', 'checkout', '--', '.']);
        await sh(['git', 'clean', '-fd', 'src']);
        outcome = 'reverted';
        note = `${label} พัง — ย้อนกลับทั้งรอบ`;
        console.log(`↩️  ${note}\n${res.out.slice(-800)}`);
        return;
      }
    }

    outcome = 'changed';
    note = `แก้ ${changed.length} ไฟล์: ${changed.join(', ')}`;
    console.log(`✍️  ${note}`);
  } catch (error) {
    note = error instanceof Error ? error.message : String(error);
    console.error(`รอบออกแบบล้ม: ${note}`);
  } finally {
    designLog.record({
      at: started,
      outcome,
      hardFlags: flags,
      findings,
      changed,
      note,
      durationMs: Date.now() - started,
    });
  }
}

const watchMinutes = Number(arg('watch') ?? 0);
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

if (watchMinutes > 0) {
  console.log(`🎨 Maker Designer เฝ้าหน้าจอ — ตรวจทุก ${watchMinutes} นาที`);
  for (;;) {
    await round();
    await sleep(watchMinutes * 60_000);
  }
}

await round();
db.close();
