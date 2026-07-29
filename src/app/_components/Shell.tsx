'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { Footer } from './Footer.tsx';
import type { StudentCard } from './types.ts';
import { usePoll } from './usePoll.ts';

const VIEWS: { href: string; label: string }[] = [
  { href: '/brain', label: 'สมอง' },
  { href: '/trades', label: 'เทรดและสูตร' },
  { href: '/library', label: 'ห้องสมุดกลาง' },
  { href: '/diary', label: 'ไดอารี่' },
  { href: '/schedule', label: 'ตารางเรียน' },
  { href: '/principal', label: 'ครูใหญ่' },
];

/**
 * The frame every view shares: roster on the left, routes across the top.
 *
 * The selected student lives in the query string rather than component state,
 * which is the whole reason for the move to routing — a view of one student's
 * brain at one moment is now a URL the maker can keep.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const students = usePoll<StudentCard[]>('/api/students');
  const current = params.get('student');

  // Land on someone rather than an empty frame, without stealing a choice the
  // maker already made.
  useEffect(() => {
    if (current || !students?.length) return;
    const first = students[0];
    if (first) window.history.replaceState(null, '', `${pathname}?student=${encodeURIComponent(first.id)}`);
  }, [current, students, pathname]);

  const withStudent = (href: string) =>
    current ? `${href}?student=${encodeURIComponent(current)}` : href;

  return (
    <>
      <aside>
        <h1>🎓 Alpha Academy</h1>
        <div className="motto">Learn · Build · Measure · Repeat</div>
        <div>
          {students === null ? null : students.length === 0 ? (
            <div className="empty">ยังไม่มีนักเรียน — รัน bun run cycle ก่อน</div>
          ) : (
            students.map((s) => (
              <Link key={s.id} href={`${pathname}?student=${encodeURIComponent(s.id)}`}>
                <div className={`card ${s.id === current ? 'on' : ''}`}>
                  <h2>
                    {s.name} <span className={`pill ${s.hunger}`}>{s.hunger}</span>
                  </h2>
                  <div className="traits">{s.traits}</div>
                  <div className="bar">
                    <i style={{ width: `${Math.min(100, (s.energy / s.maxEnergy) * 100)}%` }} />
                  </div>
                  <div className="stats">
                    <span>⚡ {s.energy}</span>
                    <span>🧠 {s.nodeCount}</span>
                    <span>🔗 {s.edgeCount}</span>
                  </div>
                  {s.alpha ? (
                    <div
                      className={`alpha ${s.alpha.alphaPct > 0.5 ? 'win' : s.alpha.alphaPct < -0.5 ? 'lose' : ''}`}
                    >
                      α {s.alpha.alphaPct > 0 ? '+' : ''}
                      {s.alpha.alphaPct.toFixed(2)}%
                      <em>
                        เธอ {s.alpha.studentReturnPct.toFixed(1)}% · ไม้บรรทัด{' '}
                        {s.alpha.benchmarkReturnPct.toFixed(1)}%
                      </em>
                    </div>
                  ) : null}
                </div>
              </Link>
            ))
          )}
        </div>
      </aside>

      <main>
        <nav>
          {VIEWS.map((v) => (
            <Link key={v.href} href={withStudent(v.href)} className={pathname === v.href ? 'on' : ''}>
              {v.label}
            </Link>
          ))}
        </nav>
        {children}
        <Footer />
      </main>
    </>
  );
}
