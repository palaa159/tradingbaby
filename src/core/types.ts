/**
 * Core domain types for Alpha Academy.
 * Mirrors REQUIREMENTS.md §5.2 (node/edge kinds) and §3 (students).
 */

// ---------- Knowledge graph ----------

export type NodeKind =
  | 'concept' // ความรู้
  | 'hypothesis' // ข้อสงสัย
  | 'strategy' // สูตรเทรด (Phase 2)
  | 'trade_journal' // บันทึกเทรด (Phase 2)
  | 'lesson' // บทเรียน
  | 'source' // แหล่งอ้างอิง
  | 'question' // คำถามคาใจ
  | 'diary_entry' // ไดอารี่
  | 'conversation' // บทสนทนา (Phase 2)
  | 'feature_request'; // คำร้องถึงครูใหญ่

export type EdgeKind =
  | 'learned_from' // เรียนมาจาก
  | 'heard_from' // ได้ยินมาจาก (เพื่อน/ห้องสมุด — ความมั่นใจต่ำ)
  | 'supports' // สนับสนุน
  | 'contradicts' // ขัดแย้งกับ
  | 'debunked_by' // ถูกตีตกโดย
  | 'compiled_into' // ถูกแปลงเป็นสูตร
  | 'decided_by' // ใช้ตัดสินใจ
  | 'spawned_question' // ทำให้เกิดคำถาม
  | 'answers'; // ตอบคำถามข้อนี้

export type HypothesisStatus = 'untested' | 'testing' | 'adopted' | 'debunked';

/** Extra lifecycle for `question` nodes (คำถามคาใจ). */
export type NodeStatus = HypothesisStatus | 'answered';

/** Beliefs are never deleted (spec principle 3) — only status changes. */
export interface KnowledgeNode {
  id: string;
  studentId: string;
  kind: NodeKind;
  title: string;
  body: string;
  /** 0..1 — evidence-driven. Hearsay starts low (spec §9.2). */
  confidence: number;
  status?: NodeStatus;
  createdAt: number; // epoch ms
  updatedAt: number;
}

export interface KnowledgeEdge {
  id: string;
  studentId: string;
  kind: EdgeKind;
  fromNodeId: string;
  toNodeId: string;
  createdAt: number;
}

// ---------- Student ----------

export type HungerState = 'well_fed' | 'hungry' | 'starving' | 'suspended';

export interface Student {
  id: string;
  name: string;
  personality: PersonalitySeed;
  /** Current energy. Fed by realized P&L (Phase 2+); burned by activity. */
  energy: number;
  enrolledAt: number;
}

/**
 * 4 personality dimensions (spec §3.2, decided in §14.3).
 * Each is 0..1; 0.5 is neutral.
 */
export interface PersonalitySeed {
  /** 0 = ระวังตัว, 1 = กล้าเสี่ยง */
  riskAppetite: number;
  /** 0 = เชื่อคนง่าย, 1 = ขี้สงสัย */
  skepticism: number;
  /** 0 = คิดก่อนทำ, 1 = ชอบลุยก่อน */
  impulsiveness: number;
  /** 0 = ชอบอยู่คนเดียว, 1 = ช่างเข้าสังคม */
  sociability: number;
}
