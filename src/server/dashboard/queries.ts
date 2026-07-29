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

export function principalRounds() {
  return { rounds: principalLog.recent(30) };
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
