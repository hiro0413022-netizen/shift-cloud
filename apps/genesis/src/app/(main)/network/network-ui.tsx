"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EDGES,
  FLOW_LIST,
  NODES,
  STATUS_LABEL,
  type EdgeType,
  type SystemEdge,
  type SystemNode,
} from "./topology";

export type VaultRow = {
  id: string;
  name: string;
  category: string | null;
  url: string | null;
  notes: string | null;
};

type HealthResult = { id: string; ok: boolean; status: number; ms: number };

type SimNode = SystemNode & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vault?: VaultRow;
  auto?: boolean;
};

const W = 1200;
const H = 820;

const EDGE_COLOR: Record<EdgeType, string> = {
  data: "#38bdf8",
  kpi: "#34d399",
  approval: "#fbbf24",
  external: "#94a3b8",
  auto: "#f472b6",
};

const EDGE_LABEL: Record<EdgeType, string> = {
  data: "データ書込/読取",
  kpi: "KPI・集約",
  approval: "承認・イベント",
  external: "外部データ",
  auto: "Vault自動追加",
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s　・_\-（）()／/]/g, "");
}

function radius(n: SimNode): number {
  if (n.kind === "core") return n.id === "supabase" ? 34 : 24;
  if (n.kind === "app") return 20;
  if (n.kind === "script") return 16;
  if (n.auto) return 11;
  return 12;
}

function buildGraph(vaultSystems: VaultRow[]): { nodes: SimNode[]; edges: SystemEdge[] } {
  const nodes: SimNode[] = NODES.map((n) => ({ ...n, x: n.ix, y: n.iy, vx: 0, vy: 0 }));
  const edges: SystemEdge[] = [...EDGES];
  let autoIndex = 0;
  for (const row of vaultSystems) {
    const nm = normalize(row.name);
    const hit = nodes.find((n) => n.aliases.some((a) => a.length > 2 && nm.includes(normalize(a))));
    if (hit) {
      if (!hit.vault) hit.vault = row;
      continue;
    }
    const angle = (autoIndex * 2.399963) % (Math.PI * 2);
    const r = 330 + (autoIndex % 3) * 40;
    nodes.push({
      id: `vault-${row.id}`,
      name: row.name,
      kind: "external",
      status: "external",
      url: row.url ?? undefined,
      description:
        (row.notes ? row.notes + " — " : "") +
        "Vault（システム台帳）から自動追加されたノード。接続先はまだ topology.ts に定義されていません。",
      aliases: [],
      ix: 600 + Math.cos(angle) * r,
      iy: 380 + Math.sin(angle) * r * 0.7,
      x: 600 + Math.cos(angle) * r,
      y: 380 + Math.sin(angle) * r * 0.7,
      vx: 0,
      vy: 0,
      vault: row,
      auto: true,
    });
    edges.push({
      from: `vault-${row.id}`,
      to: "supabase",
      label: "接続先未設定（Vault登録）",
      type: "auto",
    });
    autoIndex += 1;
  }
  return { nodes, edges };
}

function statusColor(n: SimNode, health: Record<string, HealthResult>): string {
  if (n.status === "undeployed" || n.status === "migrating") return "#fbbf24";
  const h = health[n.id];
  if (h) return h.ok ? "#34d399" : "#f87171";
  return "#64748b";
}

function statusText(n: SimNode, health: Record<string, HealthResult>): string {
  const h = health[n.id];
  if (h) {
    return h.ok ? `稼働中（HTTP ${h.status}・${h.ms}ms）` : `エラー（HTTP ${h.status || "接続不可"}・${h.ms}ms）`;
  }
  return STATUS_LABEL[n.status] ?? n.status;
}

