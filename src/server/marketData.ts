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
      candles1h: [],
      fetchedAt: 0,
    };
  }
}

/**
 * Free Binance public REST API (no key needed). ccxt can replace this later
 * behind the same interface without touching the engine.
 */
export class BinancePublicMarketData implements MarketDataProvider {
  private readonly symbols: readonly string[];
  private readonly baseUrl: string;

  constructor(symbols: readonly string[], baseUrl = 'https://api.binance.com') {
    this.symbols = symbols;
    this.baseUrl = baseUrl;
  }

  universe(): readonly string[] {
    return this.symbols;
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
