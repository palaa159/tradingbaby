'use client';

import { usePoll } from './usePoll';

interface BuildInfo {
  shortSha: string;
  subject: string;
  committedAt: number;
  dirty: boolean;
  branch: string;
  startedAt: number;
  now: number;
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} วิ`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} นาที`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ชม.`;
  return `${Math.round(h / 24)} วัน`;
}

/**
 * What is running, and since when — the maker's glance-check that the school is
 * still being tended rather than quietly stopped days ago.
 */
export function Footer() {
  const b = usePoll<BuildInfo>('/api/build', 30_000);
  if (!b) return <footer className="h-8 shrink-0 border-t border-border" />;

  const committed = new Date(b.committedAt).toLocaleString('th-TH');
  const started = new Date(b.startedAt).toLocaleString('th-TH');

  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-sidebar px-3 py-1.5 text-[11px] text-muted-foreground">
      <span title={committed} className="font-mono text-primary">
        {b.shortSha}
        {b.dirty ? <span className="text-[var(--warn)]" title="ยังมีไฟล์ที่ไม่ได้ commit">*</span> : null}
      </span>
      <span className="min-w-0 max-w-[55vw] truncate text-foreground md:max-w-none" title={b.subject}>
        {b.subject}
      </span>
      <span className="ml-auto whitespace-nowrap" title={committed}>
        commit {ago(b.now - b.committedAt)}ที่แล้ว
      </span>
      <span className="whitespace-nowrap" title={started}>
        deploy {ago(b.now - b.startedAt)}ที่แล้ว
      </span>
    </footer>
  );
}
