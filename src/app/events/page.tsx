'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { fmt } from '../_components/types';
import { usePoll } from '../_components/usePoll';

interface RawEvent {
  studentId: string;
  studentName: string;
  seq: number;
  at: number;
  type: string;
  title: string;
  detail: string;
}

const TYPE_COLOR: Record<string, string> = {
  node_added: 'text-[var(--ok)]',
  edge_added: 'text-[#58a6ff]',
  node_updated: 'text-[var(--warn)]',
};

function EventsView() {
  const student = useSearchParams().get('student');
  const [type, setType] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const q = new URLSearchParams();
  if (!all && student) q.set('student', student);
  if (type) q.set('type', type);
  const data = usePoll<{ events: RawEvent[]; total: number; counts: Record<string, number> }>(
    `/api/events?${q.toString()}`,
  );

  if (!data) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <span className="text-muted-foreground">สมุดเหตุการณ์ {data.total} รายการ</span>
        <button
          onClick={() => setType(null)}
          className={`min-h-9 rounded-full border px-3 ${type === null ? 'border-primary' : 'border-border text-muted-foreground'}`}
        >
          ทุกชนิด
        </button>
        {Object.entries(data.counts).map(([t, n]) => (
          <button
            key={t}
            onClick={() => setType(t === type ? null : t)}
            className={`min-h-9 rounded-full border px-3 ${type === t ? 'border-primary' : 'border-border text-muted-foreground'}`}
          >
            {t} {n}
          </button>
        ))}
        {student ? (
          <button onClick={() => setAll(!all)} className="ml-auto min-h-9 underline">
            {all ? 'ดูเฉพาะคนนี้' : 'ดูทั้งโรงเรียน'}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {data.events.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีเหตุการณ์</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {data.events.map((e) => (
              <li
                key={`${e.studentId}-${e.seq}`}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">#{e.seq}</span>
                  <Badge variant="outline" className={`text-[10px] ${TYPE_COLOR[e.type] ?? ''}`}>
                    {e.type}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">{e.studentName}</span>
                  <time className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {fmt(e.at)}
                  </time>
                </div>
                <p className="mt-1 break-words">{e.title}</p>
                <p className="break-words text-[11px] text-muted-foreground">{e.detail}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <EventsView />
    </Suspense>
  );
}
