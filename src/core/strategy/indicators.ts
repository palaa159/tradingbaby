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
