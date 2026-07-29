import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { MemoryEventStore, replay } from '../../core/eventLog.ts';
import { HEARSAY_CEILING, hearsayConfidence } from '../../core/school/pairing.ts';
import { personalityFromSeed } from '../../core/personality.ts';
import type { Student } from '../../core/types.ts';
import { addEdge, addNode, type GraphOpsContext } from './graphOps.ts';
import { hearsayCount } from './schoolSession.ts';

function ctxFor(id: string): GraphOpsContext {
  let tick = 0;
  return { studentId: id, store: new MemoryEventStore(), now: () => ++tick };
}

function studentFor(id: string, name: string): Student {
  return { id, name, personality: personalityFromSeed(id), energy: 100, enrolledAt: 0 };
}

test('hearsay is countable and separate from proven knowledge', () => {
  const ctx = ctxFor('s1');
  const proven = addNode(ctx, { kind: 'concept', title: 'RSI', body: '', confidence: 0.8 });
  const conversation = addNode(ctx, { kind: 'conversation', title: 'คุยกับภูผา', body: '', confidence: 1 });
  const heard = addNode(ctx, { kind: 'concept', title: 'volume สำคัญ', body: '', confidence: 0.3 });
  addEdge(ctx, { kind: 'heard_from', fromNodeId: heard.id, toNodeId: conversation.id });

  assert.equal(hearsayCount(ctx), 1, 'only the note wired to a conversation counts');
  const brain = replay(ctx.store.read('s1'));
  assert.equal(brain.nodes.get(proven.id)?.confidence, 0.8, 'proven knowledge is untouched');
});

test('a brain with no conversations holds no hearsay', () => {
  const ctx = ctxFor('s1');
  addNode(ctx, { kind: 'concept', title: 'RSI', body: '', confidence: 0.9 });
  assert.equal(hearsayCount(ctx), 0);
});

test('hearsay confidence stays under the bar a strategy would need', () => {
  // A student may only compile beliefs it has proven; hearsay is capped well
  // below anything that could pass for proof.
  for (const seed of ['mali-2026', 'phupha-2026', 'khaofang-2026']) {
    const student = studentFor(seed, seed);
    assert.ok(hearsayConfidence(student.personality.skepticism) <= HEARSAY_CEILING);
  }
});
