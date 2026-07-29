/**
 * Append-only event log — the foundation of time travel (spec §5.3).
 *
 * Rules (spec §14.4): events are kept forever, never compacted, never edited.
 * Replaying the log up to time T reconstructs any student's brain exactly as
 * it was at T.
 */

import type { KnowledgeEdge, KnowledgeNode } from './types.ts';

export type GraphEvent =
  | { type: 'node_added'; at: number; node: KnowledgeNode }
  | {
      type: 'node_updated';
      at: number;
      nodeId: string;
      /** Partial patch — confidence/status/body changes. Never deletion. */
      patch: Partial<Pick<KnowledgeNode, 'body' | 'confidence' | 'status' | 'title'>>;
    }
  | { type: 'edge_added'; at: number; edge: KnowledgeEdge };

export interface EventStore {
  append(studentId: string, event: GraphEvent): void;
  /** All events for a student, oldest first. */
  read(studentId: string): readonly GraphEvent[];
}

/** In-memory store for tests and early prototyping. SQLite impl comes in M3. */
export class MemoryEventStore implements EventStore {
  private readonly logs = new Map<string, GraphEvent[]>();

  append(studentId: string, event: GraphEvent): void {
    const log = this.logs.get(studentId) ?? [];
    const last = log[log.length - 1];
    if (last && event.at < last.at) {
      throw new Error(
        `event log is append-only: event at ${event.at} is earlier than last event at ${last.at}`,
      );
    }
    log.push(event);
    this.logs.set(studentId, log);
  }

  read(studentId: string): readonly GraphEvent[] {
    return this.logs.get(studentId) ?? [];
  }
}

export interface GraphSnapshot {
  nodes: Map<string, KnowledgeNode>;
  edges: Map<string, KnowledgeEdge>;
}

/**
 * Rebuild a student's brain as it existed at `atTime` (inclusive).
 * This IS the timeline slider: call with any timestamp to time-travel.
 */
export function replay(events: readonly GraphEvent[], atTime = Infinity): GraphSnapshot {
  const nodes = new Map<string, KnowledgeNode>();
  const edges = new Map<string, KnowledgeEdge>();

  for (const event of events) {
    if (event.at > atTime) break;
    switch (event.type) {
      case 'node_added':
        nodes.set(event.node.id, { ...event.node });
        break;
      case 'node_updated': {
        const existing = nodes.get(event.nodeId);
        if (existing) {
          nodes.set(event.nodeId, { ...existing, ...event.patch, updatedAt: event.at });
        }
        break;
      }
      case 'edge_added':
        edges.set(event.edge.id, { ...event.edge });
        break;
    }
  }

  return { nodes, edges };
}
