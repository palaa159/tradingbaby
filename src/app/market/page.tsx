'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '../_components/types';
import { usePoll } from '../_components/usePoll';

interface Benchmark {
  startedAt: number;
  startingCash: number;
  holdings: { symbol: string; quantity: number }[];
}

interface MarketView {
  prices: Record<string, number>;
  benchmarks: { studentId: string; studentName: string; benchmark: Benchmark | null }[];
}

interface Evaluation {
  id: number;
  at: number;
  strategyId: string;
  version: number;
  symbol: string;
  orders: { side: string; reason: string }[];
  readings: Record<string, number>;
  bars: number;
  reproduces: boolean;
}

function MarketView() {
  const student = useSearchParams().get('student');
  const market = usePoll<MarketView>('/api/market');
  const evals = usePoll<{ evaluations: Evaluation[] }>(
    student ? `/api/evaluations?student=${encodeURIComponent(student)}` : '/api/evaluations',
  );
  if (!market) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  const prices = Object.entries(market.prices);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3 md:p-5">
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          ราคาที่เครื่องรันสูตรจดไว้ล่าสุด
        </h2>
        {prices.length ? (
          <div className="flex flex-wrap gap-2">
            {prices.map(([symbol, price]) => (
              <div key={symbol} className="rounded-md border border-border px-3 py-2 text-sm">
                <span className="text-muted-foreground">{symbol}</span>{' '}
                <span className="font-mono tabular-nums">{price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่มีราคาที่จดไว้</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          ไม้บรรทัด (นอนถือเฉยๆ ตั้งแต่วันแรกที่เห็นตลาด)
        </h2>
        <div className="flex flex-col gap-2">
          {market.benchmarks.map((b) => (
            <Card key={b.studentId} className="gap-0 py-3">
              <CardHeader className="px-3 pb-1">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  {b.studentName}
                  {b.benchmark ? (
                    <time className="ml-auto text-[11px] font-normal text-muted-foreground">
                      เปิด {fmt(b.benchmark.startedAt)}
                    </time>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 text-[11px] text-muted-foreground">
                {b.benchmark ? (
                  <>
                    <p>ทุนตั้งต้น {b.benchmark.startingCash}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {b.benchmark.holdings.map((h) => (
                        <Badge key={h.symbol} variant="outline" className="text-[10px]">
                          {h.symbol} {h.quantity.toFixed(6)}
                        </Badge>
                      ))}
                    </div>
                  </>
                ) : (
                  <p>ยังไม่ได้เปิดไม้บรรทัด — เปิดอัตโนมัติรอบเทรดแรก</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          บันทึกการประเมินของสูตร (ข้อ 6.2 — รันซ้ำต้องได้ผลเดิม)
        </h2>
        {evals?.evaluations.length ? (
          <div className="flex flex-col gap-1">
            {evals.evaluations.map((e) => (
              <div key={e.id} className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px]">{e.strategyId}</span>
                  <Badge variant="outline" className="text-[10px]">
                    v{e.version}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${e.reproduces ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}`}
                  >
                    {e.reproduces ? 'รันซ้ำตรง' : 'รันซ้ำไม่ตรง'}
                  </Badge>
                  <time className="ml-auto text-[11px] text-muted-foreground">{fmt(e.at)}</time>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {e.symbol} · {e.bars} แท่ง ·{' '}
                  {e.orders.length ? e.orders.map((o) => o.reason).join(' | ') : 'ไม่สั่งอะไร'}
                </p>
                {Object.keys(e.readings).length ? (
                  <p className="text-[11px] text-muted-foreground">
                    ค่าที่อ่านได้:{' '}
                    {Object.entries(e.readings)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีการประเมิน — เกิดขึ้นเมื่อมีสูตรที่เปิดใช้แล้วเครื่องรันสูตรเดิน
          </p>
        )}
      </section>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <MarketView />
    </Suspense>
  );
}
