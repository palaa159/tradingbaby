'use client';

import { MenuIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Footer } from './Footer';
import type { StudentCard } from './types';
import { usePoll } from './usePoll';

const VIEWS = [
  { href: '/brain', label: 'สมอง' },
  { href: '/trades', label: 'เทรด' },
  { href: '/library', label: 'ห้องสมุด' },
  { href: '/diary', label: 'ไดอารี่' },
  { href: '/schedule', label: 'ตารางเรียน' },
  { href: '/principal', label: 'ครูใหญ่' },
  { href: '/calls', label: 'บันทึก AI' },
  { href: '/roster', label: 'นักเรียน' },
  { href: '/settings', label: 'ตั้งค่า' },
] as const;

const HUNGER: Record<string, string> = {
  well_fed: 'text-[var(--ok)]',
  hungry: 'text-[var(--warn)]',
  starving: 'text-[var(--bad)]',
  suspended: 'text-[var(--bad)]',
};

function Roster({ current, onPick }: { current: string | null; onPick?: () => void }) {
  const pick = onPick ?? (() => {});
  const pathname = usePathname();
  const students = usePoll<StudentCard[]>('/api/students');

  if (students === null) return null;
  if (students.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">ยังไม่มีนักเรียน</p>;
  }

  return (
    <nav className="flex flex-col gap-2 p-3">
      {students.map((s) => (
        <Link
          key={s.id}
          href={`${pathname}?student=${encodeURIComponent(s.id)}`}
          onClick={pick}
          className={`rounded-lg border p-3 transition-colors ${
            s.id === current ? 'border-primary bg-accent' : 'border-border hover:border-muted-foreground'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{s.name}</span>
            <Badge variant="outline" className={`text-[10px] ${HUNGER[s.hunger] ?? ''}`}>
              {s.hunger}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{s.traits}</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
            <i
              className="block h-full bg-[var(--ok)]"
              style={{ width: `${Math.min(100, (s.energy / s.maxEnergy) * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex gap-3 text-[11px] text-muted-foreground">
            <span>⚡ {s.energy}</span>
            <span>🧠 {s.nodeCount}</span>
            <span>🔗 {s.edgeCount}</span>
          </div>
          {s.alpha ? (
            <p
              className={`mt-2 border-t border-border pt-2 text-xs font-semibold ${
                s.alpha.alphaPct > 0.5
                  ? 'text-[var(--ok)]'
                  : s.alpha.alphaPct < -0.5
                    ? 'text-[var(--bad)]'
                    : 'text-muted-foreground'
              }`}
            >
              α {s.alpha.alphaPct > 0 ? '+' : ''}
              {s.alpha.alphaPct.toFixed(2)}%
            </p>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The frame every view shares.
 *
 * Mobile is the default rather than the fallback: the roster lives behind a
 * sheet, the view tabs scroll sideways, and nothing assumes a pointer. The
 * two-column layout only appears once there is room for it.
 *
 * The selected student stays in the query string, which is what makes a view of
 * one brain at one moment a link the maker can keep.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const students = usePoll<StudentCard[]>('/api/students');
  const current = params.get('student');
  const [open, setOpen] = useState(false);

  // Land on someone rather than an empty frame, without overriding a choice
  // the maker already made.
  useEffect(() => {
    if (current || !students?.length) return;
    const first = students[0];
    if (first) {
      window.history.replaceState(null, '', `${pathname}?student=${encodeURIComponent(first.id)}`);
    }
  }, [current, students, pathname]);

  const withStudent = (href: string) =>
    current ? `${href}?student=${encodeURIComponent(current)}` : href;
  const selected = students?.find((s) => s.id === current);

  return (
    <div className="flex h-dvh flex-col md:grid md:grid-cols-[290px_1fr]">
      <aside className="hidden overflow-y-auto border-r border-border bg-sidebar md:block">
        <div className="p-4 pb-0">
          <h1 className="text-base font-semibold">🎓 Alpha Academy</h1>
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            Learn · Build · Measure · Repeat
          </p>
        </div>
        <Roster current={current} />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              aria-label="เลือกนักเรียน"
              className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent"
            >
              <MenuIcon className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto p-0">
              <SheetHeader>
                <SheetTitle>🎓 Alpha Academy</SheetTitle>
              </SheetHeader>
              <Roster current={current} onPick={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="truncate font-medium">{selected?.name ?? 'Alpha Academy'}</span>
          {selected ? (
            <Badge variant="outline" className={`ml-auto text-[10px] ${HUNGER[selected.hunger] ?? ''}`}>
              ⚡ {selected.energy}
            </Badge>
          ) : null}
        </header>

        {/* Tabs scroll sideways on a phone rather than wrapping into a wall. */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {VIEWS.map((v) => (
            <Link
              key={v.href}
              href={withStudent(v.href)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                pathname === v.href
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {v.label}
            </Link>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
