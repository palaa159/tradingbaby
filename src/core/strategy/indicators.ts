/**
 * Indicator math. Pure functions over candle arrays — no clock, no randomness,
 * no I/O, so the same candles always produce the same numbers (spec §6.2).
 *
 * Each returns a series aligned to the input candles, with `undefined` where
 * there is not enough history yet. Callers read the last defined value.
 */

import type { Candle } from './types.ts';

export type Series = (number | undefined)[];

export function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(undefined);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] as number;
    if (i >= period) sum -= values[i - period] as number;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(undefined);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i] as number;
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (values[i] as number) * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's RSI — the standard smoothing, so numbers match what students read online. */
export function rsi(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(undefined);
  if (period <= 0 || values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = (values[i] as number) - (values[i - 1] as number);
    if (change >= 0) gain += change;
    else loss -= change;
  }
  gain /= period;
  loss /= period;
  out[period] = rsiFrom(gain, loss);

  for (let i = period + 1; i < values.length; i++) {
    const change = (values[i] as number) - (values[i - 1] as number);
    const up = change > 0 ? change : 0;
    const down = change < 0 ? -change : 0;
    gain = (gain * (period - 1) + up) / period;
    loss = (loss * (period - 1) + down) / period;
    out[i] = rsiFrom(gain, loss);
  }
  return out;
}

function rsiFrom(gain: number, loss: number): number {
  if (loss === 0) return gain === 0 ? 50 : 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

// ---------- candlestick patterns ----------
//
// Added because a student learned Hammer, Doji, and Shooting Star from the
// internet, wrote a hypothesis about them, and discovered the DSL could not
// express any of it. These return 1 or 0 per bar so they compose with the
// existing comparison operators — `hammer > 0` — rather than needing new syntax.

function body(candle: Candle): number {
  return Math.abs(candle.close - candle.open);
}

function upperShadow(candle: Candle): number {
  return candle.high - Math.max(candle.open, candle.close);
}

function lowerShadow(candle: Candle): number {
  return Math.min(candle.open, candle.close) - candle.low;
}

function range(candle: Candle): number {
  return candle.high - candle.low;
}

/**
 * Long lower shadow, small body near the top — the market rejected lower
 * prices. Shape only: the "in a downtrend" half of the classic definition is
 * left to the student to add as a separate condition, which keeps each
 * primitive honest about what it actually checks.
 */
export function hammer(candles: Candle[]): Series {
  return candles.map((c) => {
    const r = range(c);
    if (r <= 0) return 0;
    const b = body(c);
    // Shadows are judged against the bar's range, not against the body. Judging
    // them against the body breaks exactly where hammers live: a tiny body makes
    // `body * k` tiny, so any upper wick at all disqualifies a textbook hammer.
    const isHammer =
      lowerShadow(c) >= b * 2 &&
      lowerShadow(c) >= r * 0.5 &&
      upperShadow(c) <= r * 0.15 &&
      b / r < 0.4;
    return isHammer ? 1 : 0;
  });
}

/** The mirror image: rejection of higher prices. */
export function shootingStar(candles: Candle[]): Series {
  return candles.map((c) => {
    const r = range(c);
    if (r <= 0) return 0;
    const b = body(c);
    const isStar =
      upperShadow(c) >= b * 2 &&
      upperShadow(c) >= r * 0.5 &&
      lowerShadow(c) <= r * 0.15 &&
      b / r < 0.4;
    return isStar ? 1 : 0;
  });
}

/** Open and close within a whisker of each other — indecision. */
export function doji(candles: Candle[]): Series {
  return candles.map((c) => {
    const r = range(c);
    if (r <= 0) return 0;
    return body(c) / r <= 0.1 ? 1 : 0;
  });
}

/** This bar's body swallows the previous one, in the opposite direction. */
export function engulfing(candles: Candle[], direction: 'bullish' | 'bearish'): Series {
  return candles.map((c, i) => {
    const prev = candles[i - 1];
    if (!prev) return 0;
    const prevUp = prev.close > prev.open;
    const up = c.close > c.open;
    if (direction === 'bullish' && (prevUp || !up)) return 0;
    if (direction === 'bearish' && (!prevUp || up)) return 0;
    const covers =
      Math.max(c.open, c.close) >= Math.max(prev.open, prev.close) &&
      Math.min(c.open, c.close) <= Math.min(prev.open, prev.close);
    return covers && body(c) > body(prev) ? 1 : 0;
  });
}

/** Average volume over a window — for "volume above its 20-bar average". */
export function volumeSma(candles: Candle[], period: number): Series {
  return sma(
    candles.map((c) => c.volume),
    period,
  );
}
