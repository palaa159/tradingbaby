import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { validateSpec } from './schema.ts';

const wellFormed = {
  name: 'rsi-dip',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  entry: [
    { left: { kind: 'indicator', name: 'rsi', period: 14 }, op: '<', right: { kind: 'number', value: 30 } },
  ],
  exit: [],
  sizePct: 20,
};

test('a rejection says what shape was wanted, not just that it was wrong', () => {
  // What a student writes on its first try: the indicator name bare.
  const result = validateSpec({ ...wellFormed, entry: [{ left: 'rsi', op: '<', right: 30 }] });
  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.ok(
    result.errors.every((e) => !e.endsWith('Invalid input')),
    `"Invalid input" teaches nothing: ${result.errors.join(' | ')}`,
  );
  assert.ok(result.errors.some((e) => e.includes('"kind":"indicator"')));
});

test('every rejection carries a spec that would have worked', () => {
  const result = validateSpec({ nonsense: true });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.example, 'a student should not have to read the source to find the shape');
  assert.equal(validateSpec(result.example).ok, true, 'and the example has to actually validate');
});

test('a misspelled direction says which words are allowed', () => {
  const result = validateSpec({ ...wellFormed, direction: 'shrot' });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => e.includes('long') && e.includes('short')));
});

test('both sides of the market validate', () => {
  assert.equal(validateSpec({ ...wellFormed, direction: 'long' }).ok, true);
  assert.equal(validateSpec({ ...wellFormed, direction: 'short' }).ok, true);
  assert.equal(validateSpec(wellFormed).ok, true, 'and omitting it is still fine');
});
