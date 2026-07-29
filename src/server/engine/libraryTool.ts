/**
 * Reading the school library (spec §9.3).
 *
 * The library holds what the school has collectively established. A student may
 * walk in and read it — and what it reads lands the same way a classmate's word
 * does: as hearsay, capped below what a strategy needs, tagged with where it
 * came from.
 *
 * That symmetry is the point. Endorsed-by-three-classmates is still not the same
 * as proven-by-me, and the moment the library became a shortcut to belief, the
 * "ทำการบ้านเอง" rule would be dead and every student would converge on whatever
 * the first three happened to find.
 */

import { HEARSAY_CEILING, hearsayConfidence } from '../../core/school/pairing.ts';
import type { LibraryEntry } from '../../core/school/hive.ts';
import type { PersonalitySeed } from '../../core/types.ts';
import { addEdge, addNode, type GraphOpsContext } from './graphOps.ts';

export interface LibraryReading {
  statement: string;
  consensus: string;
  verifiedBy: number;
  disputedBy: number;
  meanAlphaPct: number;
}

/** What a student sees when it opens the library. */
export function readableEntries(entries: LibraryEntry[], limit = 12): LibraryReading[] {
  return entries.slice(0, limit).map((entry) => ({
    statement: entry.statement,
    consensus: entry.consensus,
    verifiedBy: entry.adoptedBy,
    disputedBy: entry.debunkedBy,
    meanAlphaPct: entry.meanAlphaPct,
  }));
}

export interface BorrowResult {
  ok: boolean;
  createdNodeId?: string;
  confidence?: number;
  message: string;
}

/**
 * Copy one library entry into a student's own brain as hearsay.
 *
 * Refuses to copy the student's own verdict back to it — reading your own work
 * on a shelf is not learning something new, and letting it through would let a
 * student inflate its own belief by laundering it through the library.
 */
export function borrowFromLibrary(
  ctx: GraphOpsContext,
  personality: PersonalitySeed,
  entry: LibraryEntry,
): BorrowResult {
  const others = entry.verdicts.filter((v) => v.studentId !== ctx.studentId);
  if (others.length === 0) {
    return {
      ok: false,
      message: 'ข้ออ้างนี้มีแต่ผลของเธอเอง — อ่านงานตัวเองไม่นับว่าเรียนรู้อะไรใหม่',
    };
  }

  const source = addNode(ctx, {
    kind: 'source',
    title: `ห้องสมุดกลาง: ${entry.consensus}`,
    body:
      `${entry.statement}\n\n` +
      `รับ ${entry.adoptedBy} คน · ตีตก ${entry.debunkedBy} คน · alpha เฉลี่ย ${entry.meanAlphaPct}%\n` +
      others.map((v) => `- ${v.studentName}: ${v.status}`).join('\n'),
    confidence: 1, // that the library says this is certain; that it is true is not
  });

  const confidence = hearsayConfidence(personality.skepticism);
  const note = addNode(ctx, {
    kind: 'concept',
    title: entry.statement.slice(0, 120),
    body:
      `ห้องสมุดกลางบอกมา — ยังไม่ได้พิสูจน์เอง\n\n` +
      `สถานะในห้องสมุด: ${entry.consensus} (รับ ${entry.adoptedBy} · ตีตก ${entry.debunkedBy})\n` +
      (entry.consensus === 'disputed'
        ? 'เพื่อนยังเถียงกันอยู่ — ยิ่งต้องพิสูจน์เอง'
        : 'ถึงหลายคนจะเห็นตรงกัน ก็ยังไม่ใช่หลักฐานของเธอ'),
    confidence,
    links: [{ kind: 'heard_from', toNodeId: source.id }],
  });
  addEdge(ctx, { kind: 'learned_from', fromNodeId: note.id, toNodeId: source.id });

  return {
    ok: true,
    createdNodeId: note.id,
    confidence,
    message:
      `จดไว้แล้วด้วยความมั่นใจ ${confidence} (เพดานของสิ่งที่ได้ยินมาคือ ${HEARSAY_CEILING}) — ` +
      'อยากใช้จริงต้องเอาไปทดสอบเองด้วย test_strategy ก่อน',
  };
}
