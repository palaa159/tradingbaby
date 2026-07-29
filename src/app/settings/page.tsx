'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { hhmm } from '../_components/types';

/** The slider hands back either a single value or a range depending on build. */
function at(value: number | readonly number[], index: number, fallback: number): number {
  if (typeof value === 'number') return index === 0 ? value : fallback;
  return value[index] ?? fallback;
}

interface Schedule {
  shortCyclesPerDay: number;
  dailyReviewMinute: number;
  wakingWindow: [number, number];
}

interface SettingsView {
  schedule: Schedule;
  defaults: Schedule;
  updatedAt: number | null;
}

export default function Page() {
  const [view, setView] = useState<SettingsView | null>(null);
  const [draft, setDraft] = useState<Schedule | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const data = (await res.json()) as SettingsView;
      setView(data);
      setDraft(data.schedule);
    })();
  }, []);

  if (!draft || !view) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  const save = async () => {
    setBusy(true);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schedule: draft }),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error('บันทึกไม่สำเร็จ');
      return;
    }
    const data = (await res.json()) as SettingsView;
    setView(data);
    setDraft(data.schedule);
    toast.success('บันทึกแล้ว — มีผลตั้งแต่วันพรุ่งนี้');
  };

  const perDay = draft.shortCyclesPerDay + 1;

  return (
    <div className="h-full overflow-y-auto p-3 md:p-5">
      <Card className="max-w-2xl gap-0 py-4">
        <CardHeader className="px-4 pb-3">
          <CardTitle className="text-sm">จังหวะชีวิตของนักเรียน</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            ตัวจัดตารางกระจายรอบสั้นให้ทั่วช่วงตื่น แล้วปิดท้ายด้วยรอบทบทวน
            การเปลี่ยนตรงนี้มีผลกับวันถัดไป (วันนี้วางแผนไปแล้ว) และไม่ต้อง deploy ใหม่
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6 px-4">
          <div>
            <Label className="text-xs">
              รอบสั้นต่อคนต่อวัน: <strong className="text-foreground">{draft.shortCyclesPerDay}</strong>
            </Label>
            <Slider
              className="mt-3"
              min={0}
              max={24}
              step={1}
              value={[draft.shortCyclesPerDay]}
              onValueChange={(v) => setDraft({ ...draft, shortCyclesPerDay: at(v, 0, draft.shortCyclesPerDay) })}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              รวมรอบทบทวนแล้วเป็น {perDay} รอบ/คน/วัน — คูณจำนวนนักเรียนคือโควตาที่จะใช้จริง
            </p>
          </div>

          <div>
            <Label className="text-xs">
              ช่วงตื่น:{' '}
              <strong className="text-foreground">
                {hhmm(draft.wakingWindow[0])}–{hhmm(draft.wakingWindow[1])}
              </strong>
            </Label>
            <Slider
              className="mt-3"
              min={0}
              max={1440}
              step={15}
              value={[draft.wakingWindow[0], draft.wakingWindow[1]]}
              onValueChange={(v) =>
                setDraft({
                  ...draft,
                  wakingWindow: [
                    at(v, 0, draft.wakingWindow[0]),
                    at(v, 1, draft.wakingWindow[1]),
                  ],
                })
              }
            />
          </div>

          <div>
            <Label className="text-xs">
              รอบทบทวนประจำวัน:{' '}
              <strong className="text-foreground">{hhmm(draft.dailyReviewMinute)}</strong>
            </Label>
            <Slider
              className="mt-3"
              min={0}
              max={1439}
              step={15}
              value={[draft.dailyReviewMinute]}
              onValueChange={(v) => setDraft({ ...draft, dailyReviewMinute: at(v, 0, draft.dailyReviewMinute) })}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button className="min-h-9" onClick={() => void save()} disabled={busy}>
              บันทึก
            </Button>
            <Button variant="secondary" className="min-h-9" onClick={() => setDraft(view.defaults)} disabled={busy}>
              กลับไปค่าเริ่มต้น
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            เวลาทั้งหมดเป็นเวลาไทย (Asia/Bangkok) ค่าที่ใส่เกินขอบเขตจะถูกดึงกลับให้อยู่ในกรอบ
            — โควตาแพ็กเกจมีทั้งเดือน ไม่ใช่แค่เช้าเดียว
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
