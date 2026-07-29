'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { fmt } from '../_components/types';
import { usePoll } from '../_components/usePoll';

interface Item {
  at: number;
  kind: string;
  who: string;
  title: string;
  detail: string;
  severity: 'ok' | 'warn' | 'bad' | 'plain';
}

const KIND_LABEL: Record<string, string> = {
  brain: 'สมอง',
  cycle: 'รอบเรียน',
  trade: 'เทรด',
  blocked: 'ถูกห้าม',
  exam: 'สอบ',
  principal: 'ครูใหญ่',
  design: 'ออกแบบ',
  sdk: 'เรียก AI',
};

const SEVERITY: Record<string, string> = {
  ok: 'text-[var(--ok)]',
  warn: 'text-[var(--warn)]',
  bad: 'text-[var(--bad)]',
  plain: 'text-muted-foreground',
};

export default function Page() {
  const [kind, setKind] = useState<string | null>(null);
  const data = usePoll<{ items: Item[]; counts: Record<string, number> }>('/api/activity');
  if (!data) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  const shown = kind ? data.items.filter((i) => i.kind === kind) : data.items;

  return (
    <div className="flex h-full flex-col">
      {/* Filters scroll sideways on a phone rather than stacking three rows deep. */}
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => setKind(null)}
          className={`min-h-9 shrink-0 rounded-full border px-3 text-xs ${
            kind === null ? 'border-primary text-foreground' : 'border-border text-muted-foreground'
          }`}
        >
          ทั้งหมด {data.items.length}
        </button>
        {Object.entries(data.counts)
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => (
            <button
              key={k}
              onClick={() => setKind(k === kind ? null : k)}
              className={`min-h-9 shrink-0 rounded-full border px-3 text-xs ${
                kind === k ? 'border-primary text-foreground' : 'border-border text-muted-foreground'
              }`}
            >
              {KIND_LABEL[k] ?? k} {n}
            </button>
          ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีอะไรเกิดขึ้น</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {shown.map((i, n) => (
              <li
                key={`${i.at}-${n}`}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {KIND_LABEL[i.kind] ?? i.kind}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">{i.who}</span>
                  <time className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {fmt(i.at)}
                  </time>
                </div>
                <p className={`mt-1 ${SEVERITY[i.severity] ?? ''}`}>{i.title}</p>
                {i.detail ? (
                  <p className="text-[11px] text-muted-foreground">{i.detail}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
