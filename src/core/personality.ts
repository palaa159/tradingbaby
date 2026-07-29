/**
 * Personality seeds (spec §3.2, §14.3): 4 dimensions, randomized once at
 * enrollment. Deterministically derived from a seed string so a student's
 * personality is reproducible from their enrollment record.
 */

import type { PersonalitySeed } from './types.ts';

/** Small deterministic PRNG (mulberry32). No Math.random anywhere. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Derive a stable 4-dimension personality from a seed string. */
export function personalityFromSeed(seed: string): PersonalitySeed {
  const rand = mulberry32(hashString(seed));
  return {
    riskAppetite: rand(),
    skepticism: rand(),
    impulsiveness: rand(),
    sociability: rand(),
  };
}

/** Human-readable trait summary for diaries and the classroom view. */
export function describePersonality(p: PersonalitySeed): string {
  const traits: string[] = [];
  traits.push(p.riskAppetite > 0.5 ? 'กล้าเสี่ยง' : 'ระวังตัว');
  traits.push(p.skepticism > 0.5 ? 'ขี้สงสัย' : 'เชื่อคนง่าย');
  traits.push(p.impulsiveness > 0.5 ? 'ชอบลุยก่อน' : 'คิดก่อนทำ');
  traits.push(p.sociability > 0.5 ? 'ช่างเข้าสังคม' : 'ชอบอยู่คนเดียว');
  return traits.join(' · ');
}
