'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '../_components/types';
import { usePoll } from '../_components/usePoll';

interface GradedAnswer {
  questionId: string;
  action: string;
  bestAction: string;
  score: number;
  reasoningScore: number;
  outcomeScore: number;
  comment: string;
}

interface Sitting {
  id: number;
  at: number;
  studentId: string;
  answered: number;
  averageScore: number;
  actionAccuracy: number;
  mostCited: { nodeId: string; times: number }[];
  answers: GradedAnswer[];
}

interface ExamView {
  sittings: Sitting[];
  trend: { at: number; averageScore: number; actionAccuracy: number }[];
}

function grade(score: number): string {
  if (score >= 70) return 'text-[var(--ok)]';
  if (score >= 45) return 'text-[var(--warn)]';
  return 'text-[var(--bad)]';
}

function ExamsView() {
  const student = useSearchParams().get('student');
  const data = usePoll<ExamView>(
    student ? `/api/exams?student=${encodeURIComponent(student)}` : '/api/exams',
  );
  if (!data) return <div className="p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;

  if (!data.sittings.length) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        ยังไม่เคยสอบ — <code>bun run exam -- --questions=3</code>
      </div>
    );
  }

  const first = data.trend[0];
  const last = data.trend[data.trend.length - 1];
  const moved = first && last && data.trend.length > 1 ? last.averageScore - first.averageScore : null;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 md:p-5">
      {moved !== null ? (
        <p className="text-xs text-muted-foreground">
          สอบมาแล้ว {data.trend.length} ครั้ง · คะแนนเฉลี่ยขยับ{' '}
          <strong className={moved >= 0 ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}>
            {moved >= 0 ? '+' : ''}
            {moved.toFixed(1)}
          </strong>{' '}
          จากครั้งแรก
        </p>
      ) : null}

      {data.sittings.map((s) => (
        <Card key={s.id} className="gap-0 py-3">
          <CardHeader className="px-3 pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <span className={grade(s.averageScore)}>เฉลี่ย {s.averageScore}</span>
              <Badge variant="outline" className="text-[10px]">
                ทายถูก {s.actionAccuracy}%
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {s.answered} ข้อ
              </Badge>
              <time className="ml-auto text-[11px] font-normal text-muted-foreground">
                {fmt(s.at)}
              </time>
            </CardTitle>
            {s.mostCited.length ? (
              <p className="text-[11px] text-muted-foreground">
                พึ่งโน้ต {s.mostCited.map((c) => `${c.nodeId} (${c.times})`).join(', ')}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-3">
            {s.answers.map((a, i) => (
              <div key={`${a.questionId}-${i}`} className="border-t border-border pt-2 text-sm first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={a.action === a.bestAction ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}>
                    {a.action === a.bestAction ? '✓' : '✗'} ตอบ {a.action}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    ควรเป็น {a.bestAction} · รวม {a.score} = ผล {a.outcomeScore} · เหตุผล{' '}
                    {a.reasoningScore}
                  </span>
                </div>
                {a.comment ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">กรรมการ: {a.comment}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ExamsView />
    </Suspense>
  );
}
