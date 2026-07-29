'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fmt } from '../_components/types';
import { usePoll } from '../_components/usePoll';

interface RosterStudent {
  id: string;
  name: string;
  energy: number;
  enrolledAt: number;
  suspended: boolean;
  expelled: boolean;
  traits: string;
}

interface RosterView {
  students: RosterStudent[];
  startingAllowance: number;
}

async function send(method: string, body: unknown): Promise<boolean> {
  const res = await fetch('/api/students', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return true;
  const err = (await res.json().catch(() => ({}))) as { error?: string };
  toast.error(err.error ?? 'ทำไม่สำเร็จ');
  return false;
}

export default function Page() {
  const data = usePoll<RosterView>('/api/students?roster=1');
  const [name, setName] = useState('');
  const [seed, setSeed] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    if (await send('PATCH', { id, action, ...extra })) toast.success('เรียบร้อย');
    setBusy(false);
  };

  const enroll = async () => {
    if (!name.trim() || !seed.trim()) {
      toast.error('ต้องมีทั้งชื่อและเมล็ดนิสัย');
      return;
    }
    setBusy(true);
    if (await send('POST', { name, seed })) {
      toast.success(`รับ ${name} เข้าเรียนแล้ว`);
      setName('');
      setSeed('');
    }
    setBusy(false);
  };

  if (!data) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3 md:p-5">
      <Card className="gap-0 py-3">
        <CardHeader className="px-3 pb-2">
          <CardTitle className="text-sm">รับนักเรียนใหม่</CardTitle>
          <p className="text-[11px] text-muted-foreground">
            เมล็ดนิสัยคือตัวตน — นิสัยถูกคำนวณจากมัน และใช้เมล็ดเดิมซ้ำจะได้คนเดิม ไม่ใช่คนใหม่
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-3 md:flex-row md:items-end">
          <div className="flex-1">
            <Label htmlFor="name" className="text-[11px]">ชื่อ</Label>
            <Input id="name" className="min-h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น มะลิ" />
          </div>
          <div className="flex-1">
            <Label htmlFor="seed" className="text-[11px]">เมล็ดนิสัย</Label>
            <Input id="seed" className="min-h-9" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="เช่น mali-2026" />
          </div>
          <Button onClick={() => void enroll()} disabled={busy} className="min-h-9 md:w-auto">
            รับเข้าเรียน
          </Button>
        </CardContent>
      </Card>

      {data.students.map((s) => (
        <Card key={s.id} className="gap-0 py-3">
          <CardHeader className="px-3 pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              {s.name}
              {s.expelled ? (
                <Badge variant="outline" className="text-[10px] text-[var(--bad)]">ออกจากโรงเรียน</Badge>
              ) : s.suspended ? (
                <Badge variant="outline" className="text-[10px] text-[var(--warn)]">พักการเรียน</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-[var(--ok)]">กำลังเรียน</Badge>
              )}
              <span className="ml-auto font-mono text-[11px] font-normal text-muted-foreground">
                ⚡ {s.energy}
              </span>
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              {s.traits} · เข้าเรียน {fmt(s.enrolledAt)} · <code>{s.id}</code>
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 px-3">
            <Button
              variant="secondary"
              className="min-h-9 flex-1 md:flex-none"
              disabled={busy}
              onClick={() => {
                const next = prompt('ชื่อใหม่', s.name);
                if (next && next.trim()) void act(s.id, 'rename', { name: next.trim() });
              }}
            >
              เปลี่ยนชื่อ
            </Button>
            {s.suspended ? (
              <Button variant="secondary" className="min-h-9 flex-1 md:flex-none" disabled={busy} onClick={() => void act(s.id, 'revive')}>
                ให้กลับมาเรียน
              </Button>
            ) : (
              <Button variant="secondary" className="min-h-9 flex-1 md:flex-none" disabled={busy} onClick={() => void act(s.id, 'suspend')}>
                พักการเรียน
              </Button>
            )}
            {s.expelled ? (
              <Button variant="secondary" className="min-h-9 flex-1 md:flex-none" disabled={busy} onClick={() => void act(s.id, 'readmit')}>
                รับกลับเข้าเรียน
              </Button>
            ) : (
              <Button
                variant="destructive"
                className="min-h-9 flex-1 md:flex-none"
                disabled={busy}
                onClick={() => {
                  if (confirm(`ให้ ${s.name} ออกจากโรงเรียน? สมองและไดอารี่ยังเก็บไว้ทั้งหมด`)) {
                    void act(s.id, 'expel');
                  }
                }}
              >
                ให้ออก
              </Button>
            )}
          </CardContent>
        </Card>
      ))}

      <p className="text-[11px] text-muted-foreground">
        คนสร้างดูสมองได้ แต่แก้ความรู้ของนักเรียนไม่ได้ (ข้อ 8) — และ &ldquo;ให้ออก&rdquo;
        เป็นแค่การติดธง ไม่ได้ลบข้อมูล สมุดเหตุการณ์เก่าต้องอ่านได้ตลอดไป (สัญญาข้อ 9.5)
      </p>
    </div>
  );
}
