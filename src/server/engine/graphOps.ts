/**
 * Pure graph operations over the append-only event store.
 * These are the real implementations behind the student's SDK tools —
 * kept SDK-free so they are unit-testable.
 */

import { replay, type EventStore } from '../../core/eventLog.ts';
import type {
  EdgeKind,
  NodeStatus,
  KnowledgeEdge,
  KnowledgeNode,
  NodeKind,
} from '../../core/types.ts';

export interface GraphOpsContext {
  studentId: string;
  store: EventStore;
  now(): number;
}

let seq = 0;
function nextId(prefix: string, at: number): string {
  seq += 1;
  return `${prefix}_${at.toString(36)}_${seq.toString(36)}`;
}

export interface AddNodeInput {
  kind: NodeKind;
  title: string;
  body: string;
  confidence: number;
  /** Optional edges from this new node to existing nodes. */
  links?: { kind: EdgeKind; toNodeId: string }[] | undefined;
}

export function addNode(ctx: GraphOpsContext, input: AddNodeInput): KnowledgeNode {
  const at = ctx.now();
  const node: KnowledgeNode = {
    id: nextId(input.kind, at),
    studentId: ctx.studentId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    confidence: clamp01(input.confidence),
    createdAt: at,
    updatedAt: at,
  };
  if (input.kind === 'hypothesis') node.status = 'untested';
  ctx.store.append(ctx.studentId, { type: 'node_added', at, node });

  for (const link of input.links ?? []) {
    addEdge(ctx, { kind: link.kind, fromNodeId: node.id, toNodeId: link.toNodeId });
  }
  return node;
}

export interface UpdateNodeInput {
  nodeId: string;
  body?: string | undefined;
  confidence?: number | undefined;
  status?: NodeStatus | undefined;
}

/** Beliefs are never deleted — updates only adjust body/confidence/status. */
export function updateNode(ctx: GraphOpsContext, input: UpdateNodeInput): void {
  const patch: { body?: string; confidence?: number; status?: NodeStatus } = {};
  if (input.body !== undefined) patch.body = input.body;
  if (input.confidence !== undefined) patch.confidence = clamp01(input.confidence);
  if (input.status !== undefined) patch.status = input.status;
  ctx.store.append(ctx.studentId, {
    type: 'node_updated',
    at: ctx.now(),
    nodeId: input.nodeId,
    patch,
  });
}

export function addEdge(
  ctx: GraphOpsContext,
  input: { kind: EdgeKind; fromNodeId: string; toNodeId: string },
): KnowledgeEdge {
  const at = ctx.now();
  const edge: KnowledgeEdge = {
    id: nextId('edge', at),
    studentId: ctx.studentId,
    kind: input.kind,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    createdAt: at,
  };
  ctx.store.append(ctx.studentId, { type: 'edge_added', at, edge });
  return edge;
}

export interface SearchInput {
  kind?: NodeKind | undefined;
  text?: string | undefined;
  limit?: number | undefined;
}

export function searchNodes(ctx: GraphOpsContext, input: SearchInput): KnowledgeNode[] {
  const { nodes } = replay(ctx.store.read(ctx.studentId));
  const text = input.text?.toLowerCase();
  const matches = [...nodes.values()].filter((node) => {
    if (input.kind && node.kind !== input.kind) return false;
    if (text && !`${node.title}\n${node.body}`.toLowerCase().includes(text)) return false;
    return true;
  });
  matches.sort((a, b) => b.updatedAt - a.updatedAt);
  return matches.slice(0, input.limit ?? 20);
}

/**
 * The curiosity queue (spec §4.2) = open `question` nodes, most recent first.
 * The student picks from these entirely on its own.
 */
export function curiosityQueue(ctx: GraphOpsContext): KnowledgeNode[] {
  return searchNodes(ctx, { kind: 'question', limit: 50 }).filter(
    (q) => q.status !== 'answered',
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
