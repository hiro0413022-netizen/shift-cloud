"use client";

import { useActionState } from "react";
import { addProductLine, findProducts } from "../actions";
import { inputCls, btnGhostCls } from "@/components/ui";

// 商品マスタ（発注管理）の item_category と同じ綴りで並べる。
// ここに無い区分は「すべての区分」＋文字で探せば出るが、よく使うものは載せておく。
const CATEGORIES = [
  "",
  "シャフト",
  "クラブ",
  "グリップ",
  "スリーブ",
  "ウッド用 ソケット",
  "アイアン用 ソケット",
  "ボール",
  "グローブ",
  "練習機",
  "工具",
];

/**
 * 商品マスタから探して明細に入れる。
 * 試打していないもの（グリップ・スリーブ・ボール）を入れる入口。
 * 定価は入れた瞬間のマスタの値を写し取る（あとで値上げがあっても、出した見積は動かない）。
 */
export function ProductPicker({ quoteId }: { quoteId: number }) {
  const [state, search, pending] = useActionState(findProducts, {});

  return (
    <div className="space-y-3">
      <form className="flex flex-wrap gap-2">
        <select name="pcat" className={`${inputCls} w-36`} defaultValue="">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c || "すべての区分"}
            </option>
          ))}
        </select>
        <input name="pq" placeholder="商品名・メーカーで探す（例: VENTUS 6S）" className={`${inputCls} flex-1 min-w-48`} />
        <button formAction={search} disabled={pending} className={btnGhostCls}>
          {pending ? "検索中..." : "探す"}
        </button>
      </form>

      {state.error && <p className="text-xs text-red-500">{state.error}</p>}

      {state.rows && state.rows.length > 0 && (
        <ul className="max-h-64 divide-y divide-(--color-line) overflow-auto rounded-lg border border-(--color-line)">
          {state.rows.map((p) => (
            <li key={p.id}>
              <form action={addProductLine} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-(--color-panel-2)">
                <input type="hidden" name="quote_id" value={quoteId} />
                <input type="hidden" name="product_id" value={p.id} />
                <span className="w-28 shrink-0 text-xs text-(--color-dim)">{p.manufacturer}</span>
                <span className="flex-1">
                  {p.name}
                  {p.spec ? ` ${p.spec}` : ""}
                  {p.club_type ? <span className="ml-1 text-xs text-(--color-dim)">{p.club_type}</span> : null}
                </span>
                <span className="w-24 shrink-0 text-right">{(p.list_price ?? 0).toLocaleString("ja-JP")}</span>
                <button className="shrink-0 rounded border border-(--color-line) px-2 py-1 text-xs">入れる</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {state.rows && state.rows.length === 0 && (
        <p className="text-xs text-(--color-dim)">
          見つかりませんでした。マスタに無いものは、下の「マスタに無いものを手で入れる」から入れてください。
        </p>
      )}
    </div>
  );
}
