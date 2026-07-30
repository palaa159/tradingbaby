/**
 * The read models behind the dashboard's API.
 *
 * Every one of these replays the append-only event log, which is why the
 * timeline slider is not a separate feature — it is the same query with a
 * different `at` (spec §5.3). Read-only by design (spec §8): the maker
 * observes, never edits knowledge.
 */

import { replay, type GraphEvent } from '../../core/eventLog.ts';
import { hungerState } from '../../core/metabolism.ts';
import { describePersonality } from '../../core/personality.ts';
import { buildLibrary, librarySummary, type ClaimRecord } from '../../core/school/hive.ts';
import { alphaReport } from '../../core/trading/benchmark.ts';
import { portfolioValue } from '../../core/trading/portfolio.ts';
import { dayKey, minuteOfDay, planDay } from '../scheduler.ts';
import {
  config,
  designLog,
  events,
  ledger,
  exams,
  principalLog,
  roster,
  sdkLog,
  settings,
  strategies,
  students,
  trading,
  workLog,
} from './context.ts';

function timeBounds(log: readonly GraphEvent[]): { first: number; last: number } {
  const first = log[0]?.at ?? 0;
  const last = log[log.length - 1]?.at ?? 0;
  return { first, last };
}

export function classroom() {
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

export function brainAt(studentId: string, at: number) {
  const log = events.read(studentId);
  const brain = replay(log, at);
  return {
    nodes: [...brain.nodes.values()],
    edges: [...brain.edges.values()],
    bounds: timeBounds(log),
    total: log.length,
    shown: log.filter((e) => e.at <= at).length,
  };
}

export function tradesFor(studentId: string) {
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
  return {
    fills,
    blocked: trading.blocked(studentId),
    strategies: strategies.all(studentId),
  };
}

export function library() {
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
  return { entries, summary: librarySummary(entries), classSize: roster.size };
}

export function diaryFor(studentId: string) {
  const brain = replay(events.read(studentId));
  return [...brain.nodes.values()]
    .filter((n) => n.kind === 'diary_entry')
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((n) => ({ title: n.title, body: n.body, at: n.createdAt }));
}

/**
 * The plan joined against the ledger. Without the join a quiet school and a
 * dead one look identical from outside.
 */
export function schedule(at: number) {
  const day = dayKey(at);
  const nowMinute = minuteOfDay(at);
  const roster = students.list();
  const attempted = new Map(
    ledger.day(day).map((r) => [`${r.studentId}:${r.kind}:${r.minuteOfDay}`, r]),
  );

  const active = settings.schedule(config.schedule);
  const slots = planDay(active).map((slot) => ({
    minuteOfDay: slot.minuteOfDay,
    kind: slot.kind,
    students: roster.map((student) => {
      const run = attempted.get(`${student.id}:${slot.kind}:${slot.minuteOfDay}`);
      if (run) {
        return {
          id: student.id,
          name: student.name,
          status: run.status as string,
          reason: run.reason ?? null,
          at: run.at as number | null,
        };
      }
      // Nothing recorded yet: still to come if the bell has not rung, and
      // overdue if it has — the daemon writes the miss when it gets there.
      return {
        id: student.id,
        name: student.name,
        status: slot.minuteOfDay >= nowMinute ? 'upcoming' : 'late',
        reason: null,
        at: null,
      };
    }),
  }));

  return { day, now: at, nowMinute, schedule: active, slots, history: ledger.dayCounts(14) };
}

/**
 * The Principal's page: the health walks, and what it did about the requests.
 * The walks are what it saw; the works are what it acted on — a page with only
 * the first reads like a caretaker who never lifts anything.
 */
export function principalRounds() {
  return { rounds: principalLog.recent(30), works: workLog.recent(30) };
}

/**
 * Every SDK call, in and out. The maker's audit trail for decisions that were
 * made by a model rather than by code (spec §9.4).
 */
export function sdkCalls(studentId: string | null) {
  return {
    calls: studentId ? sdkLog.forStudent(studentId, 50) : sdkLog.recent(50),
    summary: sdkLog.summary(),
  };
}

/** The roster as the maker manages it, including suspended and expelled. */
export function rosterView() {
  return {
    students: roster.all().map((s) => ({
      id: s.id,
      name: s.name,
      energy: Math.round(s.energy),
      enrolledAt: s.enrolledAt,
      suspended: s.suspended,
      expelled: s.expelled,
      traits: describePersonality(s.personality),
    })),
    startingAllowance: config.metabolism.startingAllowance,
  };
}

/**
 * The request box (spec §9.4). Students write feature_request notes when a tool
 * fails them or they want a new one; until the Principal grows hands, these pile
 * up for the maker to read and act on by hand — which needs somewhere to read
 * them, not just a count.
 */
export function requestBox() {
  const open: unknown[] = [];
  const answered: unknown[] = [];
  for (const student of students.list()) {
    const brain = replay(events.read(student.id));
    for (const node of brain.nodes.values()) {
      if (node.kind !== 'feature_request') continue;
      const entry = {
        id: node.id,
        studentId: student.id,
        studentName: student.name,
        title: node.title,
        body: node.body,
        status: node.status ?? 'untested',
        at: node.createdAt,
      };
      if (node.status === 'answered') answered.push(entry);
      else open.push(entry);
    }
  }
  return { open, answered };
}

/** Report cards, kept rather than printed (spec §7). */
export function examView(studentId: string | null) {
  if (studentId) {
    return { sittings: exams.forStudent(studentId, 20), trend: exams.trend(studentId) };
  }
  return { sittings: exams.recent(40), trend: [] };
}

/**
 * The append-only event log, raw (spec §5.1).
 *
 * Every other view is a projection of this table — the brain graph is this
 * replayed, the timeline is this replayed to a cutoff. This is the only view
 * that shows what was actually written, in the order it was written, which is
 * the difference between reading the ledger and reading a summary of it.
 */
export function eventStream(studentId: string | null, limit = 300, type?: string | null) {
  const roster = new Map(students.list().map((s) => [s.id, s.name]));
  const ids = studentId ? [studentId] : [...roster.keys()];
  const rows: {
    studentId: string;
    studentName: string;
    seq: number;
    at: number;
    type: string;
    title: string;
    detail: string;
  }[] = [];

  for (const id of ids) {
    let seq = 0;
    for (const event of events.read(id)) {
      seq += 1;
      const e = event as unknown as {
        type: string;
        at: number;
        node?: { kind: string; title: string; body: string; confidence: number };
        edge?: { kind: string; fromNodeId: string; toNodeId: string };
        nodeId?: string;
        patch?: Record<string, unknown>;
      };
      if (type && e.type !== type) continue;
      const title =
        e.node?.title ?? (e.edge ? `${e.edge.fromNodeId} → ${e.edge.toNodeId}` : (e.nodeId ?? ''));
      const detail =
        e.node !== undefined
          ? `[${e.node.kind}] มั่นใจ ${e.node.confidence} · ${e.node.body.slice(0, 160)}`
          : e.edge !== undefined
            ? `[${e.edge.kind}]`
            : JSON.stringify(e.patch ?? {});
      rows.push({
        studentId: id,
        studentName: roster.get(id) ?? id,
        seq,
        at: e.at,
        type: e.type,
        title,
        detail,
      });
    }
  }

  rows.sort((a, b) => b.at - a.at || b.seq - a.seq);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.type] = (counts[r.type] ?? 0) + 1;
  return { events: rows.slice(0, limit), total: rows.length, counts };
}

