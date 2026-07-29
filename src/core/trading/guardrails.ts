/**
 * House rules (spec §6.1).
 *
 * The maker sets these; the student can read them but never change them. They
 * run in paper trading too, so discipline is part of the upbringing rather than
 * something bolted on when real money appears.
 *
 * Size violations are clamped rather than rejected: a strategy asking for 50%
 * when the house allows 20% still trades — at 20 — and the trace says it was
 * clamped, which teaches the student something. Hard violations are refused
 * outright, because there is no smaller version of "shorting" or "kill switch".
 */

export interface GuardrailConfig {
  /** Max value of any single position, percent of portfolio. */
  maxPositionPct: number;
  /** Losing this much of the day's starting value halts trading until tomorrow. */
  maxDailyLossPct: number;
  /** Spot only. Shorting and leverage stay off in v1 (spec §13). */
  allowShort: boolean;
  allowLeverage: boolean;
  /** Maker halt — stops everything immediately. */
  killSwitch: boolean;
}

export const DEFAULT_GUARDRAILS: GuardrailConfig = {
  maxPositionPct: 20,
  maxDailyLossPct: 10,
  allowShort: false,
  allowLeverage: false,
  killSwitch: false,
};

export interface GuardrailContext {
  portfolioValue: number;
  /** Value already held in this symbol. */
  existingPositionValue: number;
  cash: number;
  /** Portfolio value at the start of today, for the daily-loss check. */
  startOfDayValue: number;
  /** Current portfolio value, for the daily-loss check. */
  currentValue: number;
  /** True when the order would sell more than is held. */
  wouldGoShort: boolean;
}

export type GuardrailOutcome =
  | { allowed: true; sizePct: number; clamped: boolean; note: string }
  | { allowed: false; reason: string };

export function checkOrder(
  requestedSizePct: number,
  side: 'buy' | 'sell',
  ctx: GuardrailContext,
  config: GuardrailConfig,
): GuardrailOutcome {
  if (config.killSwitch) {
    return { allowed: false, reason: 'ปุ่มหยุดฉุกเฉินถูกกด — ห้ามส่งคำสั่งทุกชนิด' };
  }

  if (ctx.wouldGoShort && !config.allowShort) {
    return { allowed: false, reason: 'ห้ามเก็งราคาลง (spot เท่านั้น) — ขายเกินที่ถืออยู่ไม่ได้' };
  }

  const dailyLossPct =
    ctx.startOfDayValue > 0 ? ((ctx.startOfDayValue - ctx.currentValue) / ctx.startOfDayValue) * 100 : 0;
  if (dailyLossPct >= config.maxDailyLossPct) {
    return {
      allowed: false,
      reason:
        `ขาดทุนวันนี้ ${dailyLossPct.toFixed(1)}% ถึงเพดาน ${config.maxDailyLossPct}% ` +
        '— หยุดเทรดจนถึงพรุ่งนี้',
    };
  }

  // Selling reduces risk; only buys are size-checked.
  if (side === 'sell') {
    return { allowed: true, sizePct: requestedSizePct, clamped: false, note: '' };
  }

  if (ctx.portfolioValue <= 0) {
    return { allowed: false, reason: 'พอร์ตไม่มีมูลค่าเหลือ — ซื้อไม่ได้' };
  }

  const heldPct = (ctx.existingPositionValue / ctx.portfolioValue) * 100;
  const roomPct = Math.max(0, config.maxPositionPct - heldPct);
  if (roomPct <= 0) {
    return {
      allowed: false,
      reason:
        `ถือ ${heldPct.toFixed(1)}% ของพอร์ตในเหรียญนี้แล้ว เต็มเพดาน ` +
        `${config.maxPositionPct}% — ซื้อเพิ่มไม่ได้`,
    };
  }

  const cashPct = (ctx.cash / ctx.portfolioValue) * 100;
  if (cashPct <= 0 && !config.allowLeverage) {
    return { allowed: false, reason: 'เงินสดหมด และห้ามยืมเงินเทรด' };
  }

  // Never spend more cash than exists — that would be leverage by accident.
  const affordablePct = config.allowLeverage ? roomPct : Math.min(roomPct, cashPct);
  const sizePct = Math.min(requestedSizePct, affordablePct);
  const clamped = sizePct < requestedSizePct;

  if (sizePct <= 0) {
    return { allowed: false, reason: 'ขนาดไม้ที่เหลือหลังหักกติกาเป็นศูนย์' };
  }

  return {
    allowed: true,
    sizePct,
    clamped,
    note: clamped
      ? `ลดขนาดไม้จาก ${requestedSizePct}% เหลือ ${sizePct.toFixed(1)}% ตามกติกาบ้าน`
      : '',
  };
}
