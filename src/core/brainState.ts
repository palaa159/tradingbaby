/**
 * What a student knows about its own mind (Phase 2 P9).
 *
 * Students were producing questions and never hypotheses — 11 to 0 in the first
 * real brain. The prompt told them to write a question when confused but never
 * to turn accumulated knowledge into a testable claim, so the whole test-and-
 * judge machinery sat idle. Showing a student its own shape is the cheapest fix:
 * it can see it has plenty of curiosity and nothing it has committed to.
 */

import { replay, type EventStore } from './eventLog.ts';
import type { KnowledgeNode } from './types.ts';

export interface BrainState {
  counts: Record<string, number>;
  /** Hypotheses that have never been put in front of a backtest. */
  untested: { id: string; title: string }[];
  /** Concepts and lessons solid enough to build a claim on. */
  solidKnowledge: { id: string; title: string; confidence: number }[];
  /** True when the student has enough to form a claim but has not formed one. */
  readyToClaim: boolean;
}

const SOLID_ENOUGH = 0.45;

export function readBrainState(store: EventStore, studentId: string): BrainState {
  const { nodes } = replay(store.read(studentId));
  const all = [...nodes.values()];

  const counts: Record<string, number> = {};
  for (const node of all) counts[node.kind] = (counts[node.kind] ?? 0) + 1;

  const untested = all
    .filter((n) => n.kind === 'hypothesis' && (n.status === 'untested' || n.status === 'testing'))
    .map((n) => ({ id: n.id, title: n.title }));

  const solidKnowledge = all
    .filter((n) => ['concept', 'lesson'].includes(n.kind))
    .filter((n) => n.status !== 'debunked' && n.confidence >= SOLID_ENOUGH)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8)
    .map((n: KnowledgeNode) => ({ id: n.id, title: n.title, confidence: n.confidence }));

  return {
    counts,
    untested,
    solidKnowledge,
    // Enough material to commit to something, and nothing currently committed.
    readyToClaim: solidKnowledge.length >= 2 && untested.length === 0,
  };
}

/** A short, honest mirror the student reads at the top of every cycle. */
export function describeBrainState(state: BrainState): string {
  const shape = Object.entries(state.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${kind} ${n}`)
    .join(' · ');

  const lines = [`สมองของเธอตอนนี้: ${shape || '(ว่างเปล่า)'}`];

  if (state.untested.length > 0) {
    lines.push(
      `ข้อสงสัยที่ยังไม่ได้ทดสอบ ${state.untested.length} ข้อ:`,
      ...state.untested.slice(0, 4).map((h) => `- [${h.id}] ${h.title}`),
    );
  }

  if (state.readyToClaim) {
    lines.push(
      '',
      '⚠ เธอสะสมความรู้มาพอสมควรแล้ว แต่**ยังไม่เคยกล้าอ้างอะไรที่ทดสอบได้เลยสักข้อ**',
      'ความรู้ที่ไม่เคยถูกวัดก็ยังไม่นับว่ารู้จริง — ถึงเวลาตั้งข้อสงสัยแล้วเอาไปพิสูจน์',
    );
  }

  return lines.join('\n');
}
