/**
 * Student tools, exposed to the Agent SDK as an in-process MCP server.
 * Thin wrappers over graphOps (pure, tested) and the market data provider.
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import type { LibraryEntry } from '../../core/school/hive.ts';
import type { PersonalitySeed } from '../../core/types.ts';
import type { StrategyStore } from '../db/strategyStore.ts';
import { borrowFromLibrary, readableEntries } from './libraryTool.ts';
import { adoptStrategy, testStrategy } from './strategyTools.ts';

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
  'strategy',
  'feature_request',
] as const; // trade_journal/conversation are written by the engine, not by hand

const EDGE_KINDS = [
  'learned_from',
  'heard_from',
  'supports',
  'contradicts',
  'debunked_by',
  'compiled_into',
  'spawned_question',
  'answers',
] as const;

const STATUSES = ['untested', 'testing', 'adopted', 'debunked', 'answered'] as const;

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }] };
}

/**
 * Never let a tool throw. An exception escaping a handler kills the in-process
 * MCP bridge, and the student sees a raw "socket closed" it cannot act on —
 * which is exactly what happened the first time a student tried to backtest
 * against a geo-blocked exchange. Failures come back as readable outcomes so
 * the student can record the obstacle and do something else instead.
 */
function safe<A>(name: string, handler: (args: A) => Promise<ReturnType<typeof text>>) {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return text({
        ok: false,
        tool: name,
        error: reason,
        hint: 'เครื่องมือนี้ใช้ไม่ได้ตอนนี้ — จดไว้เป็น lesson ว่าเจออะไร แล้วไปทำอย่างอื่นที่ทำได้',
      });
    }
  };
}

/**
 * The spec is described loosely here and validated strictly in strategyTools —
 * one schema of record (spec §14.6), and validation errors come back as
 * feedback the student can act on rather than a tool-call rejection it cannot see.
 */
const STRATEGY_SPEC_SHAPE = z
  .object({
    name: z.string().describe('ชื่อสูตร a-z 0-9 และ - เท่านั้น'),
    symbols: z.array(z.string()).describe('เหรียญที่สูตรนี้ใช้ ต้องอยู่ใน universe'),
    timeframe: z.string().describe('1h, 4h หรือ 1d'),
    direction: z
      .string()
      .optional()
      .describe(
        '"long" = เดาว่าราคาจะขึ้น (ซื้อก่อน ขายทีหลัง) · "short" = เดาว่าราคาจะลง (ขายก่อน ซื้อคืนทีหลัง) ' +
          'ไม่ใส่ = long · เงื่อนไข entry/exit เขียนเหมือนกันทั้งสองฝั่ง เปลี่ยนแค่ทิศที่เดิมพัน',
      ),
    entry: z
      .array(z.any())
      .describe(
        'เงื่อนไขเข้า (ต้องจริงทุกข้อ) แต่ละข้อ: ' +
          '{left:{kind:"indicator",name:"rsi"|"sma"|"ema"|"price"|"volume",period?:number}, ' +
          'op:"<"|"<="|">"|">="|"crosses_above"|"crosses_below", right:{kind:"number",value:number}}',
      ),
    exit: z.array(z.any()).describe('เงื่อนไขออก (จริงข้อใดข้อหนึ่งก็ออก) รูปแบบเดียวกับ entry'),
    sizePct: z.number().describe('ขนาดไม้เป็น % ของพอร์ต 1-100 (กติกาบ้านอาจลดให้อีกที)'),
  })
  .describe('สูตรเทรดแบบกฎตายตัว');

export interface LibraryAccess {
  /** Read fresh each call — the library changes as classmates prove things. */
  entries: () => LibraryEntry[];
  personality: PersonalitySeed;
}

