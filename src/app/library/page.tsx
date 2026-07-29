'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LibraryData } from '../_components/types';
import { usePoll } from '../_components/usePoll';

const LABEL: Record<string, [string, string]> = {
  endorsed: ['สถาบันรับรอง', 'text-[var(--ok)]'],
  rejected: ['สถาบันตีตก', 'text-muted-foreground'],
  disputed: ['ยังเถียงกันอยู่', 'text-[var(--warn)]'],
  insufficient: ['หลักฐานยังไม่พอ', 'text-muted-foreground'],
};

export default function Page() {
  const data = usePoll<LibraryData>('/api/library');
  if (!data) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;
  const s = data.summary;

  return (
    <div className="h-full overflow-y-auto p-3 md:p-5">
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-[var(--ok)]">รับรองแล้ว {s.endorsed}</span>
        <span className="text-[var(--warn)]">กำลังเถียง {s.disputed}</span>
        <span className="text-muted-foreground">ตีตก {s.rejected}</span>
        <span className="text-muted-foreground">รอหลักฐาน {s.pending}</span>
        <span className="text-muted-foreground">ทั้งชั้น {data.classSize} คน</span>
      </div>

      {data.entries.length ? (
        <div className="flex flex-col gap-2">
          {data.entries.map((e, i) => {
            const [label, color] = LABEL[e.consensus] ?? [e.consensus, 'text-muted-foreground'];
            return (
              <Card key={`${e.statement}-${i}`} className="gap-0 py-3">
                <CardHeader className="px-3 pb-2">
                  <CardTitle className="text-sm font-normal">{e.statement}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2 px-3">
                  <Badge variant="outline" className={`text-[10px] ${color}`}>
                    {label}
                  </Badge>
                  {e.verdicts.map((v, j) => (
                    <span key={`${v.studentName}-${j}`} className="text-[11px] text-muted-foreground">
                      {v.studentName}{' '}
                      <span className={v.status === 'adopted' ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}>
                        {v.status === 'adopted' ? 'รับ' : 'ตีตก'}
                      </span>
                    </span>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          ยังไม่มีข้ออ้างที่ผ่านการทดสอบ — นักเรียนต้องพิสูจน์อะไรสักอย่างก่อน
        </p>
      )}
    </div>
  );
}
