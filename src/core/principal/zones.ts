/**
 * What the Principal is allowed to touch (spec §9.4).
 *
 * Three zones, decided by which files a change would modify:
 *
 *   🟢 green   — merge once the tests pass
 *   🟡 yellow  — write the code, open the PR, wait for the maker
 *   🔴 red     — refuse, and hand it to the maker with an explanation
 *
 * The red list is not a list of "risky" files, it is the list of promises this
 * system makes. Guardrails are what stop a student losing the maker's money;
 * the evaluator is what makes every past trade explainable; the event log is
 * the students' memory. A caretaker that can quietly edit any of those is not a
 * caretaker. And this file is on the list too — an agent that can widen its own
 * permissions has none.
 */

export type Zone = 'green' | 'yellow' | 'red';

export interface ZoneRule {
  /** Matched against the repo-relative path. */
  pattern: RegExp;
  zone: Zone;
  reason: string;
}

/**
 * First match wins, so red rules are listed first. Anything unrecognised is
 * yellow rather than green: an unknown file is not a safe file.
 */
export const ZONE_RULES: ZoneRule[] = [
  {
    pattern: /core\/trading\/guardrails\.ts$/,
    zone: 'red',
    reason: 'กติกาบ้าน — สิ่งที่กันไม่ให้นักเรียนทำเงินคนสร้างหาย ครูใหญ่แตะไม่ได้',
  },
  {
    pattern: /core\/strategy\/(evaluate|indicators)\.ts$/,
    zone: 'red',
    reason: 'เครื่องรันสูตร — แก้แล้วคำสั่งเทรดในอดีตอธิบายไม่ได้อีกต่อไป (สัญญาข้อ 6.2)',
  },
  {
    pattern: /core\/eventLog\.ts$/,
    zone: 'red',
    reason: 'สมุดเหตุการณ์ — ความทรงจำของนักเรียนทุกคนอยู่ตรงนี้',
  },
  {
    pattern: /core\/principal\//,
    zone: 'red',
    reason: 'ขอบเขตอำนาจของครูใหญ่เอง — ขยายอำนาจตัวเองไม่ได้',
  },
  {
    pattern: /(live|real)Exchange|realMoney/i,
    zone: 'red',
    reason: 'ทางเชื่อมเงินจริง — ต้องเป็นคนสร้างลงมือเองเท่านั้น',
  },

  {
    pattern: /server\/db\//,
    zone: 'yellow',
    reason: 'โครงสร้างข้อมูล — เพิ่มได้ แต่ต้องให้คนสร้างตรวจว่าของเก่ายังอ่านได้',
  },
  {
    pattern: /core\/(metabolism|strategy\/types)\.ts$/,
    zone: 'yellow',
    reason: 'ระบบเผาผลาญและชนิดข้อมูลของสูตร — กระทบนักเรียนทุกคนพร้อมกัน',
  },
  { pattern: /server\/scheduler\.ts$/, zone: 'yellow', reason: 'ตัวจัดตาราง — คุมว่าใครได้คิดเมื่อไหร่' },
  { pattern: /server\/trading\//, zone: 'yellow', reason: 'ส่วนที่ส่งคำสั่งเทรด' },

  { pattern: /server\/dashboard\//, zone: 'green', reason: 'หน้าจอของคนสร้าง' },
  // The screen moved to Next.js; without this the whole UI would fall through
  // to the unrecognised-file rule and quietly become yellow.
  { pattern: /^src\/app\//, zone: 'green', reason: 'หน้าจอของคนสร้าง' },
  // Generated presentational primitives — same risk class as the screen that
  // uses them. Widened by the maker after the Designer was told it could edit
  // these and then had a whole round reverted for doing exactly that; an agent
  // may never widen this itself (that is why core/principal is red).
  { pattern: /^src\/components\/ui\//, zone: 'green', reason: 'ชิ้นส่วนหน้าจอสำเร็จรูป' },
  { pattern: /server\/engine\/(tools|prompts)\.ts$/, zone: 'green', reason: 'เครื่องมือและคำสั่งของนักเรียน' },
  { pattern: /server\/marketData\.ts$/, zone: 'green', reason: 'ท่อข้อมูลตลาด' },
  { pattern: /\.test\.ts$/, zone: 'green', reason: 'ชุดทดสอบ' },
  { pattern: /^docs\//, zone: 'green', reason: 'เอกสาร' },
  { pattern: /^(README|CLAUDE)\.md$/, zone: 'green', reason: 'เอกสาร' },
];

export interface ZoneVerdict {
  zone: Zone;
  /** Why the change landed in this zone — the strictest file decides. */
  reason: string;
  perFile: { path: string; zone: Zone; reason: string }[];
}

export function classifyFile(path: string): { zone: Zone; reason: string } {
  for (const rule of ZONE_RULES) {
    if (rule.pattern.test(path)) return { zone: rule.zone, reason: rule.reason };
  }
  return { zone: 'yellow', reason: 'ไฟล์ที่ยังไม่ได้จัดโซน — ถือว่าต้องขออนุมัติไว้ก่อน' };
}

/** A change is as restricted as its most restricted file. */
export function classifyChange(paths: string[]): ZoneVerdict {
  if (paths.length === 0) {
    return { zone: 'green', reason: 'ไม่มีไฟล์ถูกแก้', perFile: [] };
  }

  const perFile = paths.map((path) => ({ path, ...classifyFile(path) }));
  const worst = perFile.reduce((acc, file) => {
    const rank: Record<Zone, number> = { green: 0, yellow: 1, red: 2 };
    return rank[file.zone] > rank[acc.zone] ? file : acc;
  }, perFile[0] as { path: string; zone: Zone; reason: string });

  return {
    zone: worst.zone,
    reason: worst.zone === 'green' ? 'ทุกไฟล์อยู่ในโซนเขียว' : `${worst.path}: ${worst.reason}`,
    perFile,
  };
}

export interface PrincipalPolicy {
  /**
   * Off by default, as the spec asks of itself (§9.4): earn the trust with a
   * test suite first, then let the maker turn it on.
   */
  autoMergeGreen: boolean;
}

export const DEFAULT_POLICY: PrincipalPolicy = { autoMergeGreen: false };

export type Action = 'merge' | 'await_approval' | 'refuse';

export function decideAction(verdict: ZoneVerdict, policy: PrincipalPolicy): {
  action: Action;
  explanation: string;
} {
  if (verdict.zone === 'red') {
    return { action: 'refuse', explanation: `เขตหวงห้าม — ${verdict.reason}` };
  }
  if (verdict.zone === 'yellow') {
    return { action: 'await_approval', explanation: `รอคนสร้างอนุมัติ — ${verdict.reason}` };
  }
  return policy.autoMergeGreen
    ? { action: 'merge', explanation: 'โซนเขียวและชุดทดสอบผ่าน — merge ได้' }
    : { action: 'await_approval', explanation: 'โซนเขียว แต่คนสร้างยังไม่เปิดโหมด merge อัตโนมัติ' };
}
