import assert from 'node:assert/strict';
import { test } from 'bun:test';

import type { BrainState } from '../../core/brainState.ts';
import type { PersonalitySeed, Student } from '../../core/types.ts';
import { buildSystemPrompt } from './prompts.ts';

const seed: PersonalitySeed = {
  riskAppetite: 0.5,
  skepticism: 0.5,
  impulsiveness: 0.5,
  sociability: 0.5,
};

const student: Student = {
  id: 's1',
  name: 'มะลิ',
  personality: seed,
  energy: 900,
  enrolledAt: 1,
};

function brain(over: Partial<BrainState>): BrainState {
  return {
    counts: {},
    untested: [],
    solidKnowledge: [],
    readyToClaim: false,
    ...over,
  };
}

test('a pending hypothesis makes the round about testing it', () => {
  const prompt = buildSystemPrompt(
    student,
    'well_fed',
    'short',
    [],
    brain({ untested: [{ id: 'h1', title: 'RSI < 30 น่าซื้อ' }] }),
  );
  assert.ok(prompt.includes('เอาข้อสงสัยไปทดสอบด้วย test_strategy'));
});

test('nothing pending but enough knowledge makes the round about claiming', () => {
  // The gap this closes: a student whose hypotheses were all judged used to
  // land in the research branch and stay there. Three live cycles in a row
  // called no test_strategy at all while sitting on fourteen solid notes.
  const prompt = buildSystemPrompt(
    student,
    'well_fed',
    'short',
    [],
    brain({
      readyToClaim: true,
      solidKnowledge: [
        { id: 'c1', title: 'RSI', confidence: 0.6 },
        { id: 'c2', title: 'Volume', confidence: 0.7 },
      ],
    }),
  );
  assert.ok(prompt.includes('ตั้งข้อสงสัยใหม่'), 'the round asks for a new claim');
  assert.ok(prompt.includes('test_strategy ในรอบนี้เลย'), 'and asks for it to be measured now');
});

test('too little knowledge to claim leaves the round on research', () => {
  const prompt = buildSystemPrompt(student, 'well_fed', 'short', [], brain({}));
  assert.ok(prompt.includes('ชำเลืองดูตลาดด้วยเครื่องมือ market_glance'));
  assert.ok(!prompt.includes('ตั้งข้อสงสัยใหม่'), 'nothing solid enough to stand a claim on');
});