/**
 * The evaluation record (spec §6.2): every strategy decision with the exact
 * inputs it saw, which is what makes "re-run this and get the same answer"
 * checkable rather than a claim.
 */
export function evaluationLog(studentId: string | null, limit = 100) {
  const owners = studentId ? [studentId] : students.list().map((s) => s.id);
  const rows: unknown[] = [];
  for (const owner of owners) {
    for (const strategy of strategies.all(owner)) {
      const replayCheck = strategies.verifyReplay(strategy.id);
      for (const ev of strategies.evaluations(strategy.id).slice(-limit)) {
        rows.push({
          id: ev.id,
          at: ev.at,
          strategyId: strategy.id,
          version: strategy.version,
          studentId: owner,
          symbol: (ev.input as { symbol?: string }).symbol ?? '',
          orders: (ev.result as { orders?: unknown[] }).orders ?? [],
          readings: (ev.result as { readings?: Record<string, number> }).readings ?? {},
          bars: ((ev.input as { candles?: unknown[] }).candles ?? []).length,
          reproduces: replayCheck.mismatches.every((m) => m !== ev.id),
        });
      }
    }
  }
  rows.sort((a, b) => (b as { at: number }).at - (a as { at: number }).at);
  return { evaluations: rows.slice(0, limit) };
}

/** Prices the runner marked, the buy-and-hold ruler, and each day's opening value. */
export function marketLog() {
  const roster = new Map(students.list().map((s) => [s.id, s.name]));
  return {
    prices: trading.lastPrices(),
    benchmarks: [...roster.entries()].map(([id, name]) => ({
      studentId: id,
      studentName: name,
      benchmark: trading.benchmark(id),
    })),
  };
}

export type ActivityKind =
  | 'brain'
  | 'cycle'
  | 'trade'
  | 'blocked'
  | 'exam'
  | 'principal'
  | 'design'
  | 'sdk';

