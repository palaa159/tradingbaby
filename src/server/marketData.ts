/**
 * Market perception (read-only) — spec §6 + Phase 1 M4.
 * Students can only *see* the market in Phase 1; no orders exist yet.
 */

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketSnapshot {
  symbol: string;
  price: number;
  changePct24h: number;
  candles1h: Candle[]; // most recent last
  fetchedAt: number;
}

export interface MarketDataProvider {
  /** Symbols the academy allows (maker-configured universe, spec §6). */
  universe(): readonly string[];
  snapshot(symbol: string): Promise<MarketSnapshot>;
  /** Longer history for backtesting — a 48-bar snapshot proves nothing. */
  history(symbol: string, bars: number): Promise<Candle[]>;
}

/** Deterministic stub for tests — flat market, no network. */
export class StubMarketData implements MarketDataProvider {
  private readonly symbols: readonly string[];

  constructor(symbols: readonly string[] = ['BTC/USDT']) {
    this.symbols = symbols;
  }

  universe(): readonly string[] {
    return this.symbols;
  }

  async snapshot(symbol: string): Promise<MarketSnapshot> {
    return {
      symbol,
      price: 100,
      changePct24h: 0,
      candles1h: await this.history(symbol, 48),
      fetchedAt: 0,
    };
  }

  /** A deterministic oscillating series — enough shape for a backtest to bite. */
  async history(symbol: string, bars: number): Promise<Candle[]> {
    const seed = [...symbol].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 17;
    return Array.from({ length: bars }, (_, i) => {
      const close = 100 + Math.sin((i + seed) / 9) * 12 + Math.sin((i + seed) / 3.3) * 4;
      return {
        openTime: i * 3_600_000,
        open: close,
        high: close * 1.005,
        low: close * 0.995,
        close,
        volume: 100,
      };
    });
  }
}

/**
 * Free Binance public REST API (no key needed). ccxt can replace this later
 * behind the same interface without touching the engine.
 *
 * The base URL is a constructor argument because `api.binance.com` answers 451
 * from some regions — the `.us` host speaks the identical API and is the usual
 * way out of that.
 */
export class BinancePublicMarketData implements MarketDataProvider {
  private readonly symbols: readonly string[];
  private readonly baseUrl: string;

  constructor(symbols: readonly string[], baseUrl = 'https://api.binance.us') {
    this.symbols = symbols;
    this.baseUrl = baseUrl;
  }

  universe(): readonly string[] {
    return this.symbols;
  }

