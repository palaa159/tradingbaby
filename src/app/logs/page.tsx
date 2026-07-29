'use client';

import { useState } from 'react';

import { usePoll } from '../_components/usePoll';

interface LogTail {
  name: string;
  lines: string[];
  bytes: number;
  truncated: boolean;
}

const LABEL: Record<string, string> = {
  daemon: 'ระฆัง (daemon)',
  trader: 'เครื่องรันสูตร (trader)',
  principal: 'ครูใหญ่ (principal)',
  dashboard: 'หน้าจอ (dashboard)',
};

function tone(line: string): string {
  if (/error|failed|ล้ม|พัง|Traceback/i.test(line)) return 'text-[var(--bad)]';
  if (/warn|ข้าม|missed|backing off/i.test(line)) return 'text-[var(--warn)]';
  if (/^\[|✅|เรียบร้อย|รันแล้ว/.test(line)) return 'text-foreground';
  return 'text-muted-foreground';
}

export default function Page() {
  const [only, setOnly] = useState<string | null>(null);
  const data = usePoll<{ logs: LogTail[] }>(
    only ? `/api/logs?name=${encodeURIComponent(only)}` : '/api/logs',
    5000,
  );
  if (!data) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => setOnly(null)}
          className={`min-h-9 shrink-0 rounded-full border px-3 text-xs ${only === null ? 'border-primary' : 'border-border text-muted-foreground'}`}
        >
          ทั้งหมด
        </button>
        {Object.keys(LABEL).map((n) => (
          <button
            key={n}
            onClick={() => setOnly(n === only ? null : n)}
            className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs ${only === n ? 'border-primary' : 'border-border text-muted-foreground'}`}
          >
            {LABEL[n]}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
        {data.logs.map((log) => (
          <section key={log.name}>
            <h2 className="mb-1 flex flex-wrap items-baseline gap-2 text-sm font-medium">
              {LABEL[log.name] ?? log.name}
              <span className="text-[11px] font-normal text-muted-foreground">
                {(log.bytes / 1024).toFixed(1)} KB
                {log.truncated ? ' · แสดงเฉพาะท้ายไฟล์' : ''}
              </span>
            </h2>
            {log.lines.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">(ว่าง)</p>
            ) : (
              // Long log lines scroll inside their own box; the page never does.
              <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted p-2 text-[11px] leading-relaxed">
                {log.lines.map((l, i) => (
                  <div key={i} className={tone(l)}>
                    {l}
                  </div>
                ))}
              </pre>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
