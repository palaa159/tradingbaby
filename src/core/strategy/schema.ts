/**
 * Validation for student-authored strategy JSON (spec §14.6, carried from P1).
 *
 * This is the boundary between "an LLM wrote some text" and "the deterministic
 * engine will execute this forever". Anything malformed must die here with a
 * message the student can learn from, not deeper in where it becomes a silent
 * wrong answer.
 */

import { z } from 'zod';

const indicatorName = z.enum([
  'price',
  'volume',
  'rsi',
  'sma',
  'ema',
  'vol_sma',
  'hammer',
  'shooting_star',
  'doji',
  'engulfing_bullish',
  'engulfing_bearish',
]);

/** Shape patterns take no period — flag it rather than silently ignoring it. */
const PATTERNS = ['hammer', 'shooting_star', 'doji', 'engulfing_bullish', 'engulfing_bearish'];

const operand = z.union([
  z.object({
    kind: z.literal('indicator'),
    name: indicatorName,
    period: z.number().int().min(2).max(200).optional(),
  }),
  z.object({ kind: z.literal('number'), value: z.number().finite() }),
]);

const condition = z.object({
  left: operand,
  op: z.enum(['<', '<=', '>', '>=', 'crosses_above', 'crosses_below']),
  right: operand,
});

export const strategySpecSchema = z
  .object({
    name: z
      .string()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9][a-z0-9-]*$/, 'ชื่อสูตรใช้ a-z 0-9 และ - เท่านั้น'),
    symbols: z.array(z.string().min(3)).min(1).max(10),
    timeframe: z.enum(['1h', '4h', '1d']),
    // Omitted means long, so specs written before the academy allowed shorting
    // still mean what they were tested to mean (build contract §9.5).
    direction: z.enum(['long', 'short']).optional(),
    entry: z.array(condition).min(1).max(4),
    exit: z.array(condition).max(4),
    sizePct: z.number().min(1).max(100),
  })
  .strict();

export type ValidationResult =
  | { ok: true; spec: z.infer<typeof strategySpecSchema> }
  | { ok: false; errors: string[]; example: unknown };

/**
 * A spec that validates, handed back with every rejection.
 *
 * A live student spent nine attempts and most of a cycle guessing the operand
 * shape from "Invalid input", then gave up and read this file's source. Showing
 * the answer costs a few lines and saves the student's whole budget.
 */
const WORKING_EXAMPLE = {
  name: 'rsi-dip',
  symbols: ['BTC/USDT'],
  timeframe: '1h',
  direction: 'long',
  entry: [
    {
      left: { kind: 'indicator', name: 'rsi', period: 14 },
      op: '<',
      right: { kind: 'number', value: 30 },
    },
  ],
  exit: [
    {
      left: { kind: 'indicator', name: 'rsi', period: 14 },
      op: '>',
      right: { kind: 'number', value: 70 },
    },
  ],
  sizePct: 20,
};

const OPERAND_HELP =
  'ทั้งสองข้างของเงื่อนไขต้องเป็นวัตถุ ไม่ใช่ชื่อเปล่าหรือตัวเลขเปล่า — ' +
  'ใช้ {"kind":"indicator","name":"rsi","period":14} หรือ {"kind":"number","value":30}';

/**
 * Zod reports a failed union as "Invalid input", which tells the student
 * nothing about the shape it wanted. Where the path says which shape was meant,
 * say so.
 */
function explain(path: string, message: string): string {
  if (message !== 'Invalid input') return message;
  if (/^(entry|exit)\.\d+\.(left|right)$/.test(path)) return OPERAND_HELP;
  if (/^(entry|exit)\.\d+$/.test(path)) {
    return 'เงื่อนไขหนึ่งข้อต้องเป็น {"left":…, "op":"<"|"<="|">"|">="|"crosses_above"|"crosses_below", "right":…}';
  }
  return message;
}

export function validateSpec(input: unknown): ValidationResult {
  const parsed = strategySpecSchema.safeParse(input);
  if (parsed.success) return { ok: true, spec: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((issue) => {
      const path = issue.path.join('.');
      const message = explain(path, issue.message);
      return path ? `${path}: ${message}` : message;
    }),
    example: WORKING_EXAMPLE,
  };
}

/**
 * A spec can be well-formed and still nonsense. These are the mistakes worth
 * catching before a student spends a backtest on them.
 */
export function reviewSpec(spec: z.infer<typeof strategySpecSchema>, allowedSymbols: string[]): string[] {
  const warnings: string[] = [];

  const outside = spec.symbols.filter((s) => !allowedSymbols.includes(s));
  if (outside.length > 0) {
    warnings.push(`เหรียญนอกรายชื่อที่อนุญาต: ${outside.join(', ')} — จะไม่มีการเทรดเกิดขึ้น`);
  }
  if (spec.exit.length === 0) {
    warnings.push('ไม่มีเงื่อนไขออก — เข้าแล้วจะถือยาวตลอดไป ตั้งใจแบบนั้นจริงหรือ');
  }
  if (spec.direction === undefined) {
    warnings.push(
      'ไม่ได้ระบุฝั่ง — จะถือว่าเล่นขาขึ้น (long) ถ้าตั้งใจเล่นขาลงต้องใส่ direction: "short"',
    );
  }
  for (const [i, c] of spec.entry.entries()) {
    if (c.left.kind === 'number' && c.right.kind === 'number') {
      warnings.push(`entry[${i}]: เทียบตัวเลขกับตัวเลข ผลลัพธ์เหมือนกันทุกแท่ง ไม่ได้ดูตลาดเลย`);
    }
    for (const side of [c.left, c.right]) {
      if (side.kind === 'indicator' && PATTERNS.includes(side.name) && side.period !== undefined) {
        warnings.push(
          `entry[${i}]: ${side.name} เป็นรูปทรงแท่งเทียน ไม่ต้องใส่ period — ค่า period ถูกมองข้าม`,
        );
      }
    }
  }
  return warnings;
}