  async history(symbol: string, bars: number): Promise<Candle[]> {
    const pair = symbol.replace('/', '');
    const limit = Math.min(1000, Math.max(50, bars));
    const res = await fetch(`${this.baseUrl}/api/v3/klines?symbol=${pair}&interval=1h&limit=${limit}`);
    if (!res.ok) throw new Error(`binance history failed for ${symbol}: ${res.status}`);
    const klines = (await res.json()) as [number, string, string, string, string, string][];
    return klines.map((k) => ({
      openTime: k[0],
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
  }

  async snapshot(symbol: string): Promise<MarketSnapshot> {
    const pair = symbol.replace('/', '');
    const [tickerRes, klinesRes] = await Promise.all([
      fetch(`${this.baseUrl}/api/v3/ticker/24hr?symbol=${pair}`),
      fetch(`${this.baseUrl}/api/v3/klines?symbol=${pair}&interval=1h&limit=48`),
    ]);
    if (!tickerRes.ok || !klinesRes.ok) {
      throw new Error(`binance fetch failed for ${symbol}: ${tickerRes.status}/${klinesRes.status}`);
    }
    const ticker = (await tickerRes.json()) as { lastPrice: string; priceChangePercent: string };
    const klines = (await klinesRes.json()) as [number, string, string, string, string, string][];
    return {
      symbol,
      price: Number(ticker.lastPrice),
      changePct24h: Number(ticker.priceChangePercent),
      candles1h: klines.map((k) => ({
        openTime: k[0],
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      })),
      fetchedAt: Date.now(),
    };
  }
}

/**
 * Kraken's free OHLC API — a second venue, so one exchange refusing to answer
 * cannot stop the whole school from measuring anything.
 *
 * The snapshot is derived from the same candles rather than a separate ticker
 * call: fewer endpoints to be wrong about, and the price a student sees then
 * always matches the last bar it is reasoning over.
 */
export class KrakenPublicMarketData implements MarketDataProvider {
  private readonly symbols: readonly string[];
  private readonly baseUrl: string;

  constructor(symbols: readonly string[], baseUrl = 'https://api.kraken.com') {
    this.symbols = symbols;
    this.baseUrl = baseUrl;
  }

  universe(): readonly string[] {
    return this.symbols;
  }

  /** Kraken still calls bitcoin XBT. */
  private pair(symbol: string): string {
    return symbol.replace('/', '').replace(/^BTC/, 'XBT');
  }

  async history(symbol: string, bars: number): Promise<Candle[]> {
    const res = await fetch(`${this.baseUrl}/0/public/OHLC?pair=${this.pair(symbol)}&interval=60`);
    if (!res.ok) throw new Error(`kraken history failed for ${symbol}: ${res.status}`);
    const body = (await res.json()) as {
      error: string[];
      result: Record<string, [number, string, string, string, string, string, string, number][]>;
    };
    if (body.error?.length) throw new Error(`kraken history failed for ${symbol}: ${body.error.join(', ')}`);

    // Kraken answers under its own name for the pair, which is not always the
    // one asked for, so take the series rather than guessing the key.
    const rows = Object.entries(body.result ?? {}).find(([key]) => key !== 'last')?.[1];
    if (!rows?.length) throw new Error(`kraken returned no candles for ${symbol}`);

    return rows.slice(-bars).map((row) => ({
      openTime: row[0] * 1000,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[6]),
    }));
  }

  async snapshot(symbol: string): Promise<MarketSnapshot> {
    const candles = await this.history(symbol, 48);
    const last = candles[candles.length - 1] as Candle;
    const dayAgo = candles[Math.max(0, candles.length - 25)] as Candle;
    return {
      symbol,
      price: last.close,
      changePct24h: dayAgo.close > 0 ? ((last.close - dayAgo.close) / dayAgo.close) * 100 : 0,
      candles1h: candles,
      fetchedAt: Date.now(),
    };
  }
}

/**
 * Try each venue in turn and use the first that answers.
 *
 * A live student found why this is needed: `test_strategy` died on "socket
 * connection closed" four times running, and with no data there is nothing to
 * measure — which stops Learn, Build, Measure, Repeat dead at the third beat.
 * One exchange being unreachable from wherever the school happens to be running
 * should not be able to do that.
 *
 * The venue that worked is remembered and tried first next time, so the common
 * case costs one request rather than one per dead venue.
 */
export class FallbackMarketData implements MarketDataProvider {
  private readonly providers: readonly MarketDataProvider[];
  private preferred = 0;

  constructor(providers: readonly MarketDataProvider[]) {
    if (providers.length === 0) throw new Error('FallbackMarketData needs at least one provider');
    this.providers = providers;
  }

  universe(): readonly string[] {
    return (this.providers[0] as MarketDataProvider).universe();
  }

  private async attempt<T>(what: string, run: (p: MarketDataProvider) => Promise<T>): Promise<T> {
    const failures: string[] = [];
    for (let i = 0; i < this.providers.length; i++) {
      const index = (this.preferred + i) % this.providers.length;
      const provider = this.providers[index] as MarketDataProvider;
      try {
        const result = await run(provider);
        this.preferred = index;
        return result;
      } catch (error) {
        failures.push(`${provider.constructor.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`ดึงข้อมูลตลาดไม่ได้เลยสักเจ้า (${what})\n${failures.join('\n')}`);
  }

  history(symbol: string, bars: number): Promise<Candle[]> {
    return this.attempt(`history ${symbol}`, (p) => p.history(symbol, bars));
  }

  snapshot(symbol: string): Promise<MarketSnapshot> {
    return this.attempt(`snapshot ${symbol}`, (p) => p.snapshot(symbol));
  }
}

/** The venues the academy reads, in the order it tries them. */
export function defaultMarketData(symbols: readonly string[]): MarketDataProvider {
  return new FallbackMarketData([
    new BinancePublicMarketData(symbols),
    new KrakenPublicMarketData(symbols),
    new BinancePublicMarketData(symbols, 'https://api.binance.com'),
  ]);
}
