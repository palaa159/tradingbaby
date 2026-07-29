/**
 * Metabolism — "profit is food" (spec §3.4).
 *
 * Phase 1 rules: energy burns with activity and hunger states are computed,
 * but suspension is DISABLED (spec §12 Phase 1) — students cannot earn yet,
 * so hunger is display/diary-only until trading arrives in Phase 2.
 */

import type { HungerState } from './types.ts';

export interface MetabolismConfig {
  /** Starting allowance (ค่าขนมแรกเข้า). Default sized to last ~90 days (spec §14.5). */
  startingAllowance: number;
  /** Energy cost per activity kind. */
  costs: {
    shortCycle: number;
    dailyReview: number;
    webResearch: number;
    schoolSession: number; // Phase 2
    backtest: number; // Phase 2
  };
  /** Fraction of remaining energy marking each hunger threshold. */
  thresholds: {
    hungry: number; // below this fraction → hungry
    starving: number; // below this fraction → starving
  };
  /** Phase 1: false. Phase 2+: true (spec §12). */
  suspensionEnabled: boolean;
  /** Expulsion (คัดออก) — off by default (spec §14.5). */
  expulsionEnabled: boolean;
}

/**
 * Defaults sized so `startingAllowance` covers ~90 days of normal activity:
 * per day ≈ 4 short cycles (4×1) + 1 daily review (3) + 2 research (2×1.5) = 10.
 */
export const DEFAULT_METABOLISM: MetabolismConfig = {
  startingAllowance: 900,
  costs: {
    shortCycle: 1,
    dailyReview: 3,
    webResearch: 1.5,
    schoolSession: 2,
    backtest: 2,
  },
  thresholds: {
    hungry: 0.5,
    starving: 0.15,
  },
  suspensionEnabled: false,
  expulsionEnabled: false,
};

export function hungerState(energy: number, config: MetabolismConfig): HungerState {
  if (energy <= 0) {
    return config.suspensionEnabled ? 'suspended' : 'starving';
  }
  const fraction = energy / config.startingAllowance;
  if (fraction < config.thresholds.starving) return 'starving';
  if (fraction < config.thresholds.hungry) return 'hungry';
  return 'well_fed';
}

/** Burn energy for an activity. Energy never goes below zero. */
export function burn(
  energy: number,
  activity: keyof MetabolismConfig['costs'],
  config: MetabolismConfig,
): number {
  return Math.max(0, energy - config.costs[activity]);
}

/** Feed from realized P&L (Phase 2+). Losses drain; gains feed. */
export function feed(energy: number, realizedPnl: number, pnlToEnergyRate: number): number {
  return Math.max(0, energy + realizedPnl * pnlToEnergyRate);
}

/**
 * Survival guarantee (spec §3.4 "ทางรอดมีเสมอ"): even a starving student gets
 * a minimum daily cycle; active strategies keep running at zero AI cost.
 */
export const MIN_DAILY_CYCLES = 1;
