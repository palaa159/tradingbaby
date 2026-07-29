'use client';

import type { LibraryData } from '../_components/types.ts';
import { usePoll } from '../_components/usePoll.ts';

const LABEL: Record<string, [string, string]> = {
  endorsed: ['สถาบันรับรอง', 'var(--ok)'],
  rejected: ['สถาบันตีตก', 'var(--dim)'],
  disputed: ['ยังเถียงกันอยู่', 'var(--warn)'],
  insufficient: ['หลักฐานยังไม่พอ', 'var(--dim)'],
};

export default function Page() {
  const data = usePoll<LibraryData>('/api/library');
  if (!data) return <section className="view trades" />;
  const s = data.summary;

  return (
    <section className="view trades">
      <div className="stats" style={{ gap: 18, marginBottom: 16, fontSize: 13 }}>
        <span style={{ color: 'var(--ok)' }}>รับรองแล้ว {s.endorsed}</span>
        <span style={{ color: 'var(--warn)' }}>กำลังเถียง {s.disputed}</span>
        <span>ตีตก {s.rejected}</span>
        <span>รอหลักฐาน {s.pending}</span>
        <span style={{ marginLeft: 'auto' }}>ทั้งชั้น {data.classSize} คน</span>
      </div>
      {data.entries.length ? (
        <table>
          <tbody>
            <tr><th>ข้ออ้าง (กฎที่พิสูจน์)</th><th>สถานะ</th><th>ใครยืนยันบ้าง</th></tr>
            {data.entries.map((e, i) => {
              const [label, color] = LABEL[e.consensus] ?? [e.consensus, 'var(--dim)'];
              return (
                <tr key={`${e.statement}-${i}`}>
                  <td><div>{e.statement}</div></td>
                  <td style={{ color, fontWeight: 600 }}>{label}</td>
                  <td className="why">
                    {e.verdicts.map((v, j) => (
                      <span key={`${v.studentName}-${j}`}>
                        {j > 0 ? ' · ' : ''}
                        {v.studentName}{' '}
                        <span style={{ color: v.status === 'adopted' ? 'var(--ok)' : 'var(--bad)' }}>
                          {v.status === 'adopted' ? 'รับ' : 'ตีตก'}
                        </span>
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty">ยังไม่มีข้ออ้างที่ผ่านการทดสอบ — นักเรียนต้องพิสูจน์อะไรสักอย่างก่อน</div>
      )}
    </section>
  );
}
