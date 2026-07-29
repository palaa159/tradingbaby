import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { test } from 'bun:test';

import { DEFAULT_SCHEDULE } from '../scheduler.ts';
import { sanitizeSchedule, SettingsStore } from './settingsStore.ts';

const CURRENT = {
  shortCyclesPerDay: DEFAULT_SCHEDULE.shortCyclesPerDay,
  dailyReviewMinute: DEFAULT_SCHEDULE.dailyReviewMinute,
  wakingWindow: DEFAULT_SCHEDULE.wakingWindow,
};

test('an untouched setting keeps following the default', () => {
  const s = new SettingsStore(new Database(':memory:'));
  assert.deepEqual(s.schedule(DEFAULT_SCHEDULE), DEFAULT_SCHEDULE);
});

test('a saved setting overrides the default and survives a reread', () => {
  const db = new Database(':memory:');
  const s = new SettingsStore(db);
  s.setSchedule({ shortCyclesPerDay: 8 }, DEFAULT_SCHEDULE, 1);
  assert.equal(s.schedule(DEFAULT_SCHEDULE).shortCyclesPerDay, 8);
  // Fields the maker did not touch still come from the defaults.
  assert.equal(s.schedule(DEFAULT_SCHEDULE).dailyReviewMinute, DEFAULT_SCHEDULE.dailyReviewMinute);
  assert.equal(new SettingsStore(db).schedule(DEFAULT_SCHEDULE).shortCyclesPerDay, 8);
});

test('cycles per day are capped — the quota is a month long, not a morning', () => {
  assert.equal(sanitizeSchedule({ shortCyclesPerDay: 500 }, CURRENT).shortCyclesPerDay, 24);
  assert.equal(sanitizeSchedule({ shortCyclesPerDay: -3 }, CURRENT).shortCyclesPerDay, 0);
});

test('a window that ends before it starts is repaired, not stored', () => {
  const fixed = sanitizeSchedule({ wakingWindow: [900, 300] }, CURRENT);
  assert.equal(fixed.wakingWindow[0], 900);
  assert.ok(fixed.wakingWindow[1] > fixed.wakingWindow[0]);
});

test('rubbish is ignored rather than accepted', () => {
  const kept = sanitizeSchedule(
    { shortCyclesPerDay: 'lots', dailyReviewMinute: null, wakingWindow: 'all day' },
    CURRENT,
  );
  assert.deepEqual(kept, CURRENT);
  assert.deepEqual(sanitizeSchedule(undefined, CURRENT), CURRENT);
});

test('minutes stay inside a day', () => {
  assert.equal(sanitizeSchedule({ dailyReviewMinute: 5000 }, CURRENT).dailyReviewMinute, 1439);
  assert.equal(sanitizeSchedule({ dailyReviewMinute: -10 }, CURRENT).dailyReviewMinute, 0);
});
