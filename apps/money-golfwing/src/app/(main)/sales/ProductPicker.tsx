"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { inputCls } from "@/components/ui";

/** 在庫リスト（Inventory OS inv_stock）から渡す1品番 */
export type InvPick = {
  id: string;
  code: string;       // 管理番号 'DRC-TM-001'
  category: string;   // 品目
  maker: string;
  name: string;
  variant: string | null;
  listPrice: number | null; // 定価（税抜想定）
  stock: number;      // 理論在庫
};

/** 検索用正規化: 全角→半角・小文字・カタカナ→ひらがな */
function norm(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function invLabel(it: InvPick): string {
  return [it.maker, it.name, it.variant].filter(Boolean).join(" ");
}

/**
 * 品名入力欄。自由入力＋ドロップダウンで「最近の入力」「在庫品番」から選べる。
 * 設計方針: 362品番を全部見せない。
 *  - 未入力時: 品目チップ（ドライバー/ボール…）＋最近使った品名だけ
 *  - 文字を打つと即絞り込み（履歴→在庫の順、コード・メーカー・品名を横断一致）
 *  - 在庫品番を選ぶと invItemId が付き、保存時に在庫が自動で減る
 *  - 手で文字を書き換えると在庫リンクは外れる（実在しない紐付けを残さない）
 */
export default function ProductPicker({
  value,
  invItemId,
  recent,
  items,
  placeholder = "品名・内容（入力で在庫検索）",
  className = "",
  autoFocusRef,
  onChange,
  onPick,
}: {
  value: string;
  invItemId: string | null;
  recent: string[];
  items: InvPick[];
  placeholder?: string;
  className?: string;
  /** 親からフォーカス制御したいとき（連続入力で保存後に戻す） */
  autoFocusRef?: RefObject<HTMLInputElement | null>;
  /** 自由入力（在庫リンクは外れる） */
  onChange: (name: string) => void;
  /** 在庫品番を選択（品名・invItemId・定価を親へ） */
  onPick: (it: InvPick) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const innerRef = useRef<HTMLInputElement>(null);
  const inputRef = autoFocusRef ?? innerRef;

  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const it of items) seen.set(it.category, (seen.get(it.category) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [items]);

  const q = norm(value.trim());
  const linked = items.find((it) => it.id === invItemId) ?? null;

  // 履歴の一致（最大4件・在庫と重複する見た目は許容）
  const recentHits = useMemo(() => {
    if (!q) return recent.slice(0, 8);
    return recent.filter((r) => norm(r).includes(q)).slice(0, 4);
  }, [q, recent]);

  // 在庫の一致（品目チップで絞り→コード/メーカー/品名/仕様を横断）
  const invHits = useMemo(() => {
    let pool = cat ? items.filter((it) => it.category === cat) : items;
    if (q) pool = pool.filter((it) => norm(`${it.code} ${it.maker} ${it.name} ${it.variant ?? ""}`).includes(q));
    // 未入力×チップなしでは出さない（362件のダラ見せをしない）
    if (!q && !cat) return [];
    return pool.slice(0, 12);
  }, [q, cat, items]);

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        placeholder={placeholder}
        className={inputCls}
      />
      {linked && (
        <div className="mt-1 flex items-center gap-1 text-xs text-(--color-gold)">
          <span>在庫連動 {linked.code}（在庫 {linked.stock}）</span>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange(value)}
            className="text-(--color-dim) hover:text-(--color-accent)" aria-label="在庫リンクを外す">×</button>
        </div>
      )}

      {open && (recentHits.length > 0 || invHits.length > 0 || categories.length > 0) && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-(--color-line) bg-(--color-panel) p-2 shadow-xl">
          {/* 品目チップ（在庫を品目で絞る） */}
          {categories.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setCat(cat === c ? null : c)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${cat === c ? "border-(--color-gold) text-(--color-gold)" : "border-(--color-line) text-(--color-dim)"}`}
                >{c}</button>
              ))}
            </div>
          )}

          {recentHits.length > 0 && (
            <>
              <p className="px-1 pb-1 text-[11px] text-(--color-dim)">最近の入力（在庫連動なし）</p>
              {recentHits.map((r) => (
                <button
                  key={`r-${r}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(r); setOpen(false); }}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-(--color-bg)"
                >{r}</button>
              ))}
            </>
          )}

          {invHits.length > 0 && (
            <>
              <p className="px-1 pb-1 pt-2 text-[11px] text-(--color-dim)">在庫リスト{cat ? `（${cat}）` : ""} — 選ぶと保存時に在庫が減ります</p>
              {invHits.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onPick(it); setOpen(false); }}
                  className="block w-full rounded px-2 py-1.5 text-left hover:bg-(--color-bg)"
                >
                  <span className="text-sm">{invLabel(it)}</span>
                  <span className="ml-2 text-xs tabular-nums text-(--color-dim)">
                    {it.code} ／ 在庫 {it.stock}{it.listPrice ? ` ／ 定価 ${Number(it.listPrice).toLocaleString("ja-JP")}` : ""}
                  </span>
                </button>
              ))}
            </>
          )}

          {q && recentHits.length === 0 && invHits.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-(--color-dim)">一致なし。このまま自由入力で保存できます</p>
          )}
        </div>
      )}
    </div>
  );
}
