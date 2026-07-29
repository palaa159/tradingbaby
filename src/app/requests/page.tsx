'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '../_components/types';
import { usePoll } from '../_components/usePoll';

interface RequestEntry {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  body: string;
  status: string;
  at: number;
}

interface RequestBox {
  open: RequestEntry[];
  answered: RequestEntry[];
}

export default function Page() {
  const box = usePoll<RequestBox>('/api/requests');
  const [busy, setBusy] = useState(false);

  const answer = async (r: RequestEntry) => {
    setBusy(true);
    const res = await fetch('/api/requests', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: r.id, studentId: r.studentId }),
    });
    setBusy(false);
    toast[res.ok ? 'success' : 'error'](res.ok ? 'ปิดคำร้องแล้ว' : 'ปิดคำร้องไม่สำเร็จ');
  };

  if (!box) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 md:p-5">
      {box.open.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          ยังไม่มีคำร้องค้าง — นักเรียนเขียนคำร้องเมื่อเจอเครื่องมือที่พัง หรืออยากได้เครื่องมือใหม่
        </p>
      ) : (
        box.open.map((r) => (
          <Card key={r.id} className="gap-0 border-l-2 border-l-[#ff7b72] py-3">
            <CardHeader className="px-3 pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                {r.title}
                <Badge variant="outline" className="text-[10px]">
                  {r.studentName}
                </Badge>
                <time className="ml-auto text-[11px] font-normal text-muted-foreground">
                  {fmt(r.at)}
                </time>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-3">
              <p className="whitespace-pre-wrap text-sm">{r.body}</p>
              <Button
                variant="secondary"
                className="min-h-9 self-start"
                disabled={busy}
                onClick={() => void answer(r)}
              >
                ทำแล้ว / ปิดคำร้อง
              </Button>
            </CardContent>
          </Card>
        ))
      )}

      {box.answered.length ? (
        <>
          <h2 className="mt-4 text-sm font-medium text-muted-foreground">ปิดไปแล้ว</h2>
          {box.answered.map((r) => (
            <div key={r.id} className="rounded-md border border-border px-3 py-2 text-sm opacity-70">
              <span className="text-[var(--ok)]">✓</span> {r.title}
              <span className="ml-2 text-[11px] text-muted-foreground">
                {r.studentName} · {fmt(r.at)}
              </span>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