export interface ActivityItem {
  at: number;
  kind: ActivityKind;
  who: string;
  title: string;
  detail: string;
  severity: 'ok' | 'warn' | 'bad' | 'plain';
}

/**
 * Everything the academy did, in one stream, newest first.
 *
 * The dedicated views each answer one question well; this answers the question
 * the maker actually opens the dashboard with — "what has been happening?" —
 * without knowing in advance which of nine screens the answer is on. Anything
 * the system records should show up here or it is not really being monitored.
 */
export function activityFeed(limit = 200): { items: ActivityItem[]; counts: Record<string, number> } {
  const items: ActivityItem[] = [];
  const roster = new Map(students.list().map((s) => [s.id, s.name]));
  const name = (id: string | undefined) => (id ? (roster.get(id) ?? id) : 'โรงเรียน');

  for (const [id, who] of roster) {
    for (const event of events.read(id)) {
      const e = event as unknown as {
        type: string;
        at: number;
        node?: { kind: string; title: string };
        edge?: { kind: string };
        nodeId?: string;
      };
      items.push({
        at: e.at,
        kind: 'brain',
        who,
        title: e.node?.title ?? (e.edge ? `เชื่อม ${e.edge.kind}` : `แก้ ${e.nodeId ?? ''}`),
        detail: e.node ? `จดโน้ต [${e.node.kind}]` : e.type,
        severity: 'plain',
      });
    }

    for (const fill of trading.fills(id)) {
      items.push({
        at: fill.at,
        kind: 'trade',
        who,
        title: `${fill.side === 'buy' ? 'ซื้อ' : 'ขาย'} ${fill.symbol} ${fill.quantity.toFixed(4)} @ ${fill.price.toFixed(2)}`,
        detail: fill.reason,
        severity: fill.side === 'buy' ? 'ok' : 'plain',
      });
    }
    for (const b of trading.blocked(id)) {
      items.push({
        at: b.at,
        kind: 'blocked',
        who,
        title: `กติกาบ้านห้าม ${b.side} ${b.symbol}`,
        detail: b.reason,
        severity: 'warn',
      });
    }
    for (const s of exams.forStudent(id, 20)) {
      items.push({
        at: s.at,
        kind: 'exam',
        who,
        title: `สอบเสร็จ — เฉลี่ย ${s.averageScore}`,
        detail: `${s.answered} ข้อ · ทายถูก ${s.actionAccuracy}%`,
        severity: s.averageScore >= 60 ? 'ok' : s.averageScore >= 40 ? 'warn' : 'bad',
      });
    }
  }

  for (const run of ledger.dayCounts(30).flatMap((d) => ledger.day(d.day))) {
    items.push({
      at: run.at,
      kind: 'cycle',
      who: name(run.studentId),
      title: `${run.kind === 'short' ? 'รอบสั้น' : 'รอบทบทวน'} ${run.status === 'done' ? 'รันแล้ว' : 'ข้าม'}`,
      detail: run.reason ?? '',
      severity: run.status === 'done' ? 'ok' : 'warn',
    });
  }

  for (const r of principalLog.recent(30)) {
    items.push({
      at: r.at,
      kind: 'principal',
      who: 'ครูใหญ่',
      title: `ออกตรวจ — ${r.overall}`,
      detail: r.checks.map((c) => c.name).join(' · '),
      severity: r.overall === 'ok' ? 'ok' : r.overall === 'warn' ? 'warn' : 'bad',
    });
  }

  for (const r of designLog.recent(30)) {
    items.push({
      at: r.at,
      kind: 'design',
      who: 'Maker Designer',
      title: `ตรวจหน้าจอ — ${r.outcome}`,
      detail: r.note || `${r.hardFlags.length} ปัญหาที่วัดได้`,
      severity: r.outcome === 'changed' ? 'ok' : r.outcome === 'clean' ? 'plain' : 'warn',
    });
  }

  for (const c of sdkLog.recent(60)) {
    items.push({
      at: c.at,
      kind: 'sdk',
      who: name(c.studentId),
      title: `เรียก AI ${c.caller} (${c.model})`,
      detail:
        `${c.numTurns ?? 0} turns · ${(c.durationMs / 1000).toFixed(1)}s` +
        (c.costUsd !== undefined ? ` · $${c.costUsd.toFixed(4)}` : ''),
      severity: c.isError ? 'bad' : 'plain',
    });
  }

  items.sort((a, b) => b.at - a.at);
  const counts: Record<string, number> = {};
  for (const i of items) counts[i.kind] = (counts[i.kind] ?? 0) + 1;
  return { items: items.slice(0, limit), counts };
}
