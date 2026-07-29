/**
 * The strategy evaluator — the only thing in the system allowed to produce
 * orders (spec §6.2). No LLM call, no clock read, no randomness: given the same
 * spec and the same EvaluationInput it returns the same orders forever.
 */

import { closes, ema, rsi, sma, type Series } from './indicators.ts';
import type {
  Candle,
  Condition,
  EvaluationInput,
  EvaluationResult,
  Operand,
  Order,
  StrategySpec,
} from './types.ts';

/** `crosses_*` needs the previous bar too, so operands resolve as a pair. */
interface Reading {
  now: number | undefined;
  prev: number | undefined;
  label: string;
}

function series(candles: Candle[], operand: Operand): Reading {
  if (operand.kind === 'number') {
    return { now: operand.value, prev: operand.value, label: String(operand.value) };
  }
  const period = operand.period ?? 14;
  const label = operand.period ? `${operand.name}(${period})` : operand.name;

  let values: Series;
  switch (operand.name) {
    case 'price':
      values = candles.map((c) => c.close);
      break;
    case 'volume':
      values = candles.map((c) => c.volume);
      break;
    case 'sma':
      values = sma(closes(candles), period);
      break;
    case 'ema':
      values = ema(closes(candles), period);
      break;
    case 'rsi':
      values = rsi(closes(candles), period);
      break;
  }
  return { now: values[values.length - 1], prev: values[values.length - 2], label };
}

function holds(condition: Condition, candles: Candle[], readings: Record<string, number>): boolean {
  const left = series(candles, condition.left);
  const right = series(candles, condition.right);
  if (left.now !== undefined) readings[left.label] = round(left.now);
  if (right.now !== undefined) readings[right.label] = round(right.now);

  if (left.now === undefined || right.now === undefined) return false;

  switch (condition.op) {
    case '<':
      return left.now < right.now;
    case '<=':
      return left.now <= right.now;
    case '>':
      return left.now > right.now;
    case '>=':
      return left.now >= right.now;
    case 'crosses_above':
      if (left.prev === undefined || right.prev === undefined) return false;
      return left.prev <= right.prev && left.now > right.now;
    case 'crosses_below':
      if (left.prev === undefined || right.prev === undefined) return false;
      return left.prev >= right.prev && left.now < right.now;
  }
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function describe(conditions: Condition[]): string {
  return conditions
    .map((c) => {
      const side = (o: Operand) =>
        o.kind === 'number' ? String(o.value) : o.period ? `${o.name}(${o.period})` : o.name;
      return `${side(c.left)} ${c.op} ${side(c.right)}`;
    })
    .join(' และ ');
}

export function evaluate(spec: StrategySpec, input: EvaluationInput): EvaluationResult {
  const readings: Record<string, number> = {};
  const orders: Order[] = [];

  if (!spec.symbols.includes(input.symbol)) {
    return { orders, readings };
  }

  if (input.position) {
    // Exit conditions are ORed: any one of them closes the position.
    const fired = spec.exit.filter((c) => holds(c, input.candles, readings));
    if (fired.length > 0) {
      orders.push({
        symbol: input.symbol,
        side: 'sell',
        sizePct: 100,
        reason: `ออกเพราะ ${describe(fired)}`,
      });
    }
    return { orders, readings };
  }

  // Entry conditions are ANDed. Evaluate every one so all readings get recorded.
  const results = spec.entry.map((c) => holds(c, input.candles, readings));
  if (spec.entry.length > 0 && results.every(Boolean)) {
    orders.push({
      symbol: input.symbol,
      side: 'buy',
      sizePct: spec.sizePct,
      reason: `เข้าเพราะ ${describe(spec.entry)}`,
    });
  }
  return { orders, readings };
}
