import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { MemoryEventStore, replay } from '../../core/eventLog.ts';
import { buildLibrary, type ClaimRecord } from '../../core/school/hive.ts';
import { HEARSAY_CEILING } from '../../core/school/pairing.ts';
import { personalityFromSeed } from '../../core/personality.ts';
import type { StrategySpec } from '../../core/strategy/types.ts';
import { borrowFromLibrary, readableEntries } from './libraryTool.ts';
import type { GraphOpsContext } from './graphOps.ts';

function ctxFor(id = 'mali'): GraphOpsContext {
  let tick = 0;
  return { studentId: id, store: new MemoryEventStore(), now: () => ++tick };
}

const spec: StrategySpec = {
  name: 'rsi-dip',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entry: [{ left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 30 } }],
  exit: [],
  sizePct: 20,
};

function record(id: string, name: string, status: 'adopted' | 'debunked', at = 1): ClaimRecord {
  return {
    spec,
    verdict: { studentId: id, studentName: name, status, alphaPct: 5, confidence: 0.7, at },
  };
}

const endorsed = buildLibrary(
  [record('phupha', 'ภูผา', 'adopted'), record('khaofang', 'ข้าวฟ่าง', 'adopted', 2), record('daen', 'แดน', 'adopted', 3)],
  { classSize: 4 },
)[0]!;

test('what the library shows a student is the claim and who stands behind it', () => {
  const [reading] = readableEntries([endorsed]);
  assert.ok(reading?.statement.includes('rsi(14) < 30'));
  assert.equal(reading?.verifiedBy, 3);
  assert.equal(reading?.disputedBy, 0);
});

test('borrowing from the library is hearsay, not proof', () => {
  const ctx = ctxFor();
  const personality = personalityFromSeed('mali-2026');
  const result = borrowFromLibrary(ctx, personality, endorsed);

  assert.equal(result.ok, true);
  assert.ok((result.confidence ?? 1) <= HEARSAY_CEILING, 'three classmates agreeing is still not proof');

  const brain = replay(ctx.store.read('mali'));
  const note = brain.nodes.get(result.createdNodeId ?? '');
  assert.ok(note?.body.includes('ยังไม่ได้พิสูจน์เอง'));
  assert.ok(
    [...brain.edges.values()].some((e) => e.kind === 'heard_from'),
    'the trail back to where it came from is kept',
  );
});

test('a student cannot launder its own verdict through the library', () => {
  const solo = buildLibrary([record('mali', 'มะลิ', 'adopted')], { classSize: 3 })[0]!;
  const ctx = ctxFor('mali');
  const result = borrowFromLibrary(ctx, personalityFromSeed('mali-2026'), solo);

  assert.equal(result.ok, false, 'reading your own work back is not learning');
  assert.equal(replay(ctx.store.read('mali')).nodes.size, 0, 'and nothing was written');
});

test('a disputed entry is copied with the argument intact', () => {
  const disputed = buildLibrary(
    [record('phupha', 'ภูผา', 'adopted'), record('khaofang', 'ข้าวฟ่าง', 'debunked', 2)],
    { classSize: 3 },
  )[0]!;
  const ctx = ctxFor();
  const result = borrowFromLibrary(ctx, personalityFromSeed('mali-2026'), disputed);

  const note = replay(ctx.store.read('mali')).nodes.get(result.createdNodeId ?? '');
  assert.ok(note?.body.includes('ยังเถียงกันอยู่'), 'the student is told the school disagrees');
});

test('a skeptical student trusts the library less than a credulous one', () => {
  const skeptic = { ...personalityFromSeed('x'), skepticism: 0.95 };
  const credulous = { ...personalityFromSeed('x'), skepticism: 0.05 };
  const a = borrowFromLibrary(ctxFor(), skeptic, endorsed);
  const b = borrowFromLibrary(ctxFor(), credulous, endorsed);
  assert.ok((a.confidence ?? 1) < (b.confidence ?? 0));
});
