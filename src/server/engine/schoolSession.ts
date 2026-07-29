/**
 * School sessions (Phase 2 P6, spec §9.2).
 *
 * Two students meet. Each shares something it learned; each decides what, if
 * anything, to take from the other. The exchange is deliberately asymmetric in
 * a way that matters: what you *say* comes from your own proven notes, but what
 * you *hear* lands as hearsay — low confidence, tagged `heard_from`, and below
 * the bar a belief needs before it can become a strategy. You cannot copy your
 * classmate's homework, only their curiosity.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

import { replay } from '../../core/eventLog.ts';
import { hearsayConfidence } from '../../core/school/pairing.ts';
import { describePersonality } from '../../core/personality.ts';
import type { Student } from '../../core/types.ts';
import { addEdge, addNode, searchNodes, type GraphOpsContext } from './graphOps.ts';

export interface SessionResult {
  a: string;
  b: string;
  transcript: string;
  /** Node ids created in each student's brain, keyed by student id. */
  recorded: Record<string, string[]>;
  costUsd: number | undefined;
}

/** What a student brings to class: its most confident recent notes. */
function talkingPoints(ctx: GraphOpsContext): string {
  const notes = searchNodes(ctx, { limit: 40 })
    .filter((n) => ['concept', 'lesson', 'hypothesis'].includes(n.kind))
    .filter((n) => n.status !== 'debunked')
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);
  if (notes.length === 0) return '(ยังไม่มีอะไรจะเล่า — เพิ่งเริ่มเรียน)';
  return notes
    .map((n) => `- [${n.kind}] ${n.title} (มั่นใจ ${n.confidence}): ${n.body.slice(0, 300)}`)
    .join('\n');
}

async function ask(prompt: string, system: string, model: string): Promise<{ text: string; cost?: number }> {
  let text = '';
  let cost: number | undefined;
  const run = query({
    prompt,
    options: { systemPrompt: system, model, maxTurns: 1, permissionMode: 'default', allowedTools: [] },
  });
  for await (const message of run) {
    if (message.type === 'result') {
      cost = 'total_cost_usd' in message ? message.total_cost_usd : undefined;
      if (message.subtype === 'success') text = message.result;
    }
  }
  return cost === undefined ? { text } : { text, cost };
}

function shareSystem(student: Student): string {
  return `เธอคือ "${student.name}" นักเรียน Alpha Academy นิสัย: ${describePersonality(student.personality)}

ตอนนี้อยู่ในคาบเรียน กำลังจะเล่าให้เพื่อนร่วมชั้นฟังว่าเธอเรียนรู้อะไรมา
เล่าแบบเพื่อนคุยกัน ภาษาไทย สั้นๆ ไม่เกิน 6 บรรทัด
เล่าเฉพาะสิ่งที่เธอ*มีจดไว้จริง* ห้ามแต่งเพิ่ม ถ้ายังไม่มีอะไรก็บอกตรงๆ ว่ายังไม่มี
ถ้ามีเรื่องที่เธอยังสงสัยหรืออยากถามเพื่อน ถามได้เลย`;
}

function listenSystem(student: Student): string {
  const skeptic = student.personality.skepticism > 0.5;
  return `เธอคือ "${student.name}" นักเรียน Alpha Academy นิสัย: ${describePersonality(student.personality)}

เพื่อนร่วมชั้นเพิ่งเล่าอะไรบางอย่างให้ฟัง เธอ${skeptic ? 'เป็นคนขี้สงสัย ไม่เชื่ออะไรง่ายๆ' : 'ค่อนข้างเปิดใจรับฟัง'}

กฎเหล็ก: สิ่งที่เพื่อนบอก **ยังไม่ใช่ความจริง** จนกว่าเธอจะพิสูจน์เอง
เธอจดไว้ได้ว่า "เพื่อนบอกมาแบบนี้" แต่ห้ามจดเป็นความรู้ที่เธอเชื่อแล้ว

ตอบกลับเป็น JSON อย่างเดียว ไม่มีข้อความอื่น:
{"reply":"สิ่งที่เธอตอบเพื่อน 1-3 บรรทัด","take":[{"title":"หัวข้อสั้นๆ","body":"เพื่อนบอกว่าอะไร และเธอคิดยังไงกับมัน"}]}

"take" คือสิ่งที่คุ้มจะจดไว้ไปพิสูจน์ต่อ — ใส่ได้ 0-2 อย่าง ถ้าไม่มีอะไรน่าสนใจใส่ []`;
}

