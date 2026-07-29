'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import type { DiaryEntry } from '../_components/types.ts';
import { fmt } from '../_components/types.ts';
import { usePoll } from '../_components/usePoll.ts';

function DiaryView() {
  const student = useSearchParams().get('student');
  const entries = usePoll<DiaryEntry[]>(
    student ? `/api/diary?student=${encodeURIComponent(student)}` : null,
  );
  if (!entries) return <section className="view diary" />;

  return (
    <section className="view diary">
      {entries.length ? (
        entries.map((e, i) => (
          <div className="entry" key={`${e.at}-${i}`}>
            <h4>{e.title}</h4>
            <time>{fmt(e.at)}</time>
            <p>{e.body}</p>
          </div>
        ))
      ) : (
        <div className="empty">ยังไม่มีไดอารี่</div>
      )}
    </section>
  );
}

export default function Page() {
  return (
    <Suspense>
      <DiaryView />
    </Suspense>
  );
}
