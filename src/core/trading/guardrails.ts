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
 * outright, because there is no smaller version of "kill switch".
 *
 * Both sides of the market are allowed (spec §6, rule 9), and both are governed
 * by the same limits. What decides whether an order is size-checked is whether
 * it *opens* risk, not whether it says buy or sell: once shorting exists, a
 * sell can just as easily be the start of a position as the end of one.
 */

export interface GuardrailConfig {
  /** Max value of any single position, percent of portfolio — either side. */
  maxPositionPct: number;
  /** Losing this much of the day's starting value halts trading until tomorrow. */
  maxDailyLossPct: number;
  /** The maker's switch for the short side of the whole school. */
  allowShort: boolean;
  /** Borrowing stays off: size is still bounded by cash the student really has. */
  allowLeverage: boolean;
  /** Maker halt — stops everything immediately. */
  killSwitch: boolean;
}

export const DEFAULT_GUARDRAILS: GuardrailConfig = {
  maxPositionPct: 20,
  maxDailyLossPct: 10,
  allowShort: true,
  allowLeverage: false,
  killSwitch: false,
};

export interface GuardrailContext {
  portfolioValue: number;
  /** Signed value of the position in this symbol — negative when short. */
  existingPositionValue: number;
  cash: number;
  /** Portfolio value at the start of today, for the daily-loss check. */
  startOfDayValue: number;
  /** Current portfolio value, for the daily-loss check. */
  currentValue: number;
  /** True when the order would leave a net short position. */
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
    return { allowed: false, reason: 'คนสร้างปิดฝั่งลงไว้ — ขายเกินที่ถืออยู่ไม่ได้' };
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

  // Closing hands risk back and is always allowed; opening or adding to a
  // position is what the limits exist for. With shorting on, that distinction
  // no longer lines up with buy-versus-sell.
  const orderDirection = side === 'buy' ? 1 : -1;
  const positionDirection = Math.sign(ctx.existingPositionValue);
  const reducing = positionDirection !== 0 && positionDirection !== orderDirection;
  if (reducing) {
    return { allowed: true, sizePct: requestedSizePct, clamped: false, note: '' };
  }

  const opening = side === 'buy' ? 'ซื้อ' : 'เปิดฝั่งลง';
  if (ctx.portfolioValue <= 0) {
    return { allowed: false, reason: `พอร์ตไม่มีมูลค่าเหลือ — ${opening}ไม่ได้` };
  }

  // The cap is on size, not on side: a 20% short is as big a bet as a 20% long.
  const heldPct = (Math.abs(ctx.existingPositionValue) / ctx.portfolioValue) * 100;
  const roomPct = Math.max(0, config.maxPositionPct - heldPct);
  if (roomPct <= 0) {
    return {
      allowed: false,
      reason:
        `เปิดไม้ในเหรียญนี้ไว้ ${heldPct.toFixed(1)}% ของพอร์ตแล้ว เต็มเพดาน ` +
        `${config.maxPositionPct}% — เพิ่มอีกไม่ได้`,
    };
  }

  // Cash backs both sides. A short receives cash on open but still owes the
  // asset, so letting it size against money it does not have is leverage with
  // the label filed off.
  const cashPct = (ctx.cash / ctx.portfolioValue) * 100;
  if (cashPct <= 0 && !config.allowLeverage) {
    return { allowed: false, reason: 'เงินสดหมด และห้ามยืมเงินเทรด' };
  }

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
