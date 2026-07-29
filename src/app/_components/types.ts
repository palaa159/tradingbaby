/** Shapes the API returns, as the views consume them. */

export interface Alpha {
  alphaPct: number;
  studentReturnPct: number;
  benchmarkReturnPct: number;
}

export interface StudentCard {
  id: string;
  name: string;
  energy: number;
  maxEnergy: number;
  hunger: string;
  traits: string;
  nodeCount: number;
  edgeCount: number;
  alpha: Alpha | null;
}

export interface GraphNode {
  id: string;
  kind: string;
  title: string;
  body: string;
  confidence: number;
  status?: string;
  createdAt: number;
}

export interface GraphEdge {
  fromNodeId: string;
  toNodeId: string;
}

export interface Brain {
  nodes: GraphNode[];
  edges: GraphEdge[];
  bounds: { first: number; last: number };
  total: number;
  shown: number;
}

export interface Fill {
  id: number;
  at: number;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  reason: string;
  guardrailNote: string;
  strategy: { id: string; version: number; status: string } | null;
  hypothesisIds: string[];
}

export interface Strategy {
  version: number;
  status: string;
  fromHypothesisIds: string[];
  spec: { name: string; timeframe: string; sizePct: number; direction?: string };
}

export interface Trades {
  fills: Fill[];
  blocked: { at: number; symbol: string; side: string; reason: string }[];
  strategies: Strategy[];
}

export interface LibraryData {
  entries: {
    statement: string;
    consensus: string;
    verdicts: { studentName: string; status: string }[];
  }[];
  summary: { endorsed: number; disputed: number; rejected: number; pending: number };
  classSize: number;
}

export interface DiaryEntry {
  title: string;
  body: string;
  at: number;
}

export interface ScheduleData {
  day: string;
  nowMinute: number;
  schedule: { shortCyclesPerDay: number; dailyReviewMinute: number; wakingWindow: number[] };
  slots: {
    minuteOfDay: number;
    kind: string;
    students: { id: string; name: string; status: string; reason: string | null }[];
  }[];
  history: { day: string; done: number; skipped: number }[];
}

export interface PrincipalData {
  rounds: {
    id: number;
    at: number;
    overall: string;
    checks: { name: string; severity: string; detail: string; action?: string }[];
    students: number;
    activeStrategies: number;
    openRequests: number;
    replayChecked: number;
    replayMismatches: number;
    autoMergeGreen: boolean;
  }[];
}

export const KIND: Record<string, { color: string; label: string }> = {
  concept: { color: '#58a6ff', label: 'ความรู้' },
  question: { color: '#d29922', label: 'คำถามคาใจ' },
  source: { color: '#8b949e', label: 'แหล่งอ้างอิง' },
  lesson: { color: '#3fb950', label: 'บทเรียน' },
  diary_entry: { color: '#a371f7', label: 'ไดอารี่' },
  hypothesis: { color: '#f778ba', label: 'ข้อสงสัย' },
  strategy: { color: '#39c5cf', label: 'สูตรเทรด' },
  trade_journal: { color: '#db6d28', label: 'บันทึกเทรด' },
  conversation: { color: '#bc8cff', label: 'บทสนทนา' },
  feature_request: { color: '#ff7b72', label: 'คำร้อง' },
};

export const fmt = (ms: number | null | undefined): string =>
  ms ? new Date(ms).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const hhmm = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
