/**
 * Maker dashboard (Phase 1 M5) — read-only window into the academy.
 *
 *   bun run dashboard            # http://localhost:4173
 *   bun run dashboard -- --db=path --port=4173
 *   bun run dashboard -- --tls-cert=origin.crt --tls-key=origin.key   # serve HTTPS
 *
 * Read-only by design (spec §8): the maker observes, never edits knowledge.
 * Every route replays the append-only event log, so the timeline slider is
 * not a separate feature — it is the same query with a different `at`.
 */

import { replay, type GraphEvent } from '../../core/eventLog.ts';
import { hungerState } from '../../core/metabolism.ts';
import { describePersonality } from '../../core/personality.ts';
import { buildLibrary, librarySummary, type ClaimRecord } from '../../core/school/hive.ts';
import { alphaReport } from '../../core/trading/benchmark.ts';
import { portfolioValue } from '../../core/trading/portfolio.ts';
import { DEFAULT_ACADEMY } from '../academyConfig.ts';
import { openAcademyDb, SqliteEventStore, StudentStore } from '../db/sqliteStore.ts';
import { StrategyStore } from '../db/strategyStore.ts';
import { TradingStore } from '../db/tradingStore.ts';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const config = DEFAULT_ACADEMY;
const db = openAcademyDb(arg('db') ?? 'academy.db');
const events = new SqliteEventStore(db);
const students = new StudentStore(db);
const strategies = new StrategyStore(db);
const trading = new TradingStore(db);
const port = Number(arg('port') ?? 4173);
const tlsCert = arg('tls-cert');
const tlsKey = arg('tls-key');

const html = await Bun.file(new URL('./index.html', import.meta.url)).text();

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function timeBounds(log: readonly GraphEvent[]): { first: number; last: number } {
  const first = log[0]?.at ?? 0;
  const last = log[log.length - 1]?.at ?? 0;
  return { first, last };
}

function classroom() {
  const prices = trading.lastPrices();
  return students.list().map((student) => {
    const log = events.read(student.id);
    const brain = replay(log);
    const portfolio = trading.portfolio(student.id, config.metabolism.startingAllowance);
    const value = portfolioValue(portfolio, prices);
    const benchmark = trading.benchmark(student.id);
    const alpha = benchmark
      ? alphaReport(config.metabolism.startingAllowance, value, benchmark, prices)
      : null;
    const diary = [...brain.nodes.values()]
      .filter((n) => n.kind === 'diary_entry')
      .sort((a, b) => b.createdAt - a.createdAt);
    const latest = diary[0];

    return {
      id: student.id,
      name: student.name,
      energy: Math.round(student.energy),
      maxEnergy: config.metabolism.startingAllowance,
      hunger: hungerState(student.energy, config.metabolism),
      traits: describePersonality(student.personality),
      enrolledAt: student.enrolledAt,
      eventCount: log.length,
      nodeCount: brain.nodes.size,
      edgeCount: brain.edges.size,
      latestDiary: latest ? { title: latest.title, body: latest.body, at: latest.createdAt } : null,
      bounds: timeBounds(log),
      portfolio: {
        value,
        realizedPnl: portfolio.realizedPnl,
        holdings: portfolio.holdings.size,
        fills: trading.fills(student.id).length,
        blocked: trading.blocked(student.id).length,
      },
      alpha,
    };
  });
}

const server = Bun.serve({
  port,
  ...(tlsCert && tlsKey
    ? { tls: { cert: Bun.file(tlsCert), key: Bun.file(tlsKey) } }
    : {}),
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    if (url.pathname === '/api/students') {
      return json(classroom());
    }

    if (url.pathname === '/api/brain') {
      const studentId = url.searchParams.get('student');
      if (!studentId) return json({ error: 'student required' });
      const log = events.read(studentId);
      const atParam = url.searchParams.get('at');
      const at = atParam ? Number(atParam) : Infinity;
      const brain = replay(log, at);
      return json({
        nodes: [...brain.nodes.values()],
        edges: [...brain.edges.values()],
        bounds: timeBounds(log),
        total: log.length,
        shown: log.filter((e) => e.at <= at).length,
      });
    }

    if (url.pathname === '/api/trades') {
      const studentId = url.searchParams.get('student');
      if (!studentId) return json({ error: 'student required' });
      const fills = trading.fills(studentId).map((fill) => {
        const trace = trading.trace(fill.id, strategies);
        return {
          ...fill,
          strategy: trace?.strategy
            ? { id: trace.strategy.id, version: trace.strategy.version, status: trace.strategy.status }
            : null,
          hypothesisIds: trace?.hypothesisIds ?? [],
        };
      });
      return json({
        fills,
        blocked: trading.blocked(studentId),
        strategies: strategies.all(studentId),
      });
    }

    if (url.pathname === '/api/library') {
      const roster = new Map(students.list().map((s) => [s.id, s.name]));
      const records: ClaimRecord[] = strategies.allStudents().map((entry) => ({
        spec: entry.spec,
        verdict: {
          studentId: entry.studentId,
          studentName: roster.get(entry.studentId) ?? entry.studentId,
          // Reaching activation means the judge adopted it (spec §6.2).
          status: 'adopted' as const,
          alphaPct: 0,
          confidence: 0,
          at: entry.at,
        },
      }));
      const entries = buildLibrary(records, { classSize: Math.max(1, roster.size) });
      return json({ entries, summary: librarySummary(entries), classSize: roster.size });
    }

    if (url.pathname === '/api/diary') {
      const studentId = url.searchParams.get('student');
      if (!studentId) return json({ error: 'student required' });
      const brain = replay(events.read(studentId));
      const entries = [...brain.nodes.values()]
        .filter((n) => n.kind === 'diary_entry')
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((n) => ({ title: n.title, body: n.body, at: n.createdAt }));
      return json(entries);
    }

    return new Response('not found', { status: 404 });
  },
});

console.log(
  `🏫 Alpha Academy dashboard: ${tlsCert ? 'https' : 'http'}://localhost:${server.port}`,
);
console.log(`   นักเรียน ${students.list().length} คน`);
