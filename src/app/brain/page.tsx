'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import type { Brain, GraphNode } from '../_components/types';
import { Button } from '@/components/ui/button';
import { fmt, KIND } from '../_components/types';

interface Point {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const EMPTY: Brain = { nodes: [], edges: [], bounds: { first: 0, last: 0 }, total: 0, shown: 0 };

/**
 * A stable starting position per node. The old dashboard seeded this with
 * Math.random, so the same brain drew differently on every reload; hashing the
 * id gives the same scatter every time, which is the rule everywhere else here.
 */
function seed(id: string): Point {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  const angle = (((h >>> 0) % 3600) / 3600) * Math.PI * 2;
  const radius = 60 + ((h >>> 8) % 120);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0 };
}

function BrainView() {
  const student = useSearchParams().get('student');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<Brain>(EMPTY);
  const layoutRef = useRef<Map<string, Point>>(new Map());
  const viewRef = useRef({ scale: 1, x: 0, y: 0 });
  const selectedRef = useRef<GraphNode | null>(null);

  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [bounds, setBounds] = useState({ first: 0, last: 0 });
  const [counts, setCounts] = useState({ total: 0, shown: 0 });
  const [pct, setPct] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [atTime, setAtTime] = useState<number>(Infinity);

  const load = useCallback(
    async (at: number) => {
      if (!student) return;
      const query = at === Infinity ? '' : `&at=${at}`;
      const res = await fetch(`/api/brain?student=${encodeURIComponent(student)}${query}`);
      if (!res.ok) return;
      const data = (await res.json()) as Brain;
      graphRef.current = data;
      for (const n of data.nodes) {
        if (!layoutRef.current.has(n.id)) layoutRef.current.set(n.id, seed(n.id));
      }
      setBounds(data.bounds);
      setCounts({ total: data.total, shown: data.shown });
    },
    [student],
  );

  // A different student is a different brain: drop the layout so nodes are not
  // inherited across the switch.
  useEffect(() => {
    layoutRef.current.clear();
    graphRef.current = EMPTY;
    selectedRef.current = null;
    setSelected(null);
    setPct(100);
    setAtTime(Infinity);
  }, [student]);

  useEffect(() => {
    void load(atTime);
  }, [load, atTime]);

  // Live: while parked at "now", keep pulling so growth shows up as it happens.
  useEffect(() => {
    if (atTime !== Infinity || playing) return;
    const timer = setInterval(() => void load(Infinity), 3000);
    return () => clearInterval(timer);
  }, [atTime, playing, load]);

  // --- force-directed layout: repulsion + edge springs + gravity to center ---
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;

    const step = () => {
      const layout = layoutRef.current;
      const graph = graphRef.current;
      const nodes = graph.nodes.filter((n) => layout.has(n.id));
      for (let i = 0; i < nodes.length; i++) {
        const a = layout.get(nodes[i]!.id)!;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = layout.get(nodes[j]!.id)!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 0.01;
          const f = 2600 / d2;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f;
          b.vy -= (dy / d) * f;
        }
        a.vx -= a.x * 0.012;
        a.vy -= a.y * 0.012;
      }
      for (const e of graph.edges) {
        const a = layout.get(e.fromNodeId);
        const b = layout.get(e.toNodeId);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const f = (d - 95) * 0.02;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      for (const n of nodes) {
        const p = layout.get(n.id)!;
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x += p.vx;
        p.y += p.vy;
      }
    };

    // Keep the whole brain in frame however big it grows: fit the node bounding
    // box to the canvas, easing toward the target so growth doesn't jolt.
    const fit = (w: number, h: number) => {
      const view = viewRef.current;
      const pts = graphRef.current.nodes
        .map((n) => layoutRef.current.get(n.id))
        .filter((p): p is Point => Boolean(p));
      if (!pts.length) return;
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const pad = 130;
      const scale = Math.min(Math.min(w / (maxX - minX + pad), h / (maxY - minY + pad)), 1.5);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      view.scale += (scale - view.scale) * 0.08;
      view.x += (-cx * view.scale - view.x) * 0.08;
      view.y += (-cy * view.scale - view.y) * 0.08;
    };

    const draw = () => {
      const view = viewRef.current;
      const layout = layoutRef.current;
      const graph = graphRef.current;
      const dpr = devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      fit(w, h);
      ctx.save();
      ctx.translate(w / 2 + view.x, h / 2 + view.y);
      ctx.scale(view.scale, view.scale);

      ctx.strokeStyle = '#2c3541';
      ctx.lineWidth = 1;
      for (const e of graph.edges) {
        const a = layout.get(e.fromNodeId);
        const b = layout.get(e.toNodeId);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const n of graph.nodes) {
        const p = layout.get(n.id);
        if (!p) continue;
        const kind = KIND[n.kind] ?? { color: '#8b949e', label: n.kind };
        const r = 5 + n.confidence * 9;
        const dead = n.status === 'debunked';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = dead ? '#30363d' : kind.color;
        ctx.globalAlpha = dead ? 0.5 : 1;
        ctx.fill();
        if (dead) {
          ctx.strokeStyle = '#f85149';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        if (n.id === selectedRef.current?.id) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (r > 8 || n.id === selectedRef.current?.id) {
          ctx.fillStyle = '#c9d1d9';
          ctx.font = '11px ui-sans-serif, "Noto Sans Thai", sans-serif';
          ctx.fillText(n.title.slice(0, 26), p.x + r + 4, p.y + 4);
        }
      }
      ctx.restore();
    };

    const frame = () => {
      step();
      draw();
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, []);

  const onCanvasClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = viewRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (ev.clientX - rect.left - rect.width / 2 - view.x) / view.scale;
    const y = (ev.clientY - rect.top - rect.height / 2 - view.y) / view.scale;
    const hit =
      graphRef.current.nodes.find((n) => {
        const p = layoutRef.current.get(n.id);
        if (!p) return false;
        return Math.hypot(p.x - x, p.y - y) < 5 + n.confidence * 9 + 4;
      }) ?? null;
    selectedRef.current = hit;
    setSelected(hit);
  };

  const scrub = (value: number) => {
    setPct(value);
    const { first, last } = bounds;
    setAtTime(value >= 100 ? Infinity : first + (last - first) * (value / 100));
  };

  const play = async () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    setPlaying(true);
    for (let p = 0; p <= 100; p += 2) {
      setPct(p);
      const { first, last } = bounds;
      setAtTime(p >= 100 ? Infinity : first + (last - first) * (p / 100));
      await new Promise((r) => setTimeout(r, 110));
    }
    setPlaying(false);
  };

  const live = atTime === Infinity;
  const kind = selected ? (KIND[selected.kind] ?? { color: '#8b949e', label: selected.kind }) : null;

  return (
    <section className="relative flex h-full flex-col">
      {/* The legend is a scrolling strip on a phone, not a wrapped block that
          eats a third of the canvas. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex gap-3 overflow-x-auto px-3 py-2 text-[10px] text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Object.values(KIND).map((k) => (
          <span key={k.label} className="whitespace-nowrap" style={{ color: k.color }}>
            ● {k.label}
          </span>
        ))}
      </div>

      <canvas ref={canvasRef} onClick={onCanvasClick} className="min-h-0 w-full flex-1" />

      {selected && kind ? (
        <div className="absolute inset-x-2 bottom-24 z-20 max-h-[45%] overflow-y-auto rounded-lg border border-border bg-popover/95 p-3 shadow-lg md:inset-x-auto md:right-4 md:top-10 md:bottom-auto md:w-80">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold" style={{ color: kind.color }}>
              {selected.title}
            </h3>
            <button
              onClick={() => {
                selectedRef.current = null;
                setSelected(null);
              }}
              aria-label="ปิด"
              className="-mr-1 -mt-1 inline-flex size-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {kind.label} · มั่นใจ {selected.confidence}
            {selected.status ? ` · ${selected.status}` : ''} · {fmt(selected.createdAt)}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{selected.body}</p>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-3 py-2">
        <Button variant="secondary" size="sm" onClick={() => void play()}>
          {playing ? '⏸ หยุด' : '▶ เล่นย้อนหนัง'}
        </Button>
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          aria-label="เลื่อนเวลา"
          onChange={(e) => scrub(Number(e.target.value))}
          className="h-9 min-w-32 flex-1 accent-primary"
        />
        <span className="w-full text-[11px] text-muted-foreground md:w-auto">
          {live ? (
            <>
              <span className="text-[var(--ok)]">● สด</span> · {counts.total} events
            </>
          ) : (
            `${fmt(atTime)} · ${counts.shown}/${counts.total} events`
          )}
        </span>
      </div>
    </section>
  );
}

export default function Page() {
  return (
    <Suspense>
      <BrainView />
    </Suspense>
  );
}
