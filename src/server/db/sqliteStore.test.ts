import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { replay } from '../../core/eventLog.ts';
import type { KnowledgeNode } from '../../core/types.ts';
import { openAcademyDb, SqliteEventStore, StudentStore } from './sqliteStore.ts';

function makeNode(id: string, at: number, confidence = 0.2): KnowledgeNode {
  return {
    id,
    studentId: 's1',
    kind: 'concept',
    title: `node ${id}`,
    body: 'body',
    confidence,
    createdAt: at,
    updatedAt: at,
  };
}

test('events survive a reopen and replay to the same brain', () => {
  const db = openAcademyDb(':memory:');
  const store = new SqliteEventStore(db);

  store.append('s1', { type: 'node_added', at: 100, node: makeNode('a', 100) });
  store.append('s1', { type: 'node_added', at: 200, node: makeNode('b', 200) });
  store.append('s1', {
    type: 'node_updated',
    at: 300,
    nodeId: 'a',
    patch: { confidence: 0.9, status: 'adopted' },
  });

  // A fresh store over the same database is what a new process sees.
  const reopened = new SqliteEventStore(db);
  const brain = replay(reopened.read('s1'));
  assert.equal(brain.nodes.size, 2);
  assert.equal(brain.nodes.get('a')?.confidence, 0.9);
  assert.equal(brain.nodes.get('a')?.status, 'adopted');
  assert.equal(reopened.count('s1'), 3);

  // Time travel still works against persisted events.
  assert.equal(replay(reopened.read('s1'), 150).nodes.size, 1);
});

test('append-only contract is enforced in SQLite too', () => {
  const db = openAcademyDb(':memory:');
  const store = new SqliteEventStore(db);
  store.append('s1', { type: 'node_added', at: 200, node: makeNode('a', 200) });
  assert.throws(() => store.append('s1', { type: 'node_added', at: 100, node: makeNode('b', 100) }));
});

test('brains are isolated per student', () => {
  const db = openAcademyDb(':memory:');
  const store = new SqliteEventStore(db);
  store.append('s1', { type: 'node_added', at: 1, node: makeNode('a', 1) });
  store.append('s2', { type: 'node_added', at: 1, node: makeNode('b', 1) });

  assert.equal(store.count('s1'), 1);
  assert.equal(replay(store.read('s2')).nodes.get('b')?.title, 'node b');
  assert.equal(replay(store.read('s2')).nodes.has('a'), false);
});

test('enroll is idempotent and energy persists', () => {
  const db = openAcademyDb(':memory:');
  const students = new StudentStore(db);

  const first = students.enroll('mali-2026', 'มะลิ', 900, 1000);
  assert.equal(first.energy, 900);

  students.saveEnergy('mali-2026', 875);

  const again = students.enroll('mali-2026', 'มะลิ', 900, 9999);
  assert.equal(again.energy, 875, 'existing energy wins over the starting allowance');
  assert.equal(again.enrolledAt, 1000, 'enrollment date is not reset');
  assert.deepEqual(again.personality, first.personality, 'personality re-derives from the seed');
  assert.equal(students.list().length, 1);
});
