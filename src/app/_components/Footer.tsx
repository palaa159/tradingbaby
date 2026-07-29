'use client';

import { usePoll } from './usePoll.ts';

interface BuildInfo {
  shortSha: string;
  subject: string;
  committedAt: number;
  dirty: boolean;
  branch: string;
  startedAt: number;
  now: number;
}

/** "3 ชม.ที่แล้ว" — close enough is the point; exact time is in the tooltip. */
function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} วินาทีที่แล้ว`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.round(h / 24)} วันที่แล้ว`;
}

/**
 * What is running and since when. The maker's glance-check that the school is
 * still being tended rather than quietly stopped days ago.
 */
export function Footer() {
  const b = usePoll<BuildInfo>('/api/build', 30_000);
  if (!b) return <footer className="build" />;

  return (
    <footer className="build">
      <span title={new Date(b.committedAt).toLocaleString('th-TH')}>
        <code>{b.shortSha}</code>
        {b.dirty ? <span className="dirty" title="มีไฟล์ที่ยังไม่ commit">*</span> : null}{' '}
        <span className="subject">{b.subject}</span>
      </span>
      <span className="when" title={new Date(b.committedAt).toLocaleString('th-TH')}>
        commit {ago(b.now - b.committedAt)}
      </span>
      <span className="when" title={new Date(b.startedAt).toLocaleString('th-TH')}>
        deploy {ago(b.now - b.startedAt)}
      </span>
      <span className="when">{b.branch}</span>
    </footer>
  );
}
