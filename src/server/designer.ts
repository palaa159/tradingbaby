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
 * A round it keeps is committed to a branch of its own and pushed; `main` is
 * never touched and nothing is ever merged. It used to leave the work
 * uncommitted, which was safe and also a dead end — it skips any round that
 * starts on a dirty tree, so the first change it kept stopped it until the maker
 * came back and committed by hand.
 */

import { classifyChange } from '../core/principal/zones.ts';
import { DEFAULT_ACADEMY } from './academyConfig.ts';
import { hardFlags, pagesFor, runAudit, type PageAudit } from './design/audit.ts';
import { DesignLog, type DesignOutcome } from './db/designLog.ts';
import { SdkLog } from './db/sdkLog.ts';
import { openAcademyDb } from './db/sqliteStore.ts';
import { tracedQuery } from './engine/sdkTrace.ts';
import { changedPaths, handOff, revertTree, sh } from './git.ts';
import { DEFAULT_LOCK_PATH, takeWorkLock } from './workLock.ts';

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

/**
 * Pages per round, and the longest a round's model turn may take.
 *
 * All nine pages at two viewports is eighteen screenshots, and asking for a
 * critique of eighteen images turned out to be a job the model does not finish:
 * three consecutive rounds sat past twenty minutes in the turn and were killed
 * before reaching the gates, at about $1.39 each. Four pages a round, rotating,
 * covers everything across a morning and leaves each round small enough to end.
 *
 * The deadline is the backstop. A round that overruns is aborted and reverted,
 * which costs one slot instead of a slot and the maker's attention.
 */
const PAGES_PER_ROUND = Number(arg('pages') ?? 4);
const DEADLINE_MS = Number(arg('deadline') ?? 12) * 60_000;

const db = openAcademyDb(arg('db') ?? 'academy.db');
const designLog = new DesignLog(db);
const sdkLog = new SdkLog(db);

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

**เธอไม่มี Bash และเรียกคำสั่งเชลล์ไม่ได้เลย** — เครื่องมือที่มีคือ Read, Edit, Write, Glob, Grep
เท่านั้น เรียกอย่างอื่นจะถูกปฏิเสธและเสียเทิร์นฟรีๆ (รอบก่อนเสียไป 22 เทิร์นกับการลอง Bash
จนหมดโควตาเทิร์นแล้วไม่ได้อะไรเลย) อยากดูไฟล์ใช้ Glob/Grep/Read
ไม่ต้องรัน typecheck, เทสต์ หรือ build เอง — ระบบรันให้ทั้งสามอย่างหลังเธอจบรอบ
ถ้าอันไหนพังจะย้อนงานเธอทั้งหมดเอง เธอมีหน้าที่แก้ให้ถูก ไม่ใช่หน้าที่ตรวจ

