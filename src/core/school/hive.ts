/**
 * The school library — hive mind (spec §9.3).
 *
 * The hard part of consensus is deciding when two students believe *the same
 * thing*. Comparing their prose is a trap: they write differently, and a fuzzy
 * text match would let the library fill with near-duplicates and false
 * agreement.
 *
 * The canonical form was already sitting there. A tested claim in this academy
 * is a strategy spec, and two specs either encode the same rule or they do not.
 * So students agree when they proved the *same rule*, not when they used the
 * same words — which is both exactly computable and a stricter standard than
 * any text similarity would give.
 *
 * The library never overwrites anyone's mind. It is a mirror of what the school
 * has collectively established, and reading it is hearsay like any other
 * (spec §9.3, and the "ทำการบ้านเอง" rule from §9.2).
 */

import type { Condition, Operand, StrategySpec } from '../strategy/types.ts';

export type ClaimStatus = 'adopted' | 'debunked';

export interface StudentVerdict {
  studentId: string;
  studentName: string;
  status: ClaimStatus;
  /** Alpha the student measured, in percentage points. */
  alphaPct: number;
  confidence: number;
  at: number;
}

export type Consensus = 'endorsed' | 'rejected' | 'disputed' | 'insufficient';

export interface LibraryEntry {
  /** Canonical rule text — the identity of the claim. */
  key: string;
  /** Readable restatement of the rule for the dashboard. */
  statement: string;
  verdicts: StudentVerdict[];
  consensus: Consensus;
  adoptedBy: number;
  debunkedBy: number;
  /** Mean alpha across everyone who tested it. */
  meanAlphaPct: number;
  firstSeenAt: number;
  lastUpdatedAt: number;
}

export interface HiveOptions {
  /** Students who must agree before the school endorses anything (spec §14.7). */
  minVerifiers?: number;
  /** Size of the class, for the "more than half" half of the rule. */
  classSize: number;
}

// ---------- canonical form ----------

function operandKey(operand: Operand): string {
  if (operand.kind === 'number') return `#${operand.value}`;
  return operand.period === undefined ? operand.name : `${operand.name}(${operand.period})`;
}

function conditionKey(condition: Condition): string {
  return `${operandKey(condition.left)} ${condition.op} ${operandKey(condition.right)}`;
}

/**
 * Two specs describe the same claim when their entry and exit rules match.
 * Conditions are sorted because "A and B" is the same rule as "B and A", while
 * position size and symbol list are deliberately excluded — those are choices
 * about *applying* a belief, not the belief itself.
 */
export function claimKey(spec: StrategySpec): string {
  const entry = spec.entry.map(conditionKey).sort().join(' AND ');
  const exit = spec.exit.map(conditionKey).sort().join(' OR ');
  return `[${spec.timeframe}] ENTRY ${entry} | EXIT ${exit || '(ไม่มี)'}`;
}

/** Same shape as the key, but written for a person rather than for matching. */
function readableOperand(operand: Operand): string {
  if (operand.kind === 'number') return String(operand.value);
  return operand.period === undefined ? operand.name : `${operand.name}(${operand.period})`;
}

function readableCondition(condition: Condition): string {
  return `${readableOperand(condition.left)} ${condition.op} ${readableOperand(condition.right)}`;
}

export function claimStatement(spec: StrategySpec): string {
  const entry = spec.entry.map(readableCondition).join(' และ ');
  const exit = spec.exit.map(readableCondition).join(' หรือ ');
  return `บนกราฟ ${spec.timeframe}: เข้าเมื่อ ${entry}` + (exit ? ` · ออกเมื่อ ${exit}` : ' · ไม่มีเงื่อนไขออก');
}

// ---------- consensus ----------

export interface ClaimRecord {
  spec: StrategySpec;
  verdict: StudentVerdict;
}

function verdictOf(entry: {
  adoptedBy: number;
  debunkedBy: number;
  total: number;
  minVerifiers: number;
  classSize: number;
}): Consensus {
  const majority = Math.floor(entry.classSize / 2) + 1;
  const bar = Math.max(entry.minVerifiers, majority);

  if (entry.adoptedBy >= bar && entry.debunkedBy === 0) return 'endorsed';
  if (entry.debunkedBy >= bar && entry.adoptedBy === 0) return 'rejected';
  // Real disagreement is worth surfacing even below the endorsement bar: two
  // students who tested the same rule and reached opposite conclusions is the
  // most interesting thing that can happen in this school.
  if (entry.adoptedBy > 0 && entry.debunkedBy > 0) return 'disputed';
  return 'insufficient';
}

/**
 * Distil the library from every tested claim in the school.
 *
 * Each student counts once per claim — the most recent verdict wins, so a
 * student that retested and changed its mind does not vote twice.
 */
export function buildLibrary(records: ClaimRecord[], options: HiveOptions): LibraryEntry[] {
  const minVerifiers = options.minVerifiers ?? 3;
  const grouped = new Map<string, { spec: StrategySpec; byStudent: Map<string, StudentVerdict> }>();

  for (const record of records) {
    const key = claimKey(record.spec);
    const group = grouped.get(key) ?? { spec: record.spec, byStudent: new Map() };
    const existing = group.byStudent.get(record.verdict.studentId);
    if (!existing || record.verdict.at >= existing.at) {
      group.byStudent.set(record.verdict.studentId, record.verdict);
    }
    grouped.set(key, group);
  }

  const entries: LibraryEntry[] = [];
  for (const [key, group] of grouped) {
    const verdicts = [...group.byStudent.values()].sort((a, b) => a.at - b.at);
    const adoptedBy = verdicts.filter((v) => v.status === 'adopted').length;
    const debunkedBy = verdicts.filter((v) => v.status === 'debunked').length;

    entries.push({
      key,
      statement: claimStatement(group.spec),
      verdicts,
      consensus: verdictOf({
        adoptedBy,
        debunkedBy,
        total: verdicts.length,
        minVerifiers,
        classSize: options.classSize,
      }),
      adoptedBy,
      debunkedBy,
      meanAlphaPct:
        Math.round((verdicts.reduce((s, v) => s + v.alphaPct, 0) / verdicts.length) * 100) / 100,
      firstSeenAt: verdicts[0]?.at ?? 0,
      lastUpdatedAt: verdicts[verdicts.length - 1]?.at ?? 0,
    });
  }

  // Most contested first, then best established — that ordering puts the
  // school's live arguments in front of the maker before its settled facts.
  const rank: Record<Consensus, number> = { disputed: 0, endorsed: 1, rejected: 2, insufficient: 3 };
  return entries.sort(
    (a, b) => rank[a.consensus] - rank[b.consensus] || b.verdicts.length - a.verdicts.length,
  );
}

/** What the school currently holds as established, for the dashboard headline. */
export function librarySummary(entries: LibraryEntry[]): {
  endorsed: number;
  rejected: number;
  disputed: number;
  pending: number;
} {
  return {
    endorsed: entries.filter((e) => e.consensus === 'endorsed').length,
    rejected: entries.filter((e) => e.consensus === 'rejected').length,
    disputed: entries.filter((e) => e.consensus === 'disputed').length,
    pending: entries.filter((e) => e.consensus === 'insufficient').length,
  };
}
