/**
 * The benchmark student (spec §7) — "เด็กบ้านเรียน".
 *
 * A deliberately stupid bot: buy the universe in equal weights on day one and
 * never think again. It exists so the academy can tell skill from weather.
 * Making money in a bull market is not a grade; beating this thing is.
 */

export interface BenchmarkHolding {
  symbol: string;
  quantity: number;
}

export interface Benchmark {
  startedAt: number;
  startingCash: number;
  holdings: BenchmarkHolding[];
}

/**
 * Spend the whole allowance at once, split evenly across whatever the maker
 * allows. Fees are charged so the comparison is honest — the benchmark pays to
 * enter the market just like the student does.
 */
export function openBenchmark(
  startingCash: number,
  prices: Record<string, number>,
  startedAt: number,
  feeRate = 0.001,
): Benchmark {
  const symbols = Object.keys(prices).filter((s) => (prices[s] ?? 0) > 0).sort();
  if (symbols.length === 0) {
    return { startedAt, startingCash, holdings: [] };
  }
  const perSymbol = startingCash / symbols.length;
  return {
    startedAt,
    startingCash,
    holdings: symbols.map((symbol) => ({
      symbol,
      quantity: (perSymbol * (1 - feeRate)) / (prices[symbol] as number),
    })),
  };
}

/** Mark to market. A symbol with no current price is held at zero change. */
export function benchmarkValue(
  benchmark: Benchmark,
  prices: Record<string, number>,
  entryPrices: Record<string, number> = {},
): number {
  if (benchmark.holdings.length === 0) return benchmark.startingCash;
  let value = 0;
  for (const holding of benchmark.holdings) {
    const price = prices[holding.symbol] ?? entryPrices[holding.symbol];
    if (price === undefined) {
      // No information either way: count the slice at its original cost.
      value += benchmark.startingCash / benchmark.holdings.length;
      continue;
    }
    value += holding.quantity * price;
  }
  return value;
}

export function returnPct(startValue: number, endValue: number): number {
  if (startValue <= 0) return 0;
  return ((endValue - startValue) / startValue) * 100;
}

export interface AlphaReport {
  studentValue: number;
  studentReturnPct: number;
  benchmarkValue: number;
  benchmarkReturnPct: number;
  /** The grade: how much of the return was skill rather than the market. */
  alphaPct: number;
  verdict: 'ชนะตลาด' | 'แพ้ตลาด' | 'เสมอตลาด';
}

/**
 * Alpha over one window. Both sides start from the same cash on the same day
 * and pay the same fees, so the difference is the part the student is
 * responsible for.
 */
export function alphaReport(
  startingCash: number,
  studentValue: number,
  benchmark: Benchmark,
  prices: Record<string, number>,
): AlphaReport {
  const benchValue = benchmarkValue(benchmark, prices);
  const studentReturnPct = returnPct(startingCash, studentValue);
  const benchmarkReturnPct = returnPct(benchmark.startingCash, benchValue);
  const alphaPct = studentReturnPct - benchmarkReturnPct;
  return {
    studentValue,
    studentReturnPct,
    benchmarkValue: benchValue,
    benchmarkReturnPct,
    alphaPct,
    verdict: alphaPct > 0.5 ? 'ชนะตลาด' : alphaPct < -0.5 ? 'แพ้ตลาด' : 'เสมอตลาด',
  };
}
