/**
 * Student tools, exposed to the Agent SDK as an in-process MCP server.
 * Thin wrappers over graphOps (pure, tested) and the market data provider.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import {
  addEdge,
  addNode,
  curiosityQueue,
  searchNodes,
  updateNode,
  type GraphOpsContext,
} from './graphOps.ts';
import type { MarketDataProvider } from '../marketData.ts';

const NODE_KINDS = [
  'concept',
  'hypothesis',
  'lesson',
  'source',
  'question',
  'diary_entry',
  'feature_request',
] as const; // strategy/trade_journal/conversation arrive in Phase 2

const EDGE_KINDS = [
  'learned_from',
  'heard_from',
  'supports',
  'contradicts',
  'debunked_by',
  'spawned_question',
] as const;

const STATUSES = ['untested', 'testing', 'adopted', 'debunked', 'answered'] as const;

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }] };
}

export function createStudentTools(ctx: GraphOpsContext, market: MarketDataProvider) {
  return createSdkMcpServer({
    name: 'academy',
    version: '1.0.0',
    tools: [
      tool(
        'graph_read',
        'อ่านแผนผังความรู้ของเธอเอง: ค้นโน้ตตามชนิดและ/หรือข้อความ รวมถึงดูคิวคำถามคาใจ (kind=question)',
        {
          kind: z.enum(NODE_KINDS).optional().describe('กรองตามชนิดโน้ต'),
          text: z.string().optional().describe('ค้นหาข้อความในหัวข้อ/เนื้อหา'),
          limit: z.number().int().min(1).max(50).optional(),
        },
        async (args) => {
          const nodes = searchNodes(ctx, args).map((n) => ({
            id: n.id,
            kind: n.kind,
            title: n.title,
            body: n.body.slice(0, 400),
            confidence: n.confidence,
            status: n.status,
          }));
          return text(nodes);
        },
      ),
      tool(
        'graph_write',
        'จดความรู้ใหม่ลงแผนผัง: สร้างโน้ต (พร้อมลิงก์ไปโน้ตเดิมได้) — ความรู้ทุกอย่างต้องมี source ประกอบ',
        {
          kind: z.enum(NODE_KINDS),
          title: z.string().min(1).max(200),
          body: z.string().min(1),
          confidence: z.number().min(0).max(1),
          links: z
            .array(
              z.object({
                kind: z.enum(EDGE_KINDS),
                toNodeId: z.string(),
              }),
            )
            .optional()
            .describe('เส้นเชื่อมจากโน้ตใหม่ไปยังโน้ตที่มีอยู่'),
        },
        async (args) => {
          const node = addNode(ctx, args);
          return text({ created: node.id });
        },
      ),
      tool(
        'graph_update',
        'อัปเดตโน้ตเดิม: แก้เนื้อหา ปรับความมั่นใจ หรือเปลี่ยนสถานะ (เช่น debunked, answered) — ห้ามใช้แทนการลบ เพราะที่นี่ไม่มีการลบ',
        {
          nodeId: z.string(),
          body: z.string().optional(),
          confidence: z.number().min(0).max(1).optional(),
          status: z.enum(STATUSES).optional(),
        },
        async (args) => {
          updateNode(ctx, args);
          return text({ updated: args.nodeId });
        },
      ),
      tool(
        'graph_link',
        'เชื่อมโน้ตสองอันที่มีอยู่แล้วเข้าด้วยกัน',
        {
          kind: z.enum(EDGE_KINDS),
          fromNodeId: z.string(),
          toNodeId: z.string(),
        },
        async (args) => {
          const edge = addEdge(ctx, args);
          return text({ created: edge.id });
        },
      ),
      tool(
        'curiosity_queue',
        'ดูคิวคำถามคาใจที่ยังไม่ได้หาคำตอบ',
        {},
        async () => {
          const questions = curiosityQueue(ctx).map((q) => ({ id: q.id, title: q.title }));
          return text(questions);
        },
      ),
      tool(
        'diary_write',
        'เขียนไดอารี่ประจำวัน เล่าสิ่งที่เจอและความรู้สึกในแบบของเธอเอง',
        {
          mood: z.string().max(50).describe('อารมณ์วันนี้สั้นๆ เช่น ตื่นเต้น ท้อ สงสัย'),
          body: z.string().min(1),
        },
        async (args) => {
          const node = addNode(ctx, {
            kind: 'diary_entry',
            title: `ไดอารี่ (${args.mood})`,
            body: args.body,
            confidence: 1,
          });
          return text({ created: node.id });
        },
      ),
      tool(
        'market_glance',
        'ชำเลืองดูตลาด: ราคาปัจจุบัน การเปลี่ยนแปลง 24 ชม. และแท่งเทียนรายชั่วโมงล่าสุดของเหรียญใน universe',
        {
          symbol: z.string().optional().describe('เช่น BTC/USDT — ไม่ใส่ = ดูรายชื่อที่มี'),
        },
        async (args) => {
          if (!args.symbol) return text({ universe: market.universe() });
          const snap = await market.snapshot(args.symbol);
          return text({
            symbol: snap.symbol,
            price: snap.price,
            changePct24h: snap.changePct24h,
            last12h: snap.candles1h.slice(-12).map((c) => c.close),
          });
        },
      ),
    ],
  });
}