function parseTake(text: string): { reply: string; take: { title: string; body: string }[] } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { reply: text.slice(0, 400), take: [] };
  try {
    const parsed = JSON.parse(match[0]) as { reply?: string; take?: { title?: string; body?: string }[] };
    return {
      reply: parsed.reply ?? '',
      take: (parsed.take ?? [])
        .filter((t): t is { title: string; body: string } => Boolean(t.title && t.body))
        .slice(0, 2),
    };
  } catch {
    return { reply: text.slice(0, 400), take: [] };
  }
}

export interface SessionOptions {
  a: Student;
  b: Student;
  ctxA: GraphOpsContext;
  ctxB: GraphOpsContext;
  model: string;
}

/**
 * Run one session. Both students speak and both listen, so a single meeting
 * moves knowledge in both directions.
 */
export async function runSession(opts: SessionOptions): Promise<SessionResult> {
  const { a, b, ctxA, ctxB } = opts;
  let cost = 0;
  const bump = (c: number | undefined) => {
    if (c !== undefined) cost += c;
  };

  const shareA = await ask(
    `สิ่งที่เธอจดไว้:\n${talkingPoints(ctxA)}\n\nเล่าให้เพื่อนฟัง`,
    shareSystem(a),
    opts.model,
  );
  bump(shareA.cost);

  const shareB = await ask(
    `สิ่งที่เธอจดไว้:\n${talkingPoints(ctxB)}\n\nเล่าให้เพื่อนฟัง`,
    shareSystem(b),
    opts.model,
  );
  bump(shareB.cost);

  const heardByB = await ask(`${a.name} เล่าว่า:\n${shareA.text}`, listenSystem(b), opts.model);
  bump(heardByB.cost);
  const heardByA = await ask(`${b.name} เล่าว่า:\n${shareB.text}`, listenSystem(a), opts.model);
  bump(heardByA.cost);

  const parsedB = parseTake(heardByB.text);
  const parsedA = parseTake(heardByA.text);

  const transcript = [
    `${a.name}: ${shareA.text}`,
    `${b.name}: ${parsedB.reply}`,
    `${b.name}: ${shareB.text}`,
    `${a.name}: ${parsedA.reply}`,
  ].join('\n\n');

  const recorded: Record<string, string[]> = {
    [a.id]: record(ctxA, a, b.name, transcript, parsedA.take),
    [b.id]: record(ctxB, b, a.name, transcript, parsedB.take),
  };

  return cost > 0
    ? { a: a.id, b: b.id, transcript, recorded, costUsd: cost }
    : { a: a.id, b: b.id, transcript, recorded, costUsd: undefined };
}

/**
 * Write the meeting into one student's brain: the transcript as a
 * `conversation` node, and each takeaway as a low-confidence note wired back to
 * it with `heard_from`. The edge is what makes hearsay auditable later — the
 * maker can always see which beliefs came from a classmate rather than proof.
 */
function record(
  ctx: GraphOpsContext,
  student: Student,
  otherName: string,
  transcript: string,
  take: { title: string; body: string }[],
): string[] {
  const conversation = addNode(ctx, {
    kind: 'conversation',
    title: `คุยกับ${otherName}`,
    body: transcript,
    confidence: 1, // that the conversation happened is certain; its content is not
  });

  const confidence = hearsayConfidence(student.personality.skepticism);
  const ids = [conversation.id];
  for (const item of take) {
    const node = addNode(ctx, {
      kind: 'concept',
      title: item.title,
      body: `${otherName}บอกมา — ยังไม่ได้พิสูจน์เอง\n\n${item.body}`,
      confidence,
    });
    addEdge(ctx, { kind: 'heard_from', fromNodeId: node.id, toNodeId: conversation.id });
    ids.push(node.id);
  }
  return ids;
}

/** Count of beliefs a student is currently holding purely on a classmate's word. */
export function hearsayCount(ctx: GraphOpsContext): number {
  const { nodes, edges } = replay(ctx.store.read(ctx.studentId));
  const heard = new Set(
    [...edges.values()].filter((e) => e.kind === 'heard_from').map((e) => e.fromNodeId),
  );
  return [...nodes.values()].filter((n) => heard.has(n.id)).length;
}
