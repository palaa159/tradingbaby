/**
 * Runs one activity cycle for one student via the Claude Agent SDK.
 * Auth: the SDK uses the maker's Claude subscription login (spec §10) —
 * no API key handling here.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

import { burn, hungerState, type MetabolismConfig } from '../../core/metabolism.ts';
import type { Student } from '../../core/types.ts';
import type { EventStore } from '../../core/eventLog.ts';
import type { StrategyStore } from '../db/strategyStore.ts';
import { readBrainState } from '../../core/brainState.ts';
import { effortFor } from './effort.ts';
import { curiosityQueue, type GraphOpsContext } from './graphOps.ts';
import { buildSystemPrompt, cyclePrompt, type CycleKind } from './prompts.ts';
import { createStudentTools, type LibraryAccess } from './tools.ts';
import type { MarketDataProvider } from '../marketData.ts';

export interface CycleModels {
  /** Cheap/fast model for short cycles (spec §10 usage tiering). */
  short: string;
  /** Bigger model for daily reviews. */
  dailyReview: string;
  /** Grades exam answers — the judge never runs a cycle of its own. */
  judge: string;
}

export interface CycleResult {
  student: string;
  cycle: CycleKind;
  summary: string;
  energyAfter: number;
  costUsd: number | undefined;
  durationMs: number;
}

export interface RunCycleOptions {
  student: Student;
  store: EventStore;
  market: MarketDataProvider;
  metabolism: MetabolismConfig;
  models: CycleModels;
  /** Present from Phase 2: lets the student author and activate strategies. */
  strategies?: StrategyStore;
  /** Present from Phase 3: lets the student read the school library. */
  library?: LibraryAccess;
  maxTurns?: number;
  now?: () => number;
}

export async function runCycle(kind: CycleKind, opts: RunCycleOptions): Promise<CycleResult> {
  const now = opts.now ?? Date.now;
  const started = now();
  const ctx: GraphOpsContext = { studentId: opts.student.id, store: opts.store, now };

  const hunger = hungerState(opts.student.energy, opts.metabolism);
  const curiosity = curiosityQueue(ctx)
    .slice(0, 5)
    .map((q) => q.title);
  const brain = readBrainState(opts.store, opts.student.id);

  const tools = createStudentTools(ctx, opts.market, opts.strategies, opts.library);
  const model = kind === 'short' ? opts.models.short : opts.models.dailyReview;

  let summary = '';
  let costUsd: number | undefined;

  const run = query({
    prompt: cyclePrompt(kind),
    options: {
      systemPrompt: buildSystemPrompt(opts.student, hunger, kind, curiosity, brain),
      model,
      ...effortFor(model),
      maxTurns: opts.maxTurns ?? (kind === 'short' ? 20 : 36),
      // 'default' + allowedTools: whitelisted tools run without prompting,
      // everything else is denied. (bypassPermissions breaks under root.)
      permissionMode: 'default',
      mcpServers: { academy: tools },
      allowedTools: [
        'WebSearch',
        'WebFetch',
        'mcp__academy__graph_read',
        'mcp__academy__graph_write',
        'mcp__academy__graph_update',
        'mcp__academy__graph_link',
        'mcp__academy__curiosity_queue',
        'mcp__academy__diary_write',
        'mcp__academy__market_glance',
        'mcp__academy__test_strategy',
        'mcp__academy__adopt_strategy',
        'mcp__academy__library_read',
        'mcp__academy__library_borrow',
      ],
    },
  });

  try {
    for await (const message of run) {
      if (message.type === 'result') {
        costUsd = 'total_cost_usd' in message ? message.total_cost_usd : undefined;
        summary =
          message.subtype === 'success'
            ? message.result
            : message.subtype === 'error_max_turns'
              ? 'หมดเวลาคาบ — สิ่งที่จดไว้ระหว่างรอบถูกบันทึกแล้ว'
              : `cycle ended without success: ${message.subtype}`;
      }
    }
  } catch (error) {
    // Hitting the turn cap just means the bell rang mid-activity — the
    // student's graph writes are already committed, so treat it as a
    // normal end of period, not a failure.
    if (error instanceof Error && /maximum number of turns/i.test(error.message)) {
      summary = summary || 'หมดเวลาคาบ — สิ่งที่จดไว้ระหว่างรอบถูกบันทึกแล้ว';
    } else {
      throw error;
    }
  }

  const activity = kind === 'short' ? 'shortCycle' : 'dailyReview';
  opts.student.energy = burn(opts.student.energy, activity, opts.metabolism);

  return {
    student: opts.student.name,
    cycle: kind,
    summary,
    energyAfter: opts.student.energy,
    costUsd,
    durationMs: now() - started,
  };
}
