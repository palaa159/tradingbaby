import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MemoryEventStore, replay } from './eventLog.ts';
import type { KnowledgeNode } from './types.ts';

function makeNode(id: string, at: number, confidence = 0.2): KnowledgeNode {
  return {
    id,
    studentId: 's1',
    kind: 'concept',
    title: `node ${id}`,
    body: '',
    confidence,
    createdAt: at,
    updatedAt: at,
  };
}

test('replay reconstructs the brain at any point in time', () => {
  const store = new MemoryEventStore();
  store.append('s1', { type: 'node_added', at: 100, node: makeNode('a', 100) });
  store.append('s1', { type: 'node_added', at: 200, node: makeNode('b', 200) });
  store.append('s1', {
    type: 'node_updated',
    at: 300,
    nodeId: 'a',
    patch: { confidence: 0.9, status: 'adopted' },
  });

  const day1 = replay(store.read('s1'), 150);
  assert.equal(day1.nodes.size, 1);
  assert.equal(day1.nodes.get('a')?.confidence, 0.2);

  const now = replay(store.read('s1'));
  assert.equal(now.nodes.size, 2);
  assert.equal(now.nodes.get('a')?.confidence, 0.9);
  assert.equal(now.nodes.get('a')?.status, 'adopted');
});

test('event log rejects out-of-order appends (append-only contract)', () => {
  const store = new MemoryEventStore();
  store.append('s1', { type: 'node_added', at: 200, node: makeNode('a', 200) });
  assert.throws(() =>
    store.append('s1', { type: 'node_added', at: 100, node: makeNode('b', 100) }),
  );
});
