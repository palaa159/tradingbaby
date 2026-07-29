import assert from 'node:assert/strict';
import { test } from 'bun:test';

import { checkOrder, DEFAULT_GUARDRAILS, type GuardrailContext } from './guardrails.ts';
import { portfolioValue, replayFills, unrealizedPnl, type Fill } from './portfolio.ts';

function fill(over: Partial<Fill>): Fill {
  return { at: 1, symbol: 'BTC/USDT', side: 'buy', quantity: 1, price: 100, fee: 0, ...over };
}

test('a round trip realizes the spread minus fees', () => {
  const state = replayFills(1000, [
    fill({ side: 'buy', quantity: 2, price: 100, fee: 1 }),
    fill({ side: 'sell', quantity: 2, price: 120, fee: 1, at: 2 }),
  ]);
  assert.equal(state.holdings.size, 0);
  // cost 200 + 1 fee = 201; proceeds 240 - 1 = 239
  assert.equal(Math.round(state.realizedPnl), 38);
  assert.equal(state.feesPaid, 2);
  assert.equal(Math.round(state.cash), 1038);
});

test('averaging up moves the cost basis, fees included', () => {
  const state = replayFills(1000, [
    fill({ side: 'buy', quantity: 1, price: 100 }),
    fill({ side: 'buy', quantity: 1, price: 200, at: 2 }),
  ]);
  const held = state.holdings.get('BTC/USDT');
  assert.equal(held?.quantity, 2);
  assert.equal(held?.avgPrice, 150);
});

test('partial sells keep the remainder at the same basis', () => {
  const state = replayFills(1000, [
    fill({ side: 'buy', quantity: 4, price: 100 }),
    fill({ side: 'sell', quantity: 1, price: 150, at: 2 }),
  ]);
  const held = state.holdings.get('BTC/USDT');
  assert.equal(held?.quantity, 3);
  assert.equal(held?.avgPrice, 100);
  assert.equal(state.realizedPnl, 50);
});

test('selling more than held cannot go short', () => {
  const state = replayFills(1000, [
    fill({ side: 'buy', quantity: 1, price: 100 }),
    fill({ side: 'sell', quantity: 5, price: 100, at: 2 }),
  ]);
  assert.equal(state.holdings.size, 0, 'position closed, not flipped negative');
  assert.equal(state.cash, 1000, 'only the held unit was sold');
});

test('valuation marks to market and unrealized tracks the move', () => {
  const state = replayFills(1000, [fill({ side: 'buy', quantity: 2, price: 100 })]);
  assert.equal(portfolioValue(state, { 'BTC/USDT': 150 }), 800 + 300);
  assert.equal(unrealizedPnl(state, { 'BTC/USDT': 150 }), 100);
  // Missing price falls back to cost basis, so value stays flat rather than vanishing.
  assert.equal(portfolioValue(state, {}), 1000);
});

function ctx(over: Partial<GuardrailContext> = {}): GuardrailContext {
  return {
    portfolioValue: 1000,
    existingPositionValue: 0,
    cash: 1000,
    startOfDayValue: 1000,
    currentValue: 1000,
    wouldGoShort: false,
    ...over,
  };
}

test('oversized buys are clamped to the house limit, not rejected', () => {
  const out = checkOrder(50, 'buy', ctx(), DEFAULT_GUARDRAILS);
  assert.equal(out.allowed, true);
  if (!out.allowed) return;
  assert.equal(out.sizePct, 20);
  assert.equal(out.clamped, true);
  assert.ok(out.note.includes('ลดขนาดไม้'));
});

test('a full position blocks further buying but selling stays open', () => {
  const full = ctx({ existingPositionValue: 200 });
  const buy = checkOrder(5, 'buy', full, DEFAULT_GUARDRAILS);
  assert.equal(buy.allowed, false);

  const sell = checkOrder(100, 'sell', full, DEFAULT_GUARDRAILS);
  assert.equal(sell.allowed, true, 'reducing risk is never blocked by position size');
});

test('buying never exceeds cash — no accidental leverage', () => {
  const broke = ctx({ cash: 50 }); // 5% of the portfolio
  const out = checkOrder(20, 'buy', broke, DEFAULT_GUARDRAILS);
  assert.equal(out.allowed, true);
  if (!out.allowed) return;
  assert.equal(out.sizePct, 5);
  assert.equal(out.clamped, true);
});

test('the daily loss cap halts trading for the day', () => {
  const bad = ctx({ currentValue: 890 }); // −11% against a 10% cap
  const out = checkOrder(5, 'buy', bad, DEFAULT_GUARDRAILS);
  assert.equal(out.allowed, false);
  if (out.allowed) return;
  assert.ok(out.reason.includes('หยุดเทรด'));

  // Selling is refused too: the halt is about the day, not about direction.
  assert.equal(checkOrder(100, 'sell', bad, DEFAULT_GUARDRAILS).allowed, false);
});

test('shorting is refused outright, never clamped', () => {
  const out = checkOrder(100, 'sell', ctx({ wouldGoShort: true }), DEFAULT_GUARDRAILS);
  assert.equal(out.allowed, false);
  if (out.allowed) return;
  assert.ok(out.reason.includes('spot'));
});

test('the kill switch beats everything, including sells', () => {
  const halted = { ...DEFAULT_GUARDRAILS, killSwitch: true };
  assert.equal(checkOrder(1, 'buy', ctx(), halted).allowed, false);
  assert.equal(checkOrder(100, 'sell', ctx(), halted).allowed, false);
});
