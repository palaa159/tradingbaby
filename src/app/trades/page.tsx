'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import type { Trades } from '../_components/types.ts';
import { fmt } from '../_components/types.ts';
import { usePoll } from '../_components/usePoll.ts';

function TradesView() {
  const student = useSearchParams().get('student');
  const data = usePoll<Trades>(
    student ? `/api/trades?student=${encodeURIComponent(student)}` : null,
  );
  if (!data) return <section className="view trades" />;

  return (
    <section className="view trades">
      <section>
        <h3>ชั้นวางสูตร</h3>
        {data.strategies.length ? (
          <table>
            <tbody>
              <tr>
                <th>สูตร</th><th>ฝั่ง</th><th>กราฟ</th><th>เวอร์ชัน</th>
                <th>สถานะ</th><th>ไม้</th><th>จากข้อสงสัย</th>
              </tr>
              {data.strategies.map((s) => (
                <tr key={`${s.spec.name}-v${s.version}`}>
                  <td>{s.spec.name}</td>
                  <td>{s.spec.direction === 'short' ? '▼ ขาลง' : '▲ ขาขึ้น'}</td>
                  <td>{s.spec.timeframe}</td>
                  <td>v{s.version}</td>
                  <td>{s.status === 'active' ? 'ใช้งาน' : 'ปลดแล้ว'}</td>
                  <td>{s.spec.sizePct}%</td>
                  <td className="why">{s.fromHypothesisIds.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">ยังไม่มีสูตร</div>
        )}
      </section>

      <section>
        <h3>การเทรด</h3>
        {data.fills.length ? (
          <table>
            <tbody>
              <tr>
                <th>เวลา</th><th>ทำอะไร</th><th>เหรียญ</th><th>จำนวน</th><th>ราคา</th>
                <th>เพราะอะไร · จากความรู้ไหน</th>
              </tr>
              {data.fills.map((f) => (
                <tr key={f.id} className={f.side}>
                  <td>{fmt(f.at)}</td>
                  <td>{f.side === 'buy' ? 'ซื้อ' : 'ขาย'}</td>
                  <td>{f.symbol}</td>
                  <td>{f.quantity.toFixed(4)}</td>
                  <td>{f.price.toFixed(2)}</td>
                  <td>
                    <div className="why">{f.reason}</div>
                    {f.strategy ? (
                      <div className="why">
                        สูตร {f.strategy.id} (v{f.strategy.version}, {f.strategy.status})
                      </div>
                    ) : null}
                    {f.hypothesisIds.length ? (
                      <div className="why">← ข้อสงสัย: {f.hypothesisIds.join(', ')}</div>
                    ) : null}
                    {f.guardrailNote ? <div className="note">⚠ {f.guardrailNote}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">ยังไม่มีการเทรด</div>
        )}
      </section>

      {data.blocked.length ? (
        <section>
          <h3>คำสั่งที่กติกาบ้านห้ามไว้</h3>
          <table>
            <tbody>
              <tr><th>เวลา</th><th>ทำอะไร</th><th>เหรียญ</th><th>กติกาที่ห้าม</th></tr>
              {data.blocked.map((b, i) => (
                <tr key={`${b.at}-${b.symbol}-${i}`}>
                  <td>{fmt(b.at)}</td>
                  <td>{b.side === 'buy' ? 'ซื้อ' : 'ขาย'}</td>
                  <td>{b.symbol}</td>
                  <td className="note">{b.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </section>
  );
}

export default function Page() {
  return (
    <Suspense>
      <TradesView />
    </Suspense>
  );
}
