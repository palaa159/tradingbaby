import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { MemoryEventStore } from '../../core/eventLog.ts';
import { addNode, curiosityQueue, searchNodes, updateNode, type GraphOpsContext } from './graphOps.ts';

function makeCtx(): GraphOpsContext {
  let tick = 0;
  return { studentId: 's1', store: new MemoryEventStore(), now: () => ++tick };
}

test('addNode with links creates node and edges through the event log', () => {
  const ctx = makeCtx();
  const source = addNode(ctx, { kind: 'source', title: 'RSI คืออะไร', body: 'https://…', confidence: 1 });
  addNode(ctx, {
    kind: 'concept',
    title: 'RSI',
    body: 'เครื่องวัดแรงซื้อแรงขาย',
    confidence: 0.3,
    links: [{ kind: 'learned_from', toNodeId: source.id }],
  });

  const events = ctx.store.read('s1');
  assert.equal(events.filter((e) => e.type === 'node_added').length, 2);
  assert.equal(events.filter((e) => e.type === 'edge_added').length, 1);
});

test('search filters by kind and text, confidence clamps to 0..1', () => {
  const ctx = makeCtx();
  addNode(ctx, { kind: 'concept', title: 'RSI', body: '', confidence: 5 });
  addNode(ctx, { kind: 'question', title: 'ทำไมราคาลง?', body: '', confidence: 0.5 });

  const concepts = searchNodes(ctx, { kind: 'concept' });
  assert.equal(concepts.length, 1);
  assert.equal(concepts[0]?.confidence, 1);
  assert.equal(searchNodes(ctx, { text: 'ทำไม' }).length, 1);
});

test('curiosity queue hides answered questions; hypotheses start untested', () => {
  const ctx = makeCtx();
  const q1 = addNode(ctx, { kind: 'question', title: 'q1', body: '', confidence: 1 });
  addNode(ctx, { kind: 'question', title: 'q2', body: '', confidence: 1 });
  const hypo = addNode(ctx, { kind: 'hypothesis', title: 'h1', body: '', confidence: 0.2 });

  assert.equal(hypo.status, 'untested');
  assert.equal(curiosityQueue(ctx).length, 2);

  updateNode(ctx, { nodeId: q1.id, status: 'answered' });
  const queue = curiosityQueue(ctx);
  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.title, 'q2');
});
