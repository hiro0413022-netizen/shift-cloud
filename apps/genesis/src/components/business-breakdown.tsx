"use client";

import { useState } from "react";
import Link from "next/link";
import type { SegmentMetric } from "@/lib/kernel";
import { Badge } from "./ui";

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

function ProfitTone({ profit }: { profit: number }) {
  const tone = profit > 0 ? "text-emerald-300" : profit < 0 ? "text-red-300" : "text-[--color-dim]";
  return <span className={`tabular-nums font-semibold ${tone}`}>{yen(profit)}</span>;
}

function SegmentCard({ seg }: { seg: SegmentMetric }) {
  const [open, setOpen] = useState(false);
  const hasStores = seg.stores.length > 0;

  return (
    <div className="hud reveal rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{seg.name}</p>
          <p className="mt-0.5 text-[11px] text-[--color-dim]">
            {hasStores ? `店舗 ${seg.stores.length}` : "横断・オンライン事業"}
          </p>
        </div>
        {seg.hasFinance ? (
          <Badge tone={seg.profit >= 0 ? "ok" : "danger"}>{seg.profit >= 0 ? "黒字" : "赤字"}</Badge>
        ) : (
          <Badge tone="default">財務未接続</Badge>
        )}
      </div>

      {seg.hasFinance ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] text-[--color-dim]">売上</p>
            <p className="tabular-nums text-sm font-semibold text-sky-200">{yen(seg.revenue)}</p>
          </div>
          <div>
            <p className="text-[10px] text-[--color-dim]">原価+経費</p>
            <p className="tabular-nums text-sm font-semibold text-[--color-txt]">{yen(seg.cogs + seg.expense)}</p>
          </div>
          <div>
            <p className="text-[10px] text-[--color-dim]">利益</p>
            <p className="text-sm">
              <ProfitTone profit={seg.profit} />
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-[--color-panel-2] px-3 py-2 text-[11px] text-[--color-dim]">
          当月の財務入力なし。
          <Link href="/finance" className="ml-1 text-sky-300 hover:underline">
            Money OSで入力
          </Link>
        </p>
      )}

      {hasStores && (
        <div className="mt-3 border-t border-[--color-line] pt-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between text-[12px] text-[--color-dim] transition-colors hover:text-[--color-txt]"
          >
            <span>店舗別を見る（{seg.stores.length}）</span>
            <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          </button>
          {open && (
            <ul className="mt-2 space-y-2">
              {seg.stores.map((st) => (
                <li key={st.id} className="rounded-lg bg-[--color-panel-2] px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <span className={`inline-block h-2 w-2 rounded-full ${st.operating ? "bg-emerald-400" : "bg-zinc-500"}`} />
                      {st.name}
                    </span>
                    <span className="text-[10px] text-[--color-dim]">
                      {st.revenue != null ? `当月売上 ${yen(st.revenue)}` : st.operating ? "稼働中" : "準備中"}
                    </span>
                  </div>
                  {/* 会員中心（今月の入退会・本会員/トライアル分離） */}
                  <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                    <div>
                      <span className="block text-[10px] text-[--color-dim]">本会員数</span>
                      <span className="tabular-nums text-sm font-semibold text-sky-200">{st.members}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[--color-dim]">今月入会</span>
                      <span className="tabular-nums text-sm font-semibold text-emerald-300">+{st.joins}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[--color-dim]">本会員退会</span>
                      <span className={`tabular-nums text-sm font-semibold ${st.leavesCore > 0 ? "text-red-300" : "text-[--color-dim]"}`}>-{st.leavesCore}</span>
                    </div>
                  </div>
                  {(st.leavesTrial > 0 || st.leaveReasons.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
                      {st.leavesTrial > 0 && (
                        <span className="rounded-full border border-[--color-line] px-1.5 py-0.5 text-[--color-dim]">トライアル退会 {st.leavesTrial}</span>
                      )}
                      {st.leaveReasons.map((r) => (
                        <span key={r} className="rounded-full border border-red-500/30 px-1.5 py-0.5 text-red-300/90">理由: {r}</span>
                      ))}
                    </div>
                  )}
                  {/* 運営補助 */}
                  <div className="mt-1.5 flex justify-between text-[10px] text-[--color-dim]">
                    <span>スタッフ {st.staff}</span>
                    <span>当月シフト {st.shifts}</span>
                    <span>体験予約 {st.trials}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function BusinessBreakdown({
  segments,
  monthLabel,
  forecastMonthLabel,
  forecastTotal,
}: {
  segments: SegmentMetric[];
  monthLabel: string;
  forecastMonthLabel?: string;
  forecastTotal?: number;
}) {
  if (segments.length === 0) {
    return <p className="py-6 text-center text-sm text-[--color-dim]">事業データなし</p>;
  }
  return (
    <div>
      {forecastTotal != null && forecastTotal > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-sky-800/50 bg-sky-950/30 px-3 py-2">
          <span className="text-[11px] text-[--color-dim]">
            当月（{forecastMonthLabel}）見込み・月会費予測
            <span className="ml-1 text-[10px]">※ファイン実績が入り次第 自動で実績に置換</span>
          </span>
          <span className="tabular-nums text-sm font-semibold text-sky-200">{yen(forecastTotal)}</span>
        </div>
      )}
      <p className="mb-3 text-[11px] text-[--color-dim]">下段のPLは最新の完了月（{monthLabel}）。事業別=Money OS(fin_entries)、店舗別の会員・入退会は会員名簿、スタッフ・シフトはShift Cloudから自動集計</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {segments.map((seg) => (
          <SegmentCard key={seg.code} seg={seg} />
        ))}
      </div>
    </div>
  );
}
