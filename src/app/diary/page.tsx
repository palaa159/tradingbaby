'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt, type DiaryEntry } from '../_components/types';
import { usePoll } from '../_components/usePoll';

function DiaryView() {
  const student = useSearchParams().get('student');
  const entries = usePoll<DiaryEntry[]>(
    student ? `/api/diary?student=${encodeURIComponent(student)}` : null,
  );
  if (!entries) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;
  if (!entries.length) return <p className="p-4 text-sm text-muted-foreground">ยังไม่มีไดอารี่</p>;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 md:p-5">
      {entries.map((e, i) => (
        <Card key={`${e.at}-${i}`} className="max-w-3xl gap-0 border-l-2 border-l-[#a371f7] py-3">
          <CardHeader className="px-3 pb-1">
            <CardTitle className="text-sm">{e.title}</CardTitle>
            <time className="text-[11px] text-muted-foreground">{fmt(e.at)}</time>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap px-3 text-sm">{e.body}</CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <DiaryView />
    </Suspense>
  );
}
