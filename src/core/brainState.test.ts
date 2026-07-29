import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { describeBrainState, readBrainState } from './brainState.ts';
import { MemoryEventStore } from './eventLog.ts';
import type { KnowledgeNode, NodeKind, NodeStatus } from './types.ts';

function store(nodes: Partial<KnowledgeNode>[]): MemoryEventStore {
  const s = new MemoryEventStore();
  nodes.forEach((n, i) => {
    const node: KnowledgeNode = {
      id: n.id ?? `n${i}`,
      studentId: 's1',
      kind: (n.kind ?? 'concept') as NodeKind,
      title: n.title ?? `node ${i}`,
      body: '',
      confidence: n.confidence ?? 0.5,
      createdAt: i + 1,
      updatedAt: i + 1,
      ...(n.status ? { status: n.status as NodeStatus } : {}),
    };
    s.append('s1', { type: 'node_added', at: i + 1, node });
  });
  return s;
}

test('an empty brain is not ready to claim anything', () => {
  const state = readBrainState(store([]), 's1');
  assert.equal(state.readyToClaim, false);
  assert.ok(describeBrainState(state).includes('ว่างเปล่า'));
});

test('curiosity alone does not make a student ready to claim', () => {
  const state = readBrainState(
    store([{ kind: 'question' }, { kind: 'question' }, { kind: 'question' }]),
    's1',
  );
  assert.equal(state.readyToClaim, false, 'questions are not knowledge');
  assert.equal(state.solidKnowledge.length, 0);
});

test('two solid notes and no hypothesis is exactly the state that needs nudging', () => {
  const state = readBrainState(
    store([
      { kind: 'concept', confidence: 0.6, title: 'RSI' },
      { kind: 'lesson', confidence: 0.7, title: 'อย่าเชื่อ pattern เดียว' },
      { kind: 'question' },
    ]),
    's1',
  );
  assert.equal(state.readyToClaim, true);
  const text = describeBrainState(state);
  assert.ok(text.includes('ยังไม่เคยกล้าอ้าง'), 'the student is told plainly');
});

test('shaky knowledge does not count toward being ready', () => {
  const state = readBrainState(
    store([
      { kind: 'concept', confidence: 0.2 },
      { kind: 'concept', confidence: 0.3 },
    ]),
    's1',
  );
  assert.equal(state.readyToClaim, false, 'half-understood notes cannot support a claim');
});

test('debunked notes do not count as solid knowledge', () => {
  const state = readBrainState(
    store([
      { kind: 'concept', confidence: 0.9, status: 'debunked' },
      { kind: 'concept', confidence: 0.8 },
    ]),
    's1',
  );
  assert.equal(state.solidKnowledge.length, 1);
  assert.equal(state.readyToClaim, false);
});

test('an untested hypothesis stops the nudge and surfaces instead', () => {
  const state = readBrainState(
    store([
      { kind: 'concept', confidence: 0.6 },
      { kind: 'concept', confidence: 0.7 },
      { id: 'h1', kind: 'hypothesis', title: 'RSI < 30 น่าซื้อ', status: 'untested' },
    ]),
    's1',
  );
  assert.equal(state.readyToClaim, false, 'no nudge while something is already pending');
  assert.equal(state.untested[0]?.id, 'h1');
  assert.ok(describeBrainState(state).includes('RSI < 30 น่าซื้อ'), 'it is put in front of them');
});

test('a judged hypothesis is no longer pending', () => {
  const state = readBrainState(
    store([
      { kind: 'concept', confidence: 0.6 },
      { kind: 'concept', confidence: 0.7 },
      { kind: 'hypothesis', status: 'debunked' },
      { kind: 'hypothesis', status: 'adopted' },
    ]),
    's1',
  );
  assert.equal(state.untested.length, 0);
  assert.equal(state.readyToClaim, true, 'settled beliefs free the student to claim again');
});
