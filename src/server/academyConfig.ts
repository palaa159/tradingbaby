/**
 * Academy configuration — everything the maker can tune (spec §8 Settings).
 * Values here are Phase 1 defaults; a real settings store arrives with M3/M5.
 */

import { DEFAULT_METABOLISM, type MetabolismConfig } from '../core/metabolism.ts';
import { DEFAULT_SCHEDULE, type SchedulerConfig } from './scheduler.ts';
import type { CycleModels } from './engine/studentAgent.ts';

export interface EnrollmentConfig {
  name: string;
  /** Personality is derived deterministically from this seed. */
  seed: string;
}

export interface AcademyConfig {
  students: EnrollmentConfig[];
  /** Maker-configured safe universe (spec §6). */
  universe: string[];
  metabolism: MetabolismConfig;
  schedule: SchedulerConfig;
  models: CycleModels;
}

export const DEFAULT_ACADEMY: AcademyConfig = {
  // Three students from day one — the hive library needs >=3 verifiers later
  // (spec §14.7), so the fleet starts at three.
  students: [
    { name: 'มะลิ', seed: 'mali-2026' },
    { name: 'ภูผา', seed: 'phupha-2026' },
    { name: 'ข้าวฟ่าง', seed: 'khaofang-2026' },
  ],
  universe: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT'],
  metabolism: DEFAULT_METABOLISM,
  schedule: DEFAULT_SCHEDULE,
  models: {
    short: 'claude-haiku-4-5',
    dailyReview: 'claude-sonnet-4-5',
  },
};
