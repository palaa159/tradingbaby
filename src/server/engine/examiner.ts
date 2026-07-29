/**
 * Sitting the exam and grading it (spec §7, §14.2).
 *
 * Two separate sessions on purpose. The student answers with its own brain in
 * front of it. The judge sees the question, the answer, and what the market
 * actually did — but never the student's notes, its name, or its personality,
 * so it grades the argument rather than the arguer.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

import { combineScores, scoreAction, bestAction } from '../../core/exam/exam.ts';
import type {
  Action,
  ExamAnswer,
  ExamQuestion,
  Exposure,
  GradedAnswer,
} from '../../core/exam/types.ts';
import { describePersonality } from '../../core/personality.ts';
import type { Student } from '../../core/types.ts';
import { effortFor } from './effort.ts';
import { searchNodes, type GraphOpsContext } from './graphOps.ts';

async function ask(prompt: string, system: string, model: string): Promise<string> {
  let text = '';
  const run = query({
    prompt,
    options: {
      systemPrompt: system,
      model,
      ...effortFor(model),
      maxTurns: 1,
      permissionMode: 'default',
      allowedTools: [],
    },
  });
  for await (const message of run) {
    if (message.type === 'result' && message.subtype === 'success') text = message.result;
  }
  return text;
}

function extractJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asAction(value: unknown): Action {
  return value === 'buy' || value === 'sell' ? value : 'wait';
}

/** A compact view of the price action — the student reads numbers, not pictures. */
function describeChart(question: ExamQuestion): string {
  const closes = question.context.map((c) => c.close);
  const recent = closes.slice(-24);
  const first = closes[0] ?? 0;
  const last = closes[closes.length - 1] ?? 0;
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  return [
    `เหรียญ: ${question.symbol}`,
    `ราคาปิดล่าสุด: ${last.toFixed(2)}`,
    `ช่วงที่เห็น: ${question.context.length} แท่ง — เริ่ม ${first.toFixed(2)} สูงสุด ${high.toFixed(2)} ต่ำสุด ${low.toFixed(2)}`,
    `24 แท่งหลังสุด: ${recent.map((c) => c.toFixed(1)).join(', ')}`,
    `ปริมาณซื้อขายเฉลี่ย: ${(question.context.reduce((s, c) => s + c.volume, 0) / question.context.length).toFixed(0)}`,
    describePosition(question.holding),
  ].join('\n');
}

/**
 * Where the student stands, and what each answer would do from there. The same
 * word means three different bets depending on the starting position, so the
 * question is not answerable without this.
 */
function describePosition(holding: Exposure): string {
  if (holding === 'long') {
    return (
      'ตอนนี้เธอ**ถือเหรียญนี้อยู่ (เดิมพันว่าจะขึ้น)** — ' +
      '"wait" = ถือต่อ · "sell" = ขายออกกลับมาถือเงินสด · "buy" = ซื้อเพิ่ม'
    );
  }
  if (holding === 'short') {
    return (
      'ตอนนี้เธอ**เปิดฝั่งลงอยู่ (เดิมพันว่าจะลง)** ราคายิ่งลงเธอยิ่งได้ — ' +
      '"wait" = ถือฝั่งลงต่อ · "buy" = ปิดฝั่งลงกลับมาถือเงินสด'
    );
  }
  return (
    'ตอนนี้เธอ**ถือเงินสด ไม่ได้เดิมพันฝั่งไหน** — ' +
    '"wait" = อยู่เฉยๆ ต่อ · "buy" = เข้าซื้อเดิมพันว่าจะขึ้น · "sell" = เปิดฝั่งลงเดิมพันว่าจะลง'
  );
}

