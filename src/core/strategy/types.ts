/**
 * Strategy DSL (spec §6.2, §14.6).
 *
 * A rule language rather than sandboxed code: safe to execute, cheap to
 * validate, trivial to replay, and readable by the maker in the dashboard.
 * Students author these as JSON; the engine is the only thing that runs them.
 */

export type IndicatorName =
  | 'price'
  | 'volume'
  | 'rsi'
  | 'sma'
  | 'ema'
  /** Average volume over `period` bars — for "volume above its average". */
  | 'vol_sma'
  /** Candlestick shapes. Each returns 1 on a matching bar, otherwise 0. */
  | 'hammer'
  | 'shooting_star'
  | 'doji'
  | 'engulfing_bullish'
  | 'engulfing_bearish';

export type Operand =
  | { kind: 'indicator'; name: IndicatorName; period?: number | undefined }
  | { kind: 'number'; value: number };

export type CompareOp = '<' | '<=' | '>' | '>=' | 'crosses_above' | 'crosses_below';

export interface Condition {
  left: Operand;
  op: CompareOp;
  right: Operand;
}

/**
 * Which way the strategy bets. `long` profits when price rises, `short` when it
 * falls; the rules themselves read the same either way (spec §6, rule 9).
 *
 * The academy has no opinion on which is better — a toolchain that can only
 * express one side would let students "discover" only that side, which is not
 * discovery.
 */
export type TradeDirection = 'long' | 'short';

/**
 * Entry conditions are ANDed; exit conditions are ORed. Deliberately not a
 * general boolean tree — that shape covers real strategies and keeps both the
 * evaluator and the student's mental model simple.
 */
export interface StrategySpec {
  name: string;
  symbols: string[];
  /** Candle interval the rules read, e.g. "1h", "4h". */
  timeframe: string;
  /**
   * Omitted means `long`, so every strategy written before the academy allowed
   * shorting keeps the meaning it was tested with (build contract §9.5).
   */
  direction?: TradeDirection | undefined;
  entry: Condition[];
  exit: Condition[];
  /** Position size as a percent of portfolio value, 0–100. */
  sizePct: number;
}

/** The side a spec bets on, with the historical default applied. */
export function directionOf(spec: StrategySpec): TradeDirection {
  return spec.direction ?? 'long';
}

export type StrategyStatus = 'active' | 'retired';

/** An activated strategy is immutable — changes ship as a new version. */
export interface StrategyVersion {
  id: string;
  studentId: string;
  version: number;
  spec: StrategySpec;
  status: StrategyStatus;
  /** Hypothesis nodes this was compiled from (spec §4.4). */
  fromHypothesisIds: string[];
  activatedAt: number;
  retiredAt?: number;
}

export type OrderSide = 'buy' | 'sell';

export interface Order {
  symbol: string;
  side: OrderSide;
  /**
   * Whether this starts a position or ends one. Once shorting exists the side
   * alone no longer says: a `sell` opens a short and closes a long, and the
   * difference decides whether risk is being taken on or handed back.
   */
  intent: 'open' | 'close';
  /** Fraction of portfolio value when opening; fraction of the position when closing. */
  sizePct: number;
  reason: string;
}

/** Everything an evaluation reads. Recorded verbatim so replay is exact. */
export interface EvaluationInput {
  symbol: string;
  /** Oldest first; the last candle is the one being decided on. */
  candles: Candle[];
  position: Position | null;
  portfolioValue: number;
}

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
}

export interface EvaluationResult {
  orders: Order[];
  /** Indicator values that drove the decision — shown in the decision trace. */
  readings: Record<string, number>;
}
