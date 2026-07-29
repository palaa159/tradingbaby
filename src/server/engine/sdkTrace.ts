/**
 * One place where the Agent SDK is actually called, so no call can escape the
 * record (spec §9.4).
 *
 * It is a generator rather than a function returning text because the callers
 * consume messages differently — a cycle watches for tool activity and turn
 * caps, an exam only wants the final answer — and rewriting them to share one
 * shape would have changed behaviour to suit the logging. Instead the stream is
 * passed through untouched and tapped on the way past.
 *
 * The record is written in a `finally`, so a call that throws is still recorded
 * as one that happened: a failed call is exactly the kind the maker goes looking
 * for later.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

import type { SdkCaller, SdkLog } from '../db/sdkLog.ts';
import { effortFor } from './effort.ts';

type QueryOptions = Parameters<typeof query>[0]['options'];

export interface TracedQuery {
  caller: SdkCaller;
  studentId?: string | undefined;
  prompt: string;
  options: QueryOptions & { model: string };
  log?: SdkLog | undefined;
  now?: (() => number) | undefined;
}

/** Drop-in for `query({...})` in a `for await`, with the call written down. */
export async function* tracedQuery(spec: TracedQuery): AsyncGenerator<unknown> {
  const now = spec.now ?? Date.now;
  const at = now();
  const options = { ...spec.options, ...effortFor(spec.options.model) };

  const toolCalls: string[] = [];
  let result: string | undefined;
  let subtype: string | undefined;
  let isError = false;
  let numTurns: number | undefined;
  let costUsd: number | undefined;

  try {
    for await (const message of query({ prompt: spec.prompt, options })) {
      const m = message as {
        type: string;
        subtype?: string;
        result?: string;
        is_error?: boolean;
        num_turns?: number;
        total_cost_usd?: number;
        message?: { content?: { type: string; name?: string }[] };
      };
      if (m.type === 'assistant') {
        for (const block of m.message?.content ?? []) {
          if (block.type === 'tool_use' && block.name) toolCalls.push(block.name);
        }
      }
      if (m.type === 'result') {
        subtype = m.subtype;
        isError = Boolean(m.is_error);
        numTurns = m.num_turns;
        costUsd = m.total_cost_usd;
        if (m.subtype === 'success') result = m.result;
      }
      yield message;
    }
  } catch (error) {
    isError = true;
    subtype = subtype ?? 'threw';
    result = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    spec.log?.record(
      {
        caller: spec.caller,
        studentId: spec.studentId,
        model: spec.options.model,
        effort: (options as { effort?: string }).effort,
        systemPrompt:
          typeof spec.options.systemPrompt === 'string' ? spec.options.systemPrompt : undefined,
        prompt: spec.prompt,
        maxTurns: spec.options.maxTurns,
      },
      { result, subtype, isError, numTurns, costUsd, durationMs: now() - at, toolCalls },
      at,
    );
  }
}
