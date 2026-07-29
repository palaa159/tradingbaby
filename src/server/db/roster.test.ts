import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { openAcademyDb } from './sqliteStore.ts';
import { Roster } from './roster.ts';

function roster(): Roster {
  return new Roster(openAcademyDb(':memory:'));
}

test('enrolling twice with the same seed returns the same student, not a twin', () => {
  const r = roster();
  const first = r.enroll('mali-2026', 'มะลิ', 900, 1);
  const again = r.enroll('mali-2026', 'ชื่ออื่น', 900, 2);
  assert.equal(again.id, first.id);
  assert.equal(again.name, 'มะลิ', 'the original name is kept');
  assert.equal(r.all().length, 1);
});

test('personality follows the seed, not the display name', () => {
  const r = roster();
  const before = r.enroll('mali-2026', 'มะลิ', 900, 1).personality;
  r.rename('mali-2026', 'ชื่อใหม่');
  const after = r.get('mali-2026');
  assert.ok(after);
  assert.equal(after.name, 'ชื่อใหม่');
  assert.deepEqual(after.personality, before);
});

test('suspension and revival are the maker call, and reversible', () => {
  const r = roster();
  r.enroll('mali-2026', 'มะลิ', 900, 1);
  r.suspend('mali-2026', 5);
  let s = r.get('mali-2026');
  assert.equal(s?.suspended, true);
  assert.equal(s?.energy, 0);
  assert.equal(r.active().length, 0);

  r.revive('mali-2026', 900);
  s = r.get('mali-2026');
  assert.equal(s?.suspended, false);
  assert.equal(s?.energy, 900);
  assert.equal(r.active().length, 1);
});

test('expulsion is a flag, never a delete — the record has to survive', () => {
  const r = roster();
  r.enroll('mali-2026', 'มะลิ', 900, 1);
  r.expel('mali-2026', 9);

  const s = r.get('mali-2026');
  assert.ok(s, 'the student row still exists after expulsion');
  assert.equal(s.expelled, true);
  assert.equal(r.active().length, 0);
  assert.equal(r.all().length, 1, 'still visible to the maker');

  r.readmit('mali-2026', 900);
  assert.equal(r.get('mali-2026')?.expelled, false);
  assert.equal(r.active().length, 1);
});

test('active excludes suspended and expelled, keeps everyone else', () => {
  const r = roster();
  r.enroll('a-seed', 'A', 900, 1);
  r.enroll('b-seed', 'B', 900, 2);
  r.enroll('c-seed', 'C', 900, 3);
  r.suspend('b-seed', 4);
  r.expel('c-seed', 5);
  assert.deepEqual(r.active().map((s) => s.name), ['A']);
});
