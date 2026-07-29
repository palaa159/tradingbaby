'use client';

import type { PrincipalData } from '../_components/types.ts';
import { fmt } from '../_components/types.ts';
import { usePoll } from '../_components/usePoll.ts';

const BADGE: Record<string, [string, string]> = {
  ok: ['✅', 'var(--ok)'],
  warn: ['⚠️', 'var(--warn)'],
  broken: ['🚨', 'var(--bad)'],
};

const MARK: Record<string, [string, string]> = {
  ok: ['✓', 'var(--ok)'],
  warn: ['⚠', 'var(--warn)'],
  broken: ['✗', 'var(--bad)'],
};

export default function Page() {
  const data = usePoll<PrincipalData>('/api/principal');
  if (!data) return <section className="view trades" />;

  if (!data.rounds.length) {
    return (
      <section className="view trades">
        <div className="empty">
          ครูใหญ่ยังไม่ได้ออกตรวจเลย — รัน bun run principal -- --watch=15
        </div>
      </section>
    );
  }

  return (
    <section className="view trades">
      {data.rounds.map((r) => {
        const [badge, color] = BADGE[r.overall] ?? ['•', 'var(--dim)'];
        return (
          <div className="entry" key={r.id}>
            <h4 style={{ color }}>
              {badge} {r.overall}
            </h4>
            <time>{fmt(r.at)}</time>
            <div className="why" style={{ margin: '6px 0 10px' }}>
              นักเรียน {r.students} · สูตรที่เปิดใช้ {r.activeStrategies} · คำร้องค้าง{' '}
              {r.openRequests} · ตรวจซ้ำ {r.replayChecked} สูตร
              {r.replayMismatches ? (
                <span style={{ color: 'var(--bad)' }}> · ผลไม่ตรง {r.replayMismatches}</span>
              ) : null}{' '}
              · merge อัตโนมัติ {r.autoMergeGreen ? 'เปิด' : 'ปิด'}
            </div>
            {r.checks.map((c, i) => {
              const [mark, mc] = MARK[c.severity] ?? ['•', 'var(--dim)'];
              return (
                <div key={`${c.name}-${i}`} style={{ margin: '3px 0' }}>
                  <span style={{ color: mc }}>{mark}</span> {c.name}: {c.detail}
                  {c.action ? (
                    <div className="why" style={{ marginLeft: 16 }}>
                      → {c.action}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
