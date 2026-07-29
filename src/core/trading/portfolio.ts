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
  quantity: number;
  /** Cost basis per unit, fees included. */
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

/** Apply one fill. Sells realize P&L against the average cost basis. */
export function applyFill(state: PortfolioState, fill: Fill): PortfolioState {
  const holdings = new Map(state.holdings);
  const existing = holdings.get(fill.symbol);
  let { cash, realizedPnl, feesPaid } = state;
  feesPaid += fill.fee;

  if (fill.side === 'buy') {
    cash -= fill.quantity * fill.price + fill.fee;
    const quantity = (existing?.quantity ?? 0) + fill.quantity;
    const priorCost = (existing?.quantity ?? 0) * (existing?.avgPrice ?? 0);
    const avgPrice = quantity > 0 ? (priorCost + fill.quantity * fill.price + fill.fee) / quantity : 0;
    holdings.set(fill.symbol, { symbol: fill.symbol, quantity, avgPrice });
  } else {
    const held = existing?.quantity ?? 0;
    // Spot only (spec §6.1): you cannot sell what you do not hold.
    const quantity = Math.min(fill.quantity, held);
    const basis = (existing?.avgPrice ?? 0) * quantity;
    const proceeds = quantity * fill.price - fill.fee;
    cash += proceeds;
    realizedPnl += proceeds - basis;
    const left = held - quantity;
    if (left > 1e-12 && existing) {
      holdings.set(fill.symbol, { ...existing, quantity: left });
    } else {
      holdings.delete(fill.symbol);
    }
  }

  return { cash, holdings, realizedPnl, feesPaid };
}

export function replayFills(startingCash: number, fills: readonly Fill[]): PortfolioState {
  let state = emptyPortfolio(startingCash);
  for (const fill of fills) state = applyFill(state, fill);
  return state;
}

/** Mark-to-market value. Missing prices count a holding at its cost basis. */
export function portfolioValue(state: PortfolioState, prices: Record<string, number>): number {
  let value = state.cash;
  for (const holding of state.holdings.values()) {
    const price = prices[holding.symbol] ?? holding.avgPrice;
    value += holding.quantity * price;
  }
  return value;
}

export function unrealizedPnl(state: PortfolioState, prices: Record<string, number>): number {
  let pnl = 0;
  for (const holding of state.holdings.values()) {
    const price = prices[holding.symbol];
    if (price === undefined) continue;
    pnl += (price - holding.avgPrice) * holding.quantity;
  }
  return pnl;
}
