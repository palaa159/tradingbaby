/**
 * The Principal's rounds (spec §9.4) — proactive care, not just request handling.
 *
 * Each check answers one question about whether the school is still working,
 * and says plainly what to do when it is not. A check that reports "something
 * is wrong" without a next step is just anxiety.
 */

export type Severity = 'ok' | 'warn' | 'broken';

export interface HealthCheck {
  name: string;
  severity: Severity;
  detail: string;
  /** What the maker or the Principal should do about it. */
  action?: string;
}

export interface SchoolVitals {
  students: {
    id: string;
    name: string;
    energy: number;
    suspended: boolean;
    eventCount: number;
    lastEventAt: number;
  }[];
  /** Strategies whose recorded evaluations no longer reproduce (spec §9.5). */
  replayMismatches: { strategyId: string; mismatches: number }[];
  activeStrategies: number;
  openRequests: number;
  now: number;
}

const QUIET_MS = 36 * 60 * 60 * 1000; // a day and a half without a thought

export function runHealthChecks(vitals: SchoolVitals): HealthCheck[] {
  const checks: HealthCheck[] = [];

  // The build contract, checked rather than asserted. Nothing else matters if
  // the past has stopped reproducing.
  const drifted = vitals.replayMismatches.filter((m) => m.mismatches > 0);
  checks.push(
    drifted.length === 0
      ? {
          name: 'ความทำซ้ำได้ของสูตรเทรด',
          severity: 'ok',
          detail: 'ทุกสูตรรันซ้ำแล้วได้ผลเหมือนเดิม',
        }
      : {
          name: 'ความทำซ้ำได้ของสูตรเทรด',
          severity: 'broken',
          detail: `${drifted.length} สูตรรันซ้ำแล้วผลไม่ตรงกับที่บันทึกไว้`,
          action: 'หยุดปล่อยของทันที — มีอะไรบางอย่างทำให้อดีตอธิบายไม่ได้ (สัญญาข้อ 9.5)',
        },
  );

  if (vitals.students.length === 0) {
    checks.push({
      name: 'นักเรียน',
      severity: 'warn',
      detail: 'ยังไม่มีนักเรียนสักคน',
      action: 'รัน bun run cycle เพื่อรับนักเรียนเข้าเรียน',
    });
    return checks;
  }

  const suspended = vitals.students.filter((s) => s.suspended);
  if (suspended.length > 0) {
    checks.push({
      name: 'นักเรียนที่ถูกพักการเรียน',
      severity: suspended.length === vitals.students.length ? 'broken' : 'warn',
      detail: `${suspended.map((s) => s.name).join(', ')} พลังงานหมด`,
      action: 'คนสร้างตัดสินใจว่าจะให้กลับมาเรียน (แจกค่าขนมใหม่) หรือให้ลาออก',
    });
  }

  const quiet = vitals.students.filter(
    (s) => !s.suspended && vitals.now - s.lastEventAt > QUIET_MS,
  );
  if (quiet.length > 0) {
    checks.push({
      name: 'นักเรียนที่เงียบไป',
      severity: 'warn',
      detail: `${quiet.map((s) => s.name).join(', ')} ไม่ได้คิดอะไรมากกว่าหนึ่งวันครึ่ง`,
      action: 'ตรวจว่าตัวจัดตารางยังทำงาน หรือโควตาแพ็กเกจหมด',
    });
  }

  const empty = vitals.students.filter((s) => s.eventCount === 0);
  if (empty.length > 0) {
    checks.push({
      name: 'สมองว่างเปล่า',
      severity: 'warn',
      detail: `${empty.map((s) => s.name).join(', ')} ยังไม่มีอะไรในสมองเลย`,
      action: 'ปกติสำหรับนักเรียนใหม่ — ถ้าผ่านไปหลายรอบแล้วยังว่าง แปลว่ารอบไม่ได้รัน',
    });
  }

  if (checks.every((c) => c.severity === 'ok') && vitals.activeStrategies === 0) {
    checks.push({
      name: 'สูตรที่เปิดใช้อยู่',
      severity: 'warn',
      detail: 'ยังไม่มีนักเรียนคนไหนมีสูตรที่ผ่านการทดสอบ',
      action: 'ไม่ใช่ข้อผิดพลาด แต่แปลว่ายังไม่มีใครพิสูจน์อะไรได้ — เฝ้าดูต่อ',
    });
  }

  if (vitals.openRequests > 0) {
    checks.push({
      name: 'คำร้องจากนักเรียน',
      severity: 'warn',
      detail: `มีคำร้องค้างอยู่ ${vitals.openRequests} เรื่อง`,
      action: 'ครูใหญ่อ่านและจัดโซน แล้วรายงานคนสร้าง',
    });
  }

  return checks;
}

export function worstSeverity(checks: HealthCheck[]): Severity {
  if (checks.some((c) => c.severity === 'broken')) return 'broken';
  if (checks.some((c) => c.severity === 'warn')) return 'warn';
  return 'ok';
}
