"use client";

import Link from "next/link";
import type { BlockInstance } from "@yozan/genesis-core/blocks";

/**
 * Block Renderer（P1・#290）。AI は Block Type＋JSON を返し、ここが描く。
 * 新しい Block は Core の Block Registry に register し、ここに描画を1つ足す（無ければ Generic に落ちる）。
 * どの Block にも meta.kind（fact / calculated / inference / suggestion）と出典が付く＝AI推測と事実を見た目で分ける。
 */

type Row = Record<string, unknown>;
const fmt = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "number") return v.toLocaleString("ja-JP");
  if (typeof v === "boolean") return v ? "○" : "—";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? s.slice(0, 16).replace("T", " ") : s;
};

const KIND_LABEL: Record<string, { label: string; cls: string }> = {
  fact: { label: "事実", cls: "text-emerald-300 border-emerald-800/60" },
  calculated: { label: "集計", cls: "text-sky-300 border-sky-800/60" },
  inference: { label: "AIの推測", cls: "text-amber-300 border-amber-800/60" },
  suggestion: { label: "提案", cls: "text-violet-300 border-violet-800/60" },
};

function KindTag({ b }: { b: BlockInstance }) {
  const k = KIND_LABEL[b.meta.kind] ?? KIND_LABEL.fact;
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] ${k.cls}`}>{k.label}</span>;
}

function Frame({ b, title, children }: { b: BlockInstance; title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        {title ? <span className="font-bold">{title}</span> : null}
        <span className="ml-auto" />
        <KindTag b={b} />
        {b.meta.rowCount != null ? <span className="text-[11px] text-(--color-faint)">{b.meta.rowCount}件</span> : null}
      </div>
      {children}
    </div>
  );
}

function Table({ b }: { b: BlockInstance }) {
  const cols = (b.data.columns as string[]) ?? [];
  const rows = (b.data.rows as Row[]) ?? [];
  if (!rows.length) return <Frame b={b} title={String(b.data.title ?? "")}><p className="text-(--color-faint)">該当なし</p></Frame>;
  return (
    <Frame b={b} title={String(b.data.title ?? "")}>
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-(--color-panel) text-(--color-dim)">
            <tr>{cols.map((c) => <th key={c} className="py-1 pr-3 text-left font-normal">{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-(--color-line)">
                {cols.map((c) => <td key={c} className={`py-1 pr-3 ${typeof r[c] === "number" ? "text-right tabular-nums" : ""}`}>{fmt(r[c])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

function KPI({ b }: { b: BlockInstance }) {
  const value = Number(b.data.value ?? 0);
  const delta = b.data.delta == null ? null : Number(b.data.delta);
  const target = b.data.target == null ? null : Number(b.data.target);
  return (
    <Frame b={b}>
      <p className="text-[11px] text-(--color-dim)">{String(b.data.label ?? "")}</p>
      <p className="text-2xl font-bold tabular-nums">
        {value.toLocaleString("ja-JP")}
        <span className="ml-1 text-sm font-normal text-(--color-dim)">{String(b.data.unit ?? "")}</span>
      </p>
      <p className="text-[11px] text-(--color-dim)">
        {delta != null ? <span className={delta >= 0 ? "text-emerald-300" : "text-red-300"}>{delta >= 0 ? "+" : ""}{delta.toLocaleString("ja-JP")} 前日比</span> : null}
        {target != null ? <span className="ml-2">目標まで {(target - value).toLocaleString("ja-JP")}</span> : null}
      </p>
      {typeof b.data.drill === "string" ? <Link href={b.data.drill} className="mt-1 inline-block text-xs text-sky-300">内訳を見る →</Link> : null}
    </Frame>
  );
}

function Summary({ b }: { b: BlockInstance }) {
  const items = (b.data.items as Row[]) ?? [];
  return (
    <Frame b={b} title={String(b.data.title ?? "")}>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {items.map((it, i) => {
          const entries = Object.entries(it);
          const label = entries.find(([, v]) => typeof v === "string")?.[1];
          const num = entries.find(([, v]) => typeof v === "number");
          return (
            <div key={i} className="rounded-lg border border-(--color-line) px-2 py-1.5">
              <p className="truncate text-[11px] text-(--color-dim)">{String(label ?? it.code ?? i)}</p>
              <p className="text-lg font-bold tabular-nums">{num ? Number(num[1]).toLocaleString("ja-JP") : fmt(entries[1]?.[1])}</p>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

function BookingList({ b }: { b: BlockInstance }) {
  const items = (b.data.items as Row[]) ?? [];
  return (
    <Frame b={b} title={`${String(b.data.date ?? "")} の予約`}>
      {items.length === 0 ? <p className="text-(--color-faint)">予約はありません</p> : (
        <ul className="divide-y divide-(--color-line)">
          {items.map((r, i) => (
            <li key={i} className="flex items-center gap-3 py-1.5 text-xs">
              <span className="w-24 tabular-nums">{fmt(r.booked_date)}</span>
              <span className="w-24 tabular-nums">{String(r.start_time ?? "").slice(0, 5)}–{String(r.end_time ?? "").slice(0, 5)}</span>
              <span className="w-10 text-(--color-dim)">{fmt(r.bay_name)}</span>
              <span className="font-bold">{fmt(r.customer_name)}</span>
              <span className="text-(--color-faint)">{fmt(r.member_no)}</span>
              <span className="ml-auto text-(--color-dim)">{fmt(r.status)}</span>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

function BookingCard({ b }: { b: BlockInstance }) {
  return (
    <Frame b={b} title="予約">
      <p className="text-base font-bold">{fmt(b.data.date)} {fmt(b.data.start)}–{fmt(b.data.end)}　{fmt(b.data.bay)}</p>
      <p className="text-(--color-dim)">{fmt(b.data.who)}　<span className="text-xs">{b.data.status === "cancelled" ? "取り消し済み" : "確定"}</span></p>
    </Frame>
  );
}

function ShiftGrid({ b }: { b: BlockInstance }) {
  const rows = (b.data.rows as Row[]) ?? [];
  const byDate = new Map<string, Row[]>();
  for (const r of rows) {
    const d = String(r.date ?? "");
    byDate.set(d, [...(byDate.get(d) ?? []), r]);
  }
  return (
    <Frame b={b} title={b.data.from === b.data.to ? `${fmt(b.data.from)} のシフト` : `シフト ${fmt(b.data.from)} 〜 ${fmt(b.data.to)}`}>
      {byDate.size === 0 ? <p className="text-(--color-faint)">シフトはありません</p> : (
        <div className="space-y-1 text-xs">
          {[...byDate.entries()].map(([d, list]) => (
            <div key={d} className="flex gap-2">
              <span className="w-24 shrink-0 tabular-nums text-(--color-dim)">{d}</span>
              <span className="flex flex-wrap gap-1">
                {list.map((r, i) => (
                  <span key={i} className={`rounded border px-1.5 py-0.5 ${r.is_day_off ? "border-(--color-line) text-(--color-faint)" : "border-sky-800/60"}`}>
                    {fmt(r.staff_name)} {r.is_day_off ? "休" : `${String(r.start_time ?? "").slice(0, 5)}–${String(r.end_time ?? "").slice(0, 5)}`}{r.status === "draft" ? "（下書き）" : ""}
                    <span className="ml-1 text-(--color-faint)">{fmt(r.store_name)}</span>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </Frame>
  );
}

function Timeline({ b }: { b: BlockInstance }) {
  const items = (b.data.items as Row[]) ?? [];
  return (
    <Frame b={b} title={`履歴 ${String(b.data.entity ?? "").replace(/^person:/, "")}`}>
      {items.length === 0 ? <p className="text-(--color-faint)">履歴なし</p> : (
        <ol className="space-y-1 text-xs">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-24 shrink-0 tabular-nums text-(--color-dim)">{fmt(it.at)}</span>
              <span className="w-24 shrink-0 text-(--color-faint)">{fmt(it.kind)}</span>
              <span>{fmt(it.summary)}</span>
            </li>
          ))}
        </ol>
      )}
    </Frame>
  );
}

function EntityCard({ b }: { b: BlockInstance }) {
  const fields = (b.data.fields as Row[]) ?? [];
  const inner = (
    <>
      <p className="text-base font-bold">{fmt(b.data.title)}</p>
      <p className="text-xs text-(--color-dim)">{fmt(b.data.subtitle)}</p>
      {fields.length ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs md:grid-cols-3">
          {fields.filter((f) => f.v != null && f.v !== "").map((f, i) => (
            <div key={i} className="flex gap-1"><dt className="text-(--color-faint)">{fmt(f.k)}</dt><dd>{fmt(f.v)}</dd></div>
          ))}
        </dl>
      ) : null}
    </>
  );
  return <Frame b={b}>{typeof b.data.href === "string" ? <Link href={b.data.href}>{inner}</Link> : inner}</Frame>;
}

function Health({ b }: { b: BlockInstance }) {
  const items = (b.data.items as Row[]) ?? [];
  return (
    <Frame b={b} title={b.data.ok ? "Genesis は正常" : "Genesis に要確認"}>
      <ul className="space-y-0.5 text-xs">
        {items.map((it, i) => (
          <li key={i} className="flex justify-between">
            <span className="text-(--color-dim)">{fmt(it.label)}</span>
            <span className={Number(it.value) > 0 && !["events_unprocessed", "denied"].includes(String(it.key)) ? "text-red-300" : ""}>{fmt(it.value)}</span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

function SourceNote({ b }: { b: BlockInstance }) {
  return (
    <details className="rounded-lg border border-(--color-line) bg-(--color-panel) px-3 py-2">
      <summary className="cursor-pointer text-xs text-sky-300">{fmt(b.data.title)}</summary>
      {b.data.body ? <p className="mt-1 whitespace-pre-wrap text-[11px] text-(--color-dim)">{fmt(b.data.body)}</p> : null}
      {b.data.sql ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-(--color-dim)">{String(b.data.sql)}</pre> : null}
      {b.meta.sources?.length ? (
        <p className="mt-1 text-[10px] text-(--color-faint)">
          {b.meta.sources.map((s) => `${s.table}${s.updatedAt ? " " + s.updatedAt.slice(11, 16) : ""}${s.verified === false ? " (未検証)" : ""}`).join(" · ")}
        </p>
      ) : null}
    </details>
  );
}

function ApprovalCard({ b }: { b: BlockInstance }) {
  return (
    <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-xs">
      <p className="text-amber-200">{b.data.mode === "approval" || b.data.mode === "two_step" ? "承認待ちにしました" : "実行予定に入れました（取り消せます）"}</p>
      <p className="mt-0.5 text-(--color-dim)">{fmt(b.data.title)}　{fmt(b.data.detail)}</p>
      <Link href="/inbox" className="mt-1 inline-block text-sky-300">判断フィードで見る →</Link>
    </div>
  );
}

function Generic({ b }: { b: BlockInstance }) {
  return (
    <Frame b={b} title={b.block}>
      <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-(--color-dim)">{JSON.stringify(b.data, null, 1).slice(0, 2000)}</pre>
    </Frame>
  );
}

const VIEWS: Record<string, (p: { b: BlockInstance }) => React.ReactElement> = {
  Table, KPI, Summary, BookingList, BookingCard, ShiftGrid, Timeline, EntityCard, Health, SourceNote, ApprovalCard,
};

export function BlockView({ block }: { block: BlockInstance }) {
  const V = VIEWS[block.block] ?? Generic;
  return <V b={block} />;
}

export function BlockList({ blocks }: { blocks: BlockInstance[] | undefined }) {
  if (!blocks?.length) return null;
  return (
    <div className="mt-2 space-y-2">
      {blocks.map((b, i) => <BlockView key={`${b.block}-${i}`} block={b} />)}
    </div>
  );
}
