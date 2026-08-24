"use client";

// 営業先一覧（検索つき・クライアント側で即時絞り込み）
// 412件超のリストから探すのに時間がかかる問題への対応。入力するそばから絞り込まれる。
// 表記ゆれはNFKCで吸収（全角/半角・大文字/小文字・空白）。電話番号は数字だけでも一致する。

import { useMemo, useState } from "react";
import Link from "next/link";
import { cardCls, inputCls } from "@/components/ui";
import { INDUSTRIES, STATUSES, type IndustryKey, type StatusKey } from "@/lib/types";

export type ProspectListRow = {
  id: string;
  name: string;
  industry: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  status: string;
  score: number | null;
  next_action: string | null;
};

const norm = (v: string | null | undefined) => (v ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");

const statusColor = (st: string) =>
  ["won", "transferred"].includes(st)
    ? "text-(--color-ok)"
    : ["lost", "unreachable"].includes(st)
      ? "text-(--color-danger)"
      : ["demo_done", "ready", "meeting_set"].includes(st)
        ? "text-(--color-accent)"
        : "text-(--color-dim)";

export function ProspectTable({ rows, demoTokens }: { rows: ProspectListRow[]; demoTokens: Record<string, string> }) {
  const [q, setQ] = useState("");
  const query = norm(q);
  const queryDigits = q.replace(/\D/g, "");

  const filtered = useMemo(() => {
    if (!query) return rows;
    return rows.filter((r) => {
      const fields = [
        r.name,
        r.city,
        r.address,
        r.phone,
        r.status,
        STATUSES[r.status as StatusKey],
        INDUSTRIES[r.industry as IndustryKey],
        r.industry,
        r.next_action,
      ];
      if (fields.some((f) => norm(f).includes(query))) return true;
      // 電話番号はハイフン有無を無視して数字だけで照合
      if (queryDigits.length >= 3 && (r.phone ?? "").replace(/\D/g, "").includes(queryDigits)) return true;
      return false;
    });
  }, [rows, query, queryDigits]);

  return (
    <section className={cardCls}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          営業先一覧（{query ? `${filtered.length}/${rows.length}` : rows.length}件）
        </h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="検索: 院名・地域・電話・業種・ステータス"
          className={`${inputCls} w-full max-w-80`}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
              <th className="py-2 pr-3">院名</th>
              <th className="py-2 pr-3">業種</th>
              <th className="py-2 pr-3">地域</th>
              <th className="py-2 pr-3">ステータス</th>
              <th className="py-2 pr-3">スコア</th>
              <th className="py-2 pr-3">デモ</th>
              <th className="py-2">次のアクション</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-(--color-line) last:border-0">
                <td className="py-2 pr-3">
                  <Link href={`/p/${r.id}`} className="font-medium text-(--color-accent) hover:underline">{r.name}</Link>
                </td>
                <td className="py-2 pr-3">{INDUSTRIES[r.industry as IndustryKey] ?? r.industry}</td>
                <td className="py-2 pr-3">{r.city ?? "—"}</td>
                <td className={`py-2 pr-3 ${statusColor(r.status)}`}>{STATUSES[r.status as StatusKey] ?? r.status}</td>
                <td className="py-2 pr-3">{r.score ?? "—"}</td>
                <td className="py-2 pr-3">
                  {demoTokens[r.id] ? (
                    <a href={`/d/${demoTokens[r.id]}?preview=1`} target="_blank" className="text-(--color-ok) hover:underline">表示</a>
                  ) : (
                    <span className="text-(--color-dim)">未作成</span>
                  )}
                </td>
                <td className="py-2 text-xs text-(--color-dim)">{r.next_action ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-4 text-center text-sm text-(--color-dim)">「{q}」に一致する営業先はありません</p>
        )}
      </div>
    </section>
  );
}