export async function sitExam(
  student: Student,
  ctx: GraphOpsContext,
  question: ExamQuestion,
  model: string,
): Promise<ExamAnswer> {
  const notes = searchNodes(ctx, { limit: 60 })
    .filter((n) => ['concept', 'lesson', 'hypothesis'].includes(n.kind))
    .filter((n) => n.status !== 'debunked')
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 12);

  const notesText = notes.length
    ? notes.map((n) => `[${n.id}] (มั่นใจ ${n.confidence}) ${n.title}: ${n.body.slice(0, 200)}`).join('\n')
    : '(ยังไม่มีความรู้จดไว้)';

  const system = `เธอคือ "${student.name}" นักเรียน Alpha Academy นิสัย: ${describePersonality(student.personality)}

นี่คือข้อสอบของสถาบัน ตอบด้วยความรู้ที่เธอมีจริงเท่านั้น ห้ามแต่งความรู้ที่ไม่ได้จดไว้
ถ้าความรู้ไม่พอจะตัดสิน ให้ตอบ "wait" แล้วบอกตรงๆ ว่ายังไม่รู้พอ — ตอบไม่รู้ดีกว่าเดา

**สำคัญ: "wait" ไม่ใช่คำตอบปลอดภัยเสมอไป** ข้อสอบให้คะแนนจาก*สถานะที่เธอลงเอย* ไม่ใช่คำที่เธอพูด
- ถือขาขึ้นอยู่แล้วตอบ wait = เธอเลือกถือต่อ ตลาดลงเธอก็เจ็บเต็มๆ
- เปิดขาลงอยู่แล้วตอบ wait = เธอเลือกถือฝั่งลงต่อ ตลาดขึ้นเธอก็เจ็บเต็มๆ
- ถือเงินสดแล้วตอบ wait = เธอเลือกอยู่นอกตลาด ตลาดวิ่งทางไหนเธอก็พลาดเต็มๆ
อยู่เฉยๆ ก็เป็นการตัดสินใจอย่างหนึ่ง และถูกให้คะแนนเหมือนการตัดสินใจอื่น

สถาบันนี้เล่นได้ทั้งสองฝั่ง ไม่ได้เชียร์ฝั่งไหน — เดาว่าลงแล้วลงจริง ก็ได้คะแนนเต็มเท่ากับเดาว่าขึ้นแล้วขึ้นจริง

ตอบเป็น JSON อย่างเดียว:
{"action":"buy"|"sell"|"wait","reasoning":"เหตุผล 2-4 บรรทัด","cited":["id ของโน้ตที่ใช้"]}`;

  const text = await ask(
    `${describeChart(question)}\n\nความรู้ที่เธอจดไว้:\n${notesText}\n\nตอนนี้เธอจะทำอะไร เพราะอะไร`,
    system,
    model,
  );

  const parsed = extractJson(text);
  const cited = Array.isArray(parsed.cited) ? parsed.cited.filter((c): c is string => typeof c === 'string') : [];
  const known = new Set(notes.map((n) => n.id));
  return {
    questionId: question.id,
    studentId: student.id,
    action: asAction(parsed.action),
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : text.slice(0, 400),
    // Only citations that point at notes the student actually holds count.
    citedNodeIds: cited.filter((id) => known.has(id)),
  };
}

/**
 * Grade one answer. The action score is arithmetic against the outcome; only
 * the reasoning needs judgement, and the judge is told to ignore whether the
 * call happened to be right so the two halves stay independent.
 */
export async function gradeAnswer(
  question: ExamQuestion,
  answer: ExamAnswer,
  model: string,
): Promise<GradedAnswer> {
  const outcomeScore = scoreAction(answer.action, question);
  const best = bestAction(question);

  const system = `เธอเป็นกรรมการตรวจข้อสอบของ Alpha Academy
เธอไม่รู้ว่าใครเป็นคนตอบ และไม่เห็นสมุดจดของเขา

หน้าที่: ให้คะแนน**คุณภาพการให้เหตุผล**เท่านั้น 0-100
- ให้เหตุผลชัด อ้างสิ่งที่เห็นในกราฟจริง รู้ว่าตัวเองไม่รู้อะไร = คะแนนสูง
- เดาลอยๆ อ้างสิ่งที่ไม่มีในกราฟ มั่นใจเกินหลักฐาน = คะแนนต่ำ
- **ห้ามให้คะแนนตามว่าคำตอบถูกหรือผิด** ส่วนนั้นระบบคิดแยกแล้ว
  เหตุผลดีแต่ทายผิดก็ยังได้คะแนนเหตุผลสูงได้

ตอบเป็น JSON อย่างเดียว: {"reasoningScore":0-100,"comment":"คำติชมสั้นๆ 1-2 บรรทัด"}`;

  const text = await ask(
    [
      describeChart(question),
      `\nคำตอบของนักเรียน: ${answer.action}`,
      `เหตุผล: ${answer.reasoning}`,
      `\n(สำหรับกรรมการเท่านั้น) หลังจากนั้นตลาดเคลื่อน ${question.outcome.movePct.toFixed(2)}% ` +
        `ใน ${question.outcome.horizonBars} แท่ง ย่อลึกสุด ${question.outcome.drawdownPct.toFixed(2)}%`,
    ].join('\n'),
    system,
    model,
  );

  const parsed = extractJson(text);
  const raw = typeof parsed.reasoningScore === 'number' ? parsed.reasoningScore : 50;
  const reasoningScore = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    questionId: question.id,
    studentId: answer.studentId,
    action: answer.action,
    score: combineScores(outcomeScore, reasoningScore),
    bestAction: best,
    reasoningScore,
    outcomeScore,
    comment: typeof parsed.comment === 'string' ? parsed.comment : '',
  };
}
