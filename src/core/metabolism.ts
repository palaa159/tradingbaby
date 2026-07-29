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
  /** Off in Phase 1 (nothing to earn yet); on from Phase 2 (spec §12). */
  suspensionEnabled: boolean;
  /** Energy per unit of realized P&L. */
  pnlToEnergyRate: number;
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
  // Trading exists from Phase 2, so students can feed themselves and
  // suspension becomes fair. Expulsion stays off by default (spec §14.5).
  suspensionEnabled: true,
  expulsionEnabled: false,
  // One unit of realized profit buys one cycle's worth of thinking.
  pnlToEnergyRate: 1,
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

/**
 * How many cycles a student may run today. Hunger buys fewer thoughts, but the
 * floor never drops to zero — a student with good strategies must be able to
 * eat its way back rather than spiral (spec §3.4).
 */
export function cycleBudget(hunger: HungerState, fullBudget: number): number {
  switch (hunger) {
    case 'well_fed':
      return fullBudget;
    case 'hungry':
      return Math.max(MIN_DAILY_CYCLES, Math.floor(fullBudget / 2));
    case 'starving':
      return MIN_DAILY_CYCLES;
    case 'suspended':
      return 0;
  }
}

export interface Settlement {
  energy: number;
  /** Realized P&L now accounted for; store it so the same profit is not eaten twice. */
  settledPnl: number;
  fed: number;
  suspended: boolean;
}

/**
 * Convert newly realized P&L into energy.
 *
 * Only the delta since the last settlement counts, so calling this repeatedly is
 * safe — a student cannot farm energy by having its books read twice.
 */
export function settle(
  energy: number,
  previouslySettledPnl: number,
  realizedPnlNow: number,
  config: MetabolismConfig,
  pnlToEnergyRate: number,
): Settlement {
  const delta = realizedPnlNow - previouslySettledPnl;
  const fed = delta * pnlToEnergyRate;
  const next = Math.max(0, energy + fed);
  return {
    energy: next,
    settledPnl: realizedPnlNow,
    fed,
    suspended: next <= 0 && config.suspensionEnabled,
  };
}
