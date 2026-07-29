'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt, type Trades } from '../_components/types';
import { usePoll } from '../_components/usePoll';

function TradesView() {
  const student = useSearchParams().get('student');
  const data = usePoll<Trades>(
    student ? `/api/trades?student=${encodeURIComponent(student)}` : null,
  );
  if (!data) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-3 md:p-5">
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">ชั้นวางสูตร</h2>
        {data.strategies.length ? (
          <div className="flex flex-col gap-2">
            {data.strategies.map((s) => (
              <Card key={`${s.spec.name}-v${s.version}`} className="gap-0 py-3">
                <CardHeader className="px-3 pb-2">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    {s.spec.name}
                    <Badge variant="outline" className="text-[10px]">
                      v{s.version}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${s.status === 'active' ? 'text-[var(--ok)]' : 'text-muted-foreground'}`}
                    >
                      {s.status === 'active' ? 'ใช้งาน' : 'ปลดแล้ว'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-x-4 gap-y-1 px-3 text-[11px] text-muted-foreground">
                  <span>{s.spec.direction === 'short' ? '▼ ขาลง' : '▲ ขาขึ้น'}</span>
                  <span>กราฟ {s.spec.timeframe}</span>
                  <span>ไม้ {s.spec.sizePct}%</span>
                  {s.fromHypothesisIds.length ? (
                    <span>จากข้อสงสัย {s.fromHypothesisIds.join(', ')}</span>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่มีสูตร</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">การเทรด</h2>
        {data.fills.length ? (
          <div className="flex flex-col gap-2">
            {data.fills.map((f) => (
              <Card key={f.id} className="gap-0 py-3">
                <CardHeader className="px-3 pb-1">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={f.side === 'buy' ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}>
                      {f.side === 'buy' ? 'ซื้อ' : 'ขาย'}
                    </span>
                    <span>{f.symbol}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {f.quantity.toFixed(4)} @ {f.price.toFixed(2)}
                    </span>
                    <time className="ml-auto text-[11px] font-normal text-muted-foreground">
                      {fmt(f.at)}
                    </time>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 text-[11px] text-muted-foreground">
                  <p>{f.reason}</p>
                  {f.strategy ? (
                    <p>
                      สูตร {f.strategy.id} (v{f.strategy.version}, {f.strategy.status})
                    </p>
                  ) : null}
                  {f.hypothesisIds.length ? <p>← ข้อสงสัย: {f.hypothesisIds.join(', ')}</p> : null}
                  {f.guardrailNote ? <p className="text-[var(--warn)]">⚠ {f.guardrailNote}</p> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่มีการเทรด</p>
        )}
      </section>

      {data.blocked.length ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            คำสั่งที่กติกาบ้านห้ามไว้
          </h2>
          <div className="flex flex-col gap-1">
            {data.blocked.map((b, i) => (
              <div
                key={`${b.at}-${b.symbol}-${i}`}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className={b.side === 'buy' ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}>
                  {b.side === 'buy' ? 'ซื้อ' : 'ขาย'}
                </span>{' '}
                {b.symbol}
                <p className="text-[11px] text-[var(--warn)]">{b.reason}</p>
                <time className="text-[11px] text-muted-foreground">{fmt(b.at)}</time>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <TradesView />
    </Suspense>
  );
}
