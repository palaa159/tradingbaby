/**
 * The strategy runner (spec §6.2, §10) — trades without spending an AI token.
 *
 *   bun run trader -- --db=academy.db
 *
 * Wakes shortly after each hourly candle closes, drops the bar still forming,
 * and gives every student's active strategies exactly one look at each closed
 * bar. Deliberately a separate process from the daemon: thinking is rationed
 * by the subscription quota, trading is not, and a student that has run out of
 * energy should still be earning from the rules it already proved.
 */

import type { Candle } from '../core/strategy/types.ts';
import { DEFAULT_ACADEMY } from './academyConfig.ts';
import { openAcademyDb, StudentStore } from './db/sqliteStore.ts';
import { StrategyStore } from './db/strategyStore.ts';
import { TradingStore } from './db/tradingStore.ts';
import { defaultMarketData } from './marketData.ts';
import { dayKey, msUntilNextBar } from './scheduler.ts';
import { tradingRound } from './trading/round.ts';
import { Metabolism } from './trading/settlement.ts';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const config = DEFAULT_ACADEMY;
const db = openAcademyDb(arg('db') ?? 'academy.db');
const students = new StudentStore(db);
const strategies = new StrategyStore(db);
const trading = new TradingStore(db);
const metabolism = new Metabolism(db, config.metabolism);
const market = defaultMarketData(config.universe);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function closedCandles(): Promise<Record<string, Candle[]>> {
  const out: Record<string, Candle[]> = {};
  for (const symbol of config.universe) {
    try {
      const bars = await market.history(symbol, config.trading.historyBars);
      // Drop the bar still forming. A strategy must never see the same bar
      // twice with different numbers, or §6.2's replay guarantee is a lie.
      if (bars.length > 1) out[symbol] = bars.slice(0, -1);
    } catch (error) {
      console.error(`ดึงราคา ${symbol} ไม่ได้: ${error instanceof Error ? error.message : error}`);
    }
  }
  return out;
}

async function round(): Promise<void> {
  const at = Date.now();
  const candles = await closedCandles();
  if (Object.keys(candles).length === 0) {
    console.error(`[${new Date(at).toISOString()}] ไม่มีข้อมูลราคาเลย — ข้ามรอบนี้`);
    return;
  }

  const results = tradingRound(
    {
      studentIds: students.list().map((s) => s.id),
      candles,
      at,
      day: dayKey(at),
      metabolism: config.metabolism,
      guardrails: config.trading.guardrails,
      feeRate: config.trading.feeRate,
      fullCycleBudget: config.schedule.shortCyclesPerDay,
    },
    strategies,
    trading,
    metabolism,
  );

  const names = new Map(students.list().map((s) => [s.id, s.name]));
  for (const r of results) {
    const name = names.get(r.studentId) ?? r.studentId;
    if (!r.settlement) {
      console.log(`[${new Date(at).toISOString()}] ${name} — พักการเรียนอยู่ ไม่เทรด`);
      continue;
    }
    console.log(
      `[${new Date(at).toISOString()}] ${name} — ซื้อขาย ${r.filled} · ถูกกฎบ้านห้าม ${r.blocked} · ` +
        `พอร์ต ${r.portfolioValue.toFixed(2)} · พลังงาน ${r.settlement.energy.toFixed(1)} ` +
        `(${r.settlement.hunger}) · ${r.settlement.note}`,
    );
  }
}

console.log(
  `📈 เครื่องรันสูตรเริ่มทำงาน — ${config.universe.length} เหรียญ, กราฟ 1 ชั่วโมง, ไม่ใช้ AI เลย`,
);

// One round at boot so a restart does not leave the market unwatched for an
// hour, then settle onto the candle clock.
for (;;) {
  try {
    await round();
  } catch (error) {
    console.error(`รอบเทรดล้ม: ${error instanceof Error ? error.stack : error}`);
  }
  await sleep(msUntilNextBar(Date.now()));
}
