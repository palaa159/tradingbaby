/**
 * Run an exam sitting (Phase 2 P7):
 *
 *   bun run exam -- --questions=3 --db=academy.db
 *
 * Same paper for the whole class, cut from real recorded price history, graded
 * by a judge that never sees anyone's brain. Results land as a report card.
 */

import { buildReportCard, cutQuestion } from '../core/exam/exam.ts';
import type { ExamQuestion, GradedAnswer } from '../core/exam/types.ts';
import type { Candle } from '../core/strategy/types.ts';
import type { Student } from '../core/types.ts';
import { DEFAULT_ACADEMY } from './academyConfig.ts';
import { openAcademyDb, SqliteEventStore, StudentStore } from './db/sqliteStore.ts';
import type { GraphOpsContext } from './engine/graphOps.ts';
import { gradeAnswer, sitExam } from './engine/examiner.ts';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const config = DEFAULT_ACADEMY;
const db = openAcademyDb(arg('db') ?? 'academy.db');
const store = new SqliteEventStore(db);
const students = new StudentStore(db);
const wanted = Number(arg('questions') ?? 2);

// Questions come from a deterministic synthetic series unless a candle file is
// supplied — real recorded history is wired in once the market feed persists it.
const seriesPath = arg('candles');
let candles: Candle[];
if (seriesPath) {
  candles = JSON.parse(await Bun.file(seriesPath).text()) as Candle[];
} else {
  candles = Array.from({ length: 400 }, (_, i) => {
    const close = 100 + Math.sin(i / 11) * 15 + Math.sin(i / 3.7) * 4 + i * 0.03;
    return { openTime: i * 3.6e6, open: close, high: close * 1.01, low: close * 0.99, close, volume: 100 };
  });
}

const paper: ExamQuestion[] = [];
for (let n = 0; n < wanted; n++) {
  // Spread decision points evenly through the usable middle of the series.
  const index = Math.floor(80 + ((candles.length - 160) * (n + 1)) / (wanted + 1));
  const question = cutQuestion(config.universe[0] ?? 'BTC/USDT', candles, index, Date.now());
  if (question) paper.push(question);
}

const roster: Student[] = config.students.map((e) =>
  students.enroll(e.seed, e.name, config.metabolism.startingAllowance, Date.now()),
);

console.log(`📝 สอบ ${paper.length} ข้อ · นักเรียน ${roster.length} คน · ข้อสอบชุดเดียวกันทั้งชั้น\n`);

for (const student of roster) {
  const ctx: GraphOpsContext = { studentId: student.id, store, now: Date.now };
  const graded: GradedAnswer[] = [];
  const citations: string[][] = [];

  for (const question of paper) {
    const answer = await sitExam(student, ctx, question, config.models.short);
    const result = await gradeAnswer(question, answer, config.models.judge);
    graded.push(result);
    citations.push(answer.citedNodeIds);

    const mark = result.action === result.bestAction ? '✓' : '✗';
    console.log(
      `  ${mark} ${student.name} ตอบ ${result.action} (ควรเป็น ${result.bestAction}) — ` +
        `รวม ${result.score} = ผล ${result.outcomeScore} · เหตุผล ${result.reasoningScore}`,
    );
    if (result.comment) console.log(`     กรรมการ: ${result.comment}`);
    if (answer.citedNodeIds.length) console.log(`     อ้างความรู้: ${answer.citedNodeIds.length} โน้ต`);
  }

  const card = buildReportCard(student.id, graded, citations);
  console.log(
    `  📔 สมุดพก${student.name}: เฉลี่ย ${card.averageScore} · ทายถูก ${card.actionAccuracy}%` +
      (card.mostCited[0] ? ` · พึ่งโน้ต ${card.mostCited[0].nodeId} บ่อยสุด` : ''),
  );
  console.log();
}

db.close();