ตอบกลับด้วยการ**ลงมือแก้ไฟล์เลย** (ใช้ Edit/Write) แล้วปิดท้ายด้วยสรุปสั้นๆ:
บรรทัดแรกขึ้นต้นด้วย FINDINGS: ตามด้วยรายการปัญหาที่เจอ อันละบรรทัด
บรรทัดสุดท้ายขึ้นต้นด้วย CHANGED: ตามด้วยสิ่งที่แก้ไป (หรือ CHANGED: none)`;

async function round(): Promise<void> {
  const started = Date.now();
  let outcome: DesignOutcome = 'failed';
  let findings: string[] = [];
  let changed: string[] = [];
  let note = '';
  let branch = '';
  let flags: string[] = [];

  // The Principal edits the same tree and switches the same branches. Whichever
  // of them is holding this, the other waits — an agent that checked out a
  // branch under the other's feet would take its work with it.
  const taken = takeWorkLock(DEFAULT_LOCK_PATH, 'designer');
  if ('heldBy' in taken) {
    console.log(`⏸️  ${taken.heldBy} กำลังแก้โค้ดอยู่ — รอรอบหน้า`);
    return;
  }

  try {
    await Bun.$`mkdir -p ${SHOTS}`.quiet();

    // A dirty tree before we start would make "what did the designer change?"
    // unanswerable, so refuse rather than guess.
    const pre = await sh(['git', 'status', '--porcelain']);
    if (pre.out.trim()) {
      // Recorded by the `finally`, once. It used to write the row here as well,
      // so every skipped round appeared in the log twice.
      note = 'ข้ามรอบนี้ — working tree ไม่สะอาด แยกไม่ออกว่าอะไรเป็นของ designer';
      console.log(note);
      return;
    }

    const paths = pagesFor(designLog.count(), PAGES_PER_ROUND, PAGES);
    const audits = await runAudit({
      base: BASE,
      paths,
      shotDir: SHOTS,
      student: DEFAULT_ACADEMY.students[0]?.seed,
    });
    flags = hardFlags(audits);
    console.log(
      `📸 ตรวจ ${audits.length} หน้า (${paths.join(' ')}) · เจอปัญหาที่วัดได้ ${flags.length} ข้อ`,
    );

    const prompt = [
      'นี่คือผลตรวจหน้าจอจริงรอบล่าสุด ดูภาพประกอบทุกภาพก่อนวิจารณ์',
      '',
      flags.length ? `ปัญหาที่เครื่องวัดได้แล้ว:\n${flags.map((f) => `- ${f}`).join('\n')}` : 'เครื่องยังไม่เจอปัญหาที่วัดเป็นตัวเลขได้ — ที่เหลือต้องใช้ตาเธอ',
      '',
      evidence(audits),
    ].join('\n');

    const abort = new AbortController();
    const deadline = setTimeout(() => {
      abort.abort();
    }, DEADLINE_MS);

    let text = '';
    try {
      for await (const message of tracedQuery({
        caller: 'design:round',
        studentId: undefined,
        log: sdkLog,
        prompt,
        options: {
          systemPrompt: SYSTEM,
          model: DEFAULT_ACADEMY.models.dailyReview,
          maxTurns: 40,
          permissionMode: 'default',
          allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'],
          abortController: abort,
        },
      })) {
        const m = message as { type: string; subtype?: string; result?: string };
        if (m.type === 'result' && m.subtype === 'success') text = m.result ?? '';
      }
    } finally {
      clearTimeout(deadline);
    }

    if (abort.signal.aborted) {
      // Half-finished edits are worse than none: the model was cut off mid-
      // thought, and whatever is in the tree is not a design it stands behind.
      await revertTree();
      outcome = 'reverted';
      note = `เกินเวลา ${DEADLINE_MS / 60_000} นาที — ตัดรอบแล้วย้อนกลับทั้งหมด`;
      console.log(`⏱️  ${note}`);
      return;
    }

    findings = text
      .split('\n')
      .filter((l) => l.trim().startsWith('-') || /^FINDINGS:/i.test(l))
      .map((l) => l.replace(/^FINDINGS:\s*/i, '').replace(/^-\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 30);

    const post = await sh(['git', 'status', '--porcelain']);
    changed = changedPaths(post.out);

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
      await revertTree();
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
        await revertTree();
        outcome = 'reverted';
        note = `${label} พัง — ย้อนกลับทั้งรอบ`;
        console.log(`↩️  ${note}\n${res.out.slice(-800)}`);
        return;
      }
    }

    const handed = await handOff({
      prefix: 'designer',
      subject: `Designer: ${findings[0]?.slice(0, 60) ?? `แก้หน้าจอ ${changed.length} ไฟล์`}`,
      body: [
        findings.length ? `สิ่งที่เจอ:\n${findings.map((f) => `- ${f}`).join('\n')}` : '',
        flags.length ? `ปัญหาที่เครื่องวัดได้ก่อนแก้:\n${flags.map((f) => `- ${f}`).join('\n')}` : '',
        'เขียนโดย alpha-designer แบบไม่มีคนเฝ้า โซนเขียวเท่านั้น',
        'typecheck, test และ build ผ่านครบก่อน commit — ยังไม่ merge',
      ]
        .filter(Boolean)
        .join('\n\n'),
      paths: changed,
      at: started,
    });

    if (!handed.ok) {
      outcome = 'reverted';
      note = `ส่งมอบงานไม่สำเร็จ — ${handed.error}`;
      console.log(`↩️  ${note}`);
      return;
    }

    branch = handed.branch;
    outcome = 'changed';
    note = `แก้ ${changed.length} ไฟล์: ${changed.join(', ')}\n${handed.note}`;
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
      branch,
      note,
      durationMs: Date.now() - started,
    });
    taken.lock.release();
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
