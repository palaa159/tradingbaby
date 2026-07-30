'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '../_components/types';
import { usePoll } from '../_components/usePoll';

interface Round {
  id: number;
  at: number;
  outcome: string;
  hardFlags: string[];
  findings: string[];
  changed: string[];
  branch: string;
  note: string;
  durationMs: number;
}

const OUTCOME: Record<string, [string, string]> = {
  clean: ['ไม่มีอะไรต้องแก้', 'text-muted-foreground'],
  changed: ['แก้แล้ว', 'text-[var(--ok)]'],
  reverted: ['ย้อนกลับ', 'text-[var(--warn)]'],
  failed: ['ล้ม', 'text-[var(--bad)]'],
};

export default function Page() {
  const data = usePoll<{ rounds: Round[] }>('/api/design');
  if (!data) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  if (!data.rounds.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Maker Designer ยังไม่ได้ออกตรวจ — <code>bun run designer</code>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 md:p-5">
      {data.rounds.map((r) => {
        const [label, color] = OUTCOME[r.outcome] ?? [r.outcome, 'text-muted-foreground'];
        return (
          <Card key={r.id} className="gap-0 py-3">
            <CardHeader className="px-3 pb-2">
              <CardTitle className={`flex flex-wrap items-center gap-2 text-sm ${color}`}>
                {label}
                <span className="text-[11px] font-normal text-muted-foreground">
                  {(r.durationMs / 1000).toFixed(0)}s
                </span>
                <time className="ml-auto text-[11px] font-normal text-muted-foreground">
                  {fmt(r.at)}
                </time>
              </CardTitle>
              {r.note ? <p className="text-[11px] text-muted-foreground">{r.note}</p> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-3">
              {r.branch ? (
                <p className="font-mono text-[11px] text-[var(--ok)]">🌿 {r.branch}</p>
              ) : null}
              {r.changed.length ? (
                <div className="flex flex-wrap gap-1">
                  {r.changed.map((f) => (
                    <Badge key={f} variant="outline" className="font-mono text-[10px]">
                      {f}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {r.hardFlags.length ? (
                <div>
                  <h4 className="text-[11px] text-muted-foreground">ปัญหาที่วัดได้</h4>
                  <ul className="mt-1 flex flex-col gap-0.5 text-[11px]">
                    {r.hardFlags.map((f, i) => (
                      <li key={i} className="text-[var(--warn)]">
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {r.findings.length ? (
                <div>
                  <h4 className="text-[11px] text-muted-foreground">สิ่งที่ตาเห็น</h4>
                  <ul className="mt-1 flex flex-col gap-0.5 text-[11px]">
                    {r.findings.map((f, i) => (
                      <li key={i}>· {f}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