export function createStudentTools(
  ctx: GraphOpsContext,
  market: MarketDataProvider,
  strategies?: StrategyStore,
  library?: LibraryAccess,
) {
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
        `เชื่อมโน้ตสองอันที่มีอยู่แล้วเข้าด้วยกัน — ความรู้ที่ไม่ได้เชื่อมกับอะไรเลยคือกองโน้ต ไม่ใช่แผนผัง
ใช้เมื่อไหร่:
- answers: ความรู้ใหม่ตอบคำถามในคิวข้อไหน (from = concept, to = question) — **ใช้ทุกครั้งที่หาคำตอบได้**
- supports: ความรู้อันนี้หนุนความรู้เดิมอันไหน
- contradicts: ความรู้อันนี้ขัดกับความรู้เดิมอันไหน — ขัดกันไม่ใช่เรื่องแย่ แปลว่ามีอะไรให้ทดสอบ
- learned_from: ความรู้มาจากแหล่งอ้างอิงไหน
- heard_from: ได้ยินมาจากเพื่อนหรือห้องสมุด (ความมั่นใจต่ำ)
- spawned_question: ความรู้อันนี้ทำให้เกิดคำถามใหม่ข้อไหน
- debunked_by / compiled_into: ถูกตีตกโดยหลักฐานไหน / ถูกแปลงเป็นสูตรไหน`,
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
        safe('market_glance', async (args) => {
          if (!args.symbol) return text({ universe: market.universe() });
          const snap = await market.snapshot(args.symbol);
          return text({
            symbol: snap.symbol,
            price: snap.price,
            changePct24h: snap.changePct24h,
            last12h: snap.candles1h.slice(-12).map((c) => c.close),
          });
        }),
      ),
      tool(
        'test_strategy',
        'ทดสอบสูตรเทรดกับข้อมูลย้อนหลัง — ระบบจะเทียบกับ "ไม้บรรทัด" (ซื้อถือยาว) แล้วตัดสินให้ว่า' +
          ' รับเข้า/ตีตก/ยังตัดสินไม่ได้ ผลจะถูกบันทึกลงข้อสงสัยที่ระบุโดยอัตโนมัติ' +
          ' **ผลจะแยกให้ด้วยว่าสูตรทำได้แค่ไหนในตลาดขาขึ้น ขาลง และออกข้าง (byRegime)** —' +
          ' ดูตรงนั้นก่อนตัวเลขรวม เพราะสูตรที่ดีในตลาดหนึ่งมักพังในอีกตลาดหนึ่ง' +
          ' ทดสอบได้ไม่จำกัด ไม่มีเงินจริงเกี่ยวข้อง',
        {
          spec: STRATEGY_SPEC_SHAPE,
          hypothesisId: z
            .string()
            .optional()
            .describe('id ของข้อสงสัยที่สูตรนี้มาจาก — ใส่แล้วผลจะอัปเดตความมั่นใจให้เอง'),
        },
        safe('test_strategy', async (args) =>
          text(await testStrategy(ctx, market, args.spec, args.hypothesisId)),
        ),
      ),
      tool(
        'adopt_strategy',
        'เปิดใช้สูตรจริง — ระบบจะทดสอบก่อน และ**เปิดให้เฉพาะสูตรที่ผลทดสอบรับเข้าเท่านั้น**' +
          ' เถียงไม่ได้ ถ้าไม่ผ่านต้องกลับไปแก้สูตรหรือหาความรู้เพิ่ม' +
          ' เมื่อเปิดใช้แล้วสูตรจะแก้ไม่ได้ อยากเปลี่ยนต้องเปิดเวอร์ชันใหม่',
        {
          spec: STRATEGY_SPEC_SHAPE,
          hypothesisId: z.string().optional().describe('id ของข้อสงสัยต้นทาง'),
        },
        safe('adopt_strategy', async (args) => {
          if (!strategies) {
            return text({ ok: false, errors: ['ยังเปิดใช้สูตรไม่ได้ในโหมดนี้ — ทดสอบได้อย่างเดียว'] });
          }
          return text(await adoptStrategy(ctx, market, strategies, args.spec, args.hypothesisId));
        }),
      ),
      tool(
        'library_read',
        'เปิดอ่านห้องสมุดกลางของสถาบัน — ข้ออ้างที่เพื่อนร่วมชั้นทดสอบแล้ว' +
          ' บอกว่าใครรับ ใครตีตก และยังเถียงกันเรื่องไหนอยู่' +
          ' (อ่านได้ แต่ยังไม่ใช่หลักฐานของเธอ)',
        {},
        safe('library_read', async () => {
          if (!library) return text({ entries: [], note: 'ห้องสมุดยังไม่เปิดในโหมดนี้' });
          return text({ entries: readableEntries(library.entries()) });
        }),
      ),
      tool(
        'library_borrow',
        'หยิบข้ออ้างจากห้องสมุดมาจดไว้ในสมองเธอ — จะเข้าเป็นความรู้ "ห้องสมุดบอกมา"' +
          ' ที่ความมั่นใจต่ำ ต้องเอาไปพิสูจน์เองก่อนใช้จริง เหมือนเพื่อนบอกมาทุกประการ',
        {
          statement: z.string().describe('ข้อความของข้ออ้างที่เห็นใน library_read'),
        },
        safe('library_borrow', async (args) => {
          if (!library) return text({ ok: false, message: 'ห้องสมุดยังไม่เปิดในโหมดนี้' });
          const entry = library
            .entries()
            .find((e) => e.statement === args.statement || e.statement.startsWith(args.statement.slice(0, 40)));
          if (!entry) {
            return text({ ok: false, message: 'ไม่เจอข้ออ้างนี้ในห้องสมุด — ลอง library_read ดูอีกที' });
          }
          return text(borrowFromLibrary(ctx, library.personality, entry));
        }),
      ),
    ],
  });
}
