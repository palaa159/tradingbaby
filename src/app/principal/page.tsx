'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt, type PrincipalData } from '../_components/types';
import { usePoll } from '../_components/usePoll';

const BADGE: Record<string, [string, string]> = {
  ok: ['✅', 'text-[var(--ok)]'],
  warn: ['⚠️', 'text-[var(--warn)]'],
  broken: ['🚨', 'text-[var(--bad)]'],
};

const MARK: Record<string, [string, string]> = {
  ok: ['✓', 'text-[var(--ok)]'],
  warn: ['⚠', 'text-[var(--warn)]'],
  broken: ['✗', 'text-[var(--bad)]'],
};

export default function Page() {
  const data = usePoll<PrincipalData>('/api/principal');
  if (!data) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  if (!data.rounds.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        ครูใหญ่ยังไม่ได้ออกตรวจเลย — <code>bun run principal -- --watch=15</code>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 md:p-5">
      {data.rounds.map((r) => {
        const [badge, color] = BADGE[r.overall] ?? ['•', 'text-muted-foreground'];
        return (
          <Card key={r.id} className="gap-0 py-3">
            <CardHeader className="px-3 pb-2">
              <CardTitle className={`flex flex-wrap items-baseline gap-2 text-sm ${color}`}>
                <span>
                  {badge} {r.overall}
                </span>
                <time className="text-[11px] font-normal text-muted-foreground">{fmt(r.at)}</time>
              </CardTitle>
              <p className="mt-1 text-[11px] text-muted-foreground">
                นักเรียน {r.students} · สูตร {r.activeStrategies} · คำร้องค้าง {r.openRequests} ·
                ตรวจซ้ำ {r.replayChecked}
                {r.replayMismatches ? (
                  <span className="text-[var(--bad)]"> · ผลไม่ตรง {r.replayMismatches}</span>
                ) : null}{' '}
                · merge อัตโนมัติ {r.autoMergeGreen ? 'เปิด' : 'ปิด'}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 px-3 text-sm">
              {r.checks.map((c, i) => {
                const [mark, mc] = MARK[c.severity] ?? ['•', 'text-muted-foreground'];
                return (
                  <div key={`${c.name}-${i}`}>
                    <span className={mc}>{mark}</span> {c.name}: {c.detail}
                    {c.action ? (
                      <p className="ml-4 text-[11px] text-muted-foreground">→ {c.action}</p>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