export function NetworkMap({ vaultSystems }: { vaultSystems: VaultRow[] }) {
  const graph = useMemo(() => buildGraph(vaultSystems), [vaultSystems]);
  const nodesRef = useRef<SimNode[]>(graph.nodes);
  const alphaRef = useRef(1);
  const [, setFrame] = useState(0);
  const [view, setView] = useState({ tx: -120, ty: -40, k: 0.78 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"map" | "flows">("map");
  const [health, setHealth] = useState<Record<string, HealthResult>>({});
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragging = useRef<{ id: string | null; moved: number; panStart?: { x: number; y: number; tx: number; ty: number }; pinchDist?: number }>({ id: null, moved: 0 });

  const fetchHealth = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/network/health", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { checkedAt: string; results: HealthResult[] };
        const map: Record<string, HealthResult> = {};
        for (const r of json.results) map[r.id] = r;
        setHealth(map);
        setCheckedAt(json.checkedAt);
      }
    } catch {
      /* 監視APIに届かない場合は前回値を維持 */
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    fetchHealth();
    const t = setInterval(fetchHealth, 60000);
    return () => clearInterval(t);
  }, [fetchHealth]);

  useEffect(() => {
    let raf = 0;
    const edges = graph.edges;
    const tick = () => {
      const nodes = nodesRef.current;
      const alpha = alphaRef.current;
      if (alpha > 0.02) {
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            const d2 = Math.max(dx * dx + dy * dy, 100);
            const f = Math.min(16000 / d2, 6) * alpha;
            const d = Math.sqrt(d2);
            dx /= d;
            dy /= d;
            a.vx += dx * f;
            a.vy += dy * f;
            b.vx -= dx * f;
            b.vy -= dy * f;
          }
          a.vx += (a.ix - a.x) * 0.004 * alpha;
          a.vy += (a.iy - a.y) * 0.004 * alpha;
        }
        for (const e of edges) {
          const a = nodes.find((n) => n.id === e.from);
          const b = nodes.find((n) => n.id === e.to);
          if (!a || !b) continue;
          const rest = e.type === "external" || e.type === "auto" ? 150 : 190;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const f = (d - rest) * 0.012 * alpha;
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f;
          b.vy -= (dy / d) * f;
        }
        for (const n of nodes) {
          if (dragging.current.id === n.id) {
            n.vx = 0;
            n.vy = 0;
            continue;
          }
          n.vx *= 0.82;
          n.vy *= 0.82;
          n.x = Math.max(30, Math.min(W - 30, n.x + n.vx));
          n.y = Math.max(30, Math.min(H - 30, n.y + n.vy));
        }
        alphaRef.current = Math.max(alpha * 0.99, 0.02);
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [graph]);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const v = viewRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const sy = ((clientY - rect.top) / rect.height) * H;
    return { x: (sx - v.tx) / v.k, y: (sy - v.ty) / v.k };
  }, []);

  const onPointerDown = (ev: React.PointerEvent<SVGSVGElement>) => {
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      dragging.current = { id: null, moved: 10, pinchDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
      return;
    }
    const p = toWorld(ev.clientX, ev.clientY);
    const hit = [...nodesRef.current]
      .reverse()
      .find((n) => Math.hypot(n.x - p.x, n.y - p.y) < radius(n) + 8);
    if (hit) {
      dragging.current = { id: hit.id, moved: 0 };
      alphaRef.current = Math.max(alphaRef.current, 0.3);
    } else {
      dragging.current = { id: null, moved: 0, panStart: { x: ev.clientX, y: ev.clientY, tx: view.tx, ty: view.ty } };
    }
  };

  const onPointerMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(ev.pointerId)) return;
    const prev = pointers.current.get(ev.pointerId)!;
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.current.size === 2 && dragging.current.pinchDist) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = dist / dragging.current.pinchDist;
      dragging.current.pinchDist = dist;
      setView((v) => {
        const k = Math.max(0.3, Math.min(3, v.k * scale));
        const cx = W / 2;
        const cy = H / 2;
        return { k, tx: cx - ((cx - v.tx) / v.k) * k, ty: cy - ((cy - v.ty) / v.k) * k };
      });
      return;
    }
    dragging.current.moved += Math.hypot(ev.clientX - prev.x, ev.clientY - prev.y);
    if (dragging.current.id) {
      const p = toWorld(ev.clientX, ev.clientY);
      const n = nodesRef.current.find((x) => x.id === dragging.current.id);
      if (n) {
        n.x = p.x;
        n.y = p.y;
        alphaRef.current = Math.max(alphaRef.current, 0.25);
        setFrame((f) => f + 1);
      }
    } else if (dragging.current.panStart) {
      const s = dragging.current.panStart;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setView((v) => ({
        ...v,
        tx: s.tx + ((ev.clientX - s.x) / rect.width) * W,
        ty: s.ty + ((ev.clientY - s.y) / rect.height) * H,
      }));
    }
  };

  const onPointerUp = (ev: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(ev.pointerId);
    if (dragging.current.id && dragging.current.moved < 6) {
      setSelected(dragging.current.id);
    }
    if (pointers.current.size === 0) dragging.current = { id: null, moved: 0 };
  };

  const onWheel = (ev: React.WheelEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((ev.clientX - rect.left) / rect.width) * W;
    const sy = ((ev.clientY - rect.top) / rect.height) * H;
    setView((v) => {
      const k = Math.max(0.3, Math.min(3, v.k * (ev.deltaY < 0 ? 1.12 : 0.89)));
      return { k, tx: sx - ((sx - v.tx) / v.k) * k, ty: sy - ((sy - v.ty) / v.k) * k };
    });
  };

  const zoomBtn = (dir: number) => {
    setView((v) => {
      const k = Math.max(0.3, Math.min(3, v.k * (dir > 0 ? 1.25 : 0.8)));
      const cx = W / 2;
      const cy = H / 2;
      return { k, tx: cx - ((cx - v.tx) / v.k) * k, ty: cy - ((cy - v.ty) / v.k) * k };
    });
  };

  const nodes = nodesRef.current;
  const sel = selected ? nodes.find((n) => n.id === selected) ?? null : null;
  const selEdges = sel
    ? graph.edges.filter((e) => e.from === sel.id || e.to === sel.id)
    : [];
  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;

  const btn =
    "rounded-md border border-[--color-line] bg-[--color-panel-2] px-2.5 py-1 text-xs text-[--color-dim] hover:text-[--color-txt] transition-colors";

  return (
    <div className="flex flex-col gap-3">
      <style>{`
        @keyframes netPulse { 0%,100% { stroke-opacity: .9 } 50% { stroke-opacity: .25 } }
        @keyframes netBlink { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        .net-ok { animation: netPulse 2.4s ease-in-out infinite; }
        .net-err { animation: netBlink 0.9s ease-in-out infinite; }
      `}</style>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">System Network</h1>
          <p className="text-xs text-[--color-dim]">
            どのシステムが何とつながり、どこでエラーが起きているかの状況確認。ノードはドラッグ・クリック（詳細）・ホイール/ピンチで拡大縮小。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className={`${btn} ${tab === "map" ? "text-sky-300" : ""}`} onClick={() => setTab("map")}>
            ネットワーク
          </button>
          <button className={`${btn} ${tab === "flows" ? "text-sky-300" : ""}`} onClick={() => setTab("flows")}>
            フロー図一覧
          </button>
          <button className={btn} onClick={fetchHealth} disabled={checking}>
            {checking ? "確認中…" : "↻ 死活チェック"}
          </button>
        </div>
      </div>

      {tab === "flows" ? (
        <div className="flex flex-col gap-4">
          {FLOW_LIST.map((f) => (
            <div key={f.file} className="rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
              <p className="mb-2 text-sm font-bold">{f.title}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/flows/${f.file}`} alt={f.title} className="w-full max-w-3xl" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3">
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-[--color-line] bg-[--color-panel]">
            <div className="absolute left-3 top-3 z-10 flex flex-col gap-1">
              <button className={btn} onClick={() => zoomBtn(1)}>＋</button>
              <button className={btn} onClick={() => zoomBtn(-1)}>－</button>
              <button className={btn} onClick={() => setView({ tx: -120, ty: -40, k: 0.78 })}>⌂</button>
            </div>
            <div className="absolute right-3 top-3 z-10 rounded-lg border border-[--color-line] bg-[--color-panel-2]/90 px-3 py-2 text-[10px] leading-4 text-[--color-dim]">
              <p><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />稼働中　<span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-400" />エラー</p>
              <p><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />未デプロイ/移行中　<span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-500" />監視対象外</p>
              <p className="mt-1">
                <span style={{ color: EDGE_COLOR.data }}>―</span> データ
                <span style={{ color: EDGE_COLOR.kpi }}>―</span> KPI
                <span style={{ color: EDGE_COLOR.approval }}>―</span> 承認
                <span style={{ color: EDGE_COLOR.auto }}>┄</span> Vault自動追加
              </p>
              {checkedAt && <p className="mt-1">最終チェック: {new Date(checkedAt).toLocaleTimeString("ja-JP")}</p>}
            </div>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="h-[calc(100vh-180px)] min-h-[480px] w-full touch-none select-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
            >
              <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
                {graph.edges.map((e, i) => {
                  const a = nodes.find((n) => n.id === e.from);
                  const b = nodes.find((n) => n.id === e.to);
                  if (!a || !b) return null;
                  const hi = selected && (e.from === selected || e.to === selected);
                  return (
                    <g key={i}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={EDGE_COLOR[e.type]}
                        strokeWidth={hi ? 2.2 : 1}
                        strokeOpacity={selected ? (hi ? 0.95 : 0.12) : 0.45}
                        strokeDasharray={e.type === "auto" || e.type === "approval" ? "5 4" : undefined}
                      />
                      {hi && (
                        <text
                          x={(a.x + b.x) / 2}
                          y={(a.y + b.y) / 2 - 5}
                          textAnchor="middle"
                          fontSize={11}
                          fill={EDGE_COLOR[e.type]}
                        >
                          {e.label}
                        </text>
                      )}
                    </g>
                  );
                })}
                {nodes.map((n) => {
                  const c = statusColor(n, health);
                  const r = radius(n);
                  const isSel = selected === n.id;
                  const dim = selected && !isSel && !selEdges.some((e) => e.from === n.id || e.to === n.id);
                  const anim = c === "#34d399" ? "net-ok" : c === "#f87171" ? "net-err" : "";
                  return (
                    <g key={n.id} opacity={dim ? 0.3 : 1} style={{ cursor: "pointer" }}>
                      <circle className={anim} cx={n.x} cy={n.y} r={r + 5} fill="none" stroke={c} strokeWidth={1.5} strokeOpacity={0.6} />
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={r}
                        fill={n.kind === "core" ? "#0c2f45" : n.auto ? "#3b1e33" : "#12233a"}
                        stroke={isSel ? "#e2e8f0" : c}
                        strokeWidth={isSel ? 2.5 : 2}
                        strokeDasharray={n.auto ? "4 3" : undefined}
                      />
                      <circle cx={n.x} cy={n.y} r={3.5} fill={c} />
                      <text x={n.x} y={n.y + r + 15} textAnchor="middle" fontSize={n.kind === "external" ? 10 : 12} fill="#cbd5e1">
                        {n.name}
                      </text>
                      {n.schema && n.kind === "app" && (
                        <text x={n.x} y={n.y + r + 29} textAnchor="middle" fontSize={9} fill="#64748b">
                          {n.schema.length > 20 ? n.schema.slice(0, 20) + "…" : n.schema}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <aside className="w-80 shrink-0 rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
            {sel ? (
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold">{sel.name}</h2>
                  <button className={btn} onClick={() => setSelected(null)}>✕</button>
                </div>
                <p className="flex items-center gap-2 text-xs">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: statusColor(sel, health) }} />
                  {statusText(sel, health)}
                </p>
                {sel.schema && <p className="text-xs text-[--color-dim]">スキーマ: {sel.schema}</p>}
                <p className="text-xs leading-5 text-[--color-txt]">{sel.description}</p>
                {(sel.url || sel.vault?.url) && (
                  <a
                    href={sel.url ?? sel.vault?.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-sky-300 underline underline-offset-2"
                  >
                    {sel.url ?? sel.vault?.url} ↗
                  </a>
                )}
                {sel.vault && <p className="text-[10px] text-[--color-dim]">Vault登録: {sel.vault.name}（{sel.vault.category ?? "未分類"}）</p>}
                <div>
                  <p className="mb-1 text-xs font-bold text-[--color-dim]">つながり（{selEdges.length}）</p>
                  <ul className="flex flex-col gap-1">
                    {selEdges.map((e, i) => {
                      const other = e.from === sel.id ? e.to : e.from;
                      const dir = e.from === sel.id ? "→" : "←";
                      return (
                        <li key={i}>
                          <button
                            className="w-full rounded-md border border-[--color-line] bg-[--color-panel-2] px-2 py-1 text-left text-[11px] hover:border-sky-500/50"
                            onClick={() => setSelected(other)}
                          >
                            <span style={{ color: EDGE_COLOR[e.type] }}>{dir}</span> {nodeName(other)}
                            <span className="block text-[10px] text-[--color-dim]">{e.label}（{EDGE_LABEL[e.type]}）</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {sel.flow && (
                  <div>
                    <p className="mb-1 text-xs font-bold text-[--color-dim]">フロー図</p>
                    <a href={`/flows/${sel.flow}`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/flows/${sel.flow}`} alt={`${sel.name} フロー図`} className="w-full rounded-lg border border-[--color-line]" />
                    </a>
                    <p className="mt-1 text-[10px] text-[--color-dim]">クリックで拡大表示</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2 text-xs text-[--color-dim]">
                <p className="text-sm font-bold text-[--color-txt]">ノードをクリック</p>
                <p>説明・稼働状況・つながり・フロー図が表示されます。</p>
                <p>ドラッグで位置調整、背景ドラッグで移動、ホイール/ピンチで拡大縮小。</p>
                <p className="mt-2">
                  Vault（システム台帳）に新しいシステムを登録すると、このマップに自動でノードが追加されます（接続先が未定義の間は点線でDBにつながります）。
                </p>
                <p className="mt-2 text-[10px]">
                  監視: 各アプリのURLへ60秒ごとにHTTP到達性を確認（5xx/接続不可=赤）。未デプロイのアプリは黄色で表示。
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
// EOF-network-ui
