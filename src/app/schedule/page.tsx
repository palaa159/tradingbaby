'use client';

import type { ScheduleData } from '../_components/types.ts';
import { hhmm } from '../_components/types.ts';
import { usePoll } from '../_components/usePoll.ts';

const STATUS: Record<string, [string, string]> = {
  done: ['รันแล้ว', 'var(--ok)'],
  skipped: ['ข้าม', 'var(--bad)'],
  upcoming: ['รอถึงคาบ', 'var(--dim)'],
  late: ['เลยเวลา', 'var(--warn)'],
};

export default function Page() {
  const d = usePoll<ScheduleData>('/api/schedule');
  if (!d) return <section className="view trades" />;

  return (
    <section className="view trades">
      <div className="stats" style={{ gap: 18, marginBottom: 16, fontSize: 13 }}>
        <span>วันนี้ {d.day}</span>
        <span>ตอนนี้ {hhmm(d.nowMinute)}</span>
        <span>
          ตื่น {hhmm(d.schedule.wakingWindow[0] ?? 0)}-{hhmm(d.schedule.wakingWindow[1] ?? 0)}
        </span>
        <span>รอบสั้น {d.schedule.shortCyclesPerDay}/คน/วัน</span>
        <span style={{ marginLeft: 'auto' }}>ทบทวน {hhmm(d.schedule.dailyReviewMinute)}</span>
      </div>

      <table>
        <tbody>
          <tr><th>เวลา</th><th>รอบ</th><th>นักเรียน</th></tr>
          {d.slots.map((slot) => (
            <tr key={`${slot.kind}-${slot.minuteOfDay}`}>
              <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {hhmm(slot.minuteOfDay)}
              </td>
              <td>{slot.kind === 'short' ? 'รอบสั้น' : 'ทบทวนประจำวัน'}</td>
              <td className="why">
                {slot.students.map((s) => {
                  const [label, color] = STATUS[s.status] ?? [s.status, 'var(--dim)'];
                  return (
                    <div key={s.id}>
                      {s.name} <span style={{ color, fontWeight: 600 }}>{label}</span>
                      {s.reason ? <span style={{ color: 'var(--dim)' }}> — {s.reason}</span> : null}
                    </div>
                  );
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {d.history.length ? (
        <>
          <h4 style={{ margin: '22px 0 8px' }}>ย้อนหลัง</h4>
          <table>
            <tbody>
              <tr><th>วัน</th><th>รันแล้ว</th><th>ข้าม</th></tr>
              {d.history.map((h) => (
                <tr key={h.day}>
                  <td>{h.day}</td>
                  <td style={{ color: 'var(--ok)' }}>{h.done}</td>
                  <td style={{ color: h.skipped ? 'var(--bad)' : 'var(--dim)' }}>{h.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </section>
  );
}
