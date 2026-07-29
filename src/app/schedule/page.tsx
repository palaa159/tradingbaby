'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hhmm, type ScheduleData } from '../_components/types';
import { usePoll } from '../_components/usePoll';

const STATUS: Record<string, { label: string; className: string }> = {
  done: { label: 'รันแล้ว', className: 'text-[var(--ok)] border-[var(--ok)]/40' },
  skipped: { label: 'ข้าม', className: 'text-[var(--bad)] border-[var(--bad)]/40' },
  upcoming: { label: 'รอถึงคาบ', className: 'text-muted-foreground' },
  late: { label: 'เลยเวลา', className: 'text-[var(--warn)] border-[var(--warn)]/40' },
};

export default function Page() {
  const d = usePoll<ScheduleData>('/api/schedule');
  if (!d) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  return (
    <div className="h-full overflow-y-auto p-3 md:p-5">
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>วันนี้ {d.day}</span>
        <span>ตอนนี้ {hhmm(d.nowMinute)}</span>
        <span>
          ตื่น {hhmm(d.schedule.wakingWindow[0] ?? 0)}–{hhmm(d.schedule.wakingWindow[1] ?? 0)}
        </span>
        <span>รอบสั้น {d.schedule.shortCyclesPerDay}/คน/วัน</span>
        <span>ทบทวน {hhmm(d.schedule.dailyReviewMinute)}</span>
      </div>

      {/* One card per bell reads far better on a phone than a wide table. */}
      <div className="flex flex-col gap-2">
        {d.slots.map((slot) => (
          <Card key={`${slot.kind}-${slot.minuteOfDay}`} className="gap-0 py-3">
            <CardHeader className="px-3 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <span className="font-mono tabular-nums">{hhmm(slot.minuteOfDay)}</span>
                <span className="font-normal text-muted-foreground">
                  {slot.kind === 'short' ? 'รอบสั้น' : 'ทบทวนประจำวัน'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 px-3">
              {slot.students.map((s) => {
                const st = STATUS[s.status] ?? { label: s.status, className: '' };
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-20">{s.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${st.className}`}>
                      {st.label}
                    </Badge>
                    {s.reason ? (
                      <span className="text-[11px] text-muted-foreground">{s.reason}</span>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {d.history.length ? (
        <>
          <h2 className="mb-2 mt-6 text-sm font-medium text-muted-foreground">ย้อนหลัง</h2>
          <div className="flex flex-col gap-1">
            {d.history.map((h) => (
              <div
                key={h.day}
                className="flex items-center gap-4 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="font-mono">{h.day}</span>
                <span className="text-[var(--ok)]">รันแล้ว {h.done}</span>
                <span className={h.skipped ? 'text-[var(--bad)]' : 'text-muted-foreground'}>
                  ข้าม {h.skipped}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
