/**
 * Paper portfolio (Phase 2 P3).
 *
 * State is derived, never stored: replay the fills and you get the portfolio,
 * the same way replaying the event log gives you a brain. One source of truth
 * per concept, so the two can never disagree.
 */

export interface Fill {
  at: number;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
}

export interface Holding {
  symbol: string;
  /** Signed: positive when long, negative when short (spec §6, rule 9). */
  quantity: number;
  /**
   * Break-even price per unit, fees included. For a long this is what you paid;
   * for a short it is what you received. Either way the position makes money
   * when the market moves away from it in your favour.
   */
  avgPrice: number;
}

export interface PortfolioState {
  cash: number;
  holdings: Map<string, Holding>;
  realizedPnl: number;
  feesPaid: number;
}

export function emptyPortfolio(startingCash: number): PortfolioState {
  return { cash: startingCash, holdings: new Map(), realizedPnl: 0, feesPaid: 0 };
}

/**
 * Apply one fill, either side of the market.
 *
 * A fill never flips a position through zero: it closes at most what is open,
 * and a reversal ships as two orders. That keeps the cost basis unambiguous —
 * there is no bar on which one number has to mean both the price you paid and
 * the price you received.
 */
export function applyFill(state: PortfolioState, fill: Fill): PortfolioState {
  const holdings = new Map(state.holdings);
  const existing = holdings.get(fill.symbol);
  const held = existing?.quantity ?? 0;
  const avg = existing?.avgPrice ?? 0;

  const direction = fill.side === 'buy' ? 1 : -1;
  const adding = held === 0 || Math.sign(held) === direction;
  const quantity = adding ? fill.quantity : Math.min(fill.quantity, Math.abs(held));

  // Cash moves against the trade; the fee always costs you, whichever way you went.
  const gross = quantity * fill.price;
  const cash = state.cash + (fill.side === 'buy' ? -gross : gross) - fill.fee;
  const feesPaid = state.feesPaid + fill.fee;
  let realizedPnl = state.realizedPnl;

  let next: Holding | null = null;
  if (adding) {
    // The opening fee rolls into the basis so it is counted once — here, and
    // not again at exit.
    const unitCost = quantity > 0 ? (gross + direction * fill.fee) / quantity : fill.price;
    const total = held + direction * quantity;
    if (Math.abs(total) > 1e-12) {
      next = {
        symbol: fill.symbol,
        quantity: total,
        avgPrice: (Math.abs(held) * avg + quantity * unitCost) / Math.abs(total),
      };
    }
  } else {
    // A long earns when the price rises above its basis; a short when it falls
    // below. The closing fee comes off whichever it was.
    const perUnit = held > 0 ? fill.price - avg : avg - fill.price;
    realizedPnl += perUnit * quantity - fill.fee;
    const left = held + direction * quantity;
    if (Math.abs(left) > 1e-12 && existing) next = { ...existing, quantity: left };
  }

  if (next) holdings.set(fill.symbol, next);
  else holdings.delete(fill.symbol);

  return { cash, holdings, realizedPnl, feesPaid };
}

export function replayFills(startingCash: number, fills: readonly Fill[]): PortfolioState {
  let state = emptyPortfolio(startingCash);
  for (const fill of fills) state = applyFill(state, fill);
  return state;
}

/**
 * Mark-to-market value. Missing prices count a holding at its cost basis.
 * A short's quantity is negative, so it subtracts here — which is exactly what
 * owing the asset means.
 */
export function portfolioValue(state: PortfolioState, prices: Record<string, number>): number {
  let value = state.cash;
  for (const holding of state.holdings.values()) {
    const price = prices[holding.symbol] ?? holding.avgPrice;
    value += holding.quantity * price;
  }
  return value;
}

/**
 * Open profit. The signed quantity does the work: for a short, a price below
 * the basis gives a negative move times a negative size, which is a gain.
 */
export function unrealizedPnl(state: PortfolioState, prices: Record<string, number>): number {
  let pnl = 0;
  for (const holding of state.holdings.values()) {
    const price = prices[holding.symbol];
    if (price === undefined) continue;
    pnl += (price - holding.avgPrice) * holding.quantity;
  }
  return pnl;
}
