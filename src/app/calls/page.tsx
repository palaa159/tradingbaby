'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '../_components/types';
import { usePoll } from '../_components/usePoll';

interface SdkCall {
  id: number;
  at: number;
  caller: string;
  studentId?: string;
  model: string;
  effort?: string;
  systemPrompt?: string;
  prompt: string;
  result?: string;
  subtype?: string;
  isError: boolean;
  numTurns?: number;
  costUsd?: number;
  durationMs: number;
  toolCalls: string[];
}

interface CallsView {
  calls: SdkCall[];
  summary: { caller: string; calls: number; costUsd: number; errors: number }[];
}

function CallsList() {
  const student = useSearchParams().get('student');
  const [all, setAll] = useState(false);
  const data = usePoll<CallsView>(
    all || !student ? '/api/sdk-calls' : `/api/sdk-calls?student=${encodeURIComponent(student)}`,
    5000,
  );
  const [open, setOpen] = useState<number | null>(null);

  if (!data) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 md:p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {data.summary.map((s) => (
          <span key={s.caller}>
            {s.caller} · {s.calls} ครั้ง · ${s.costUsd.toFixed(4)}
            {s.errors ? <span className="text-[var(--bad)]"> · พลาด {s.errors}</span> : null}
          </span>
        ))}
        {student ? (
          <button className="ml-auto inline-flex min-h-9 items-center underline" onClick={() => setAll(!all)}>
            {all ? 'ดูเฉพาะคนนี้' : 'ดูทั้งโรงเรียน'}
          </button>
        ) : null}
      </div>

      {data.calls.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีการเรียก AI ที่บันทึกไว้</p>
      ) : (
        data.calls.map((c) => (
          <Card key={c.id} className="gap-0 py-3">
            <CardHeader className="px-3 pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className="text-[10px]">
                  {c.caller}
                </Badge>
                <span className="font-mono text-[11px] font-normal text-muted-foreground">
                  {c.model}
                  {c.effort ? ` · ${c.effort}` : ''}
                </span>
                {c.isError ? (
                  <Badge variant="outline" className="text-[10px] text-[var(--bad)]">
                    {c.subtype ?? 'error'}
                  </Badge>
                ) : null}
                <time className="ml-auto text-[11px] font-normal text-muted-foreground">
                  {fmt(c.at)}
                </time>
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                {c.numTurns ?? 0} turns · {(c.durationMs / 1000).toFixed(1)}s
                {c.costUsd !== undefined ? ` · $${c.costUsd.toFixed(4)}` : ''}
                {c.toolCalls.length ? ` · เครื่องมือ ${c.toolCalls.length} ครั้ง` : ''}
              </p>
            </CardHeader>
            <CardContent className="px-3">
              <button
                className="inline-flex min-h-9 items-center text-[11px] text-primary underline"
                onClick={() => setOpen(open === c.id ? null : c.id)}
              >
                {open === c.id ? 'ซ่อนรายละเอียด' : 'ดู prompt และคำตอบ'}
              </button>
              {open === c.id ? (
                <div className="mt-2 flex flex-col gap-3 text-[11px]">
                  {c.toolCalls.length ? (
                    <div className="flex flex-wrap gap-1">
                      {c.toolCalls.map((t, i) => (
                        <Badge key={`${t}-${i}`} variant="outline" className="text-[10px]">
                          {t.replace('mcp__academy__', '')}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {c.systemPrompt ? (
                    <section>
                      <h4 className="text-muted-foreground">system</h4>
                      <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                        {c.systemPrompt}
                      </pre>
                    </section>
                  ) : null}
                  <section>
                    <h4 className="text-muted-foreground">prompt</h4>
                    <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                      {c.prompt}
                    </pre>
                  </section>
                  {c.result ? (
                    <section>
                      <h4 className="text-muted-foreground">result</h4>
                      <pre className="mt-1 max-h-52 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                        {c.result}
                      </pre>
                    </section>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CallsList />
    </Suspense>
  );
}
