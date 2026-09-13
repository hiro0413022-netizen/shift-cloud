"use client";

import { useActionState } from "react";
import { findProductsForDemo, linkDemoShaft, markNoProduct } from "./actions";
import { inputCls } from "@/components/ui";

/**
 * 未一致の1本を、人が選んで紐づける画面。
 * 自動で当てられなかったものだけがここに並ぶ（今は 123本）。
 */
export function LinkRow({ demoNo, name, maker, clubType, price }: {
  demoNo: number;
  name: string;
  maker: string;
  clubType: string | null;
  price: number | null;
}) {
  const [state, search, pending] = useActionState(findProductsForDemo, {});

  return (
    <div className="rounded-lg border border-(--color-line) p-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="w-14 shrink-0 font-mono text-xs text-(--color-dim)">{demoNo}</span>
        <span className="font-medium">{name}</span>
        <span className="text-xs text-(--color-dim)">{maker}</span>
        {clubType && <span className="text-xs text-(--color-dim)">{clubType}</span>}
        {price != null && <span className="text-xs text-(--color-dim)">Excel定価 {price.toLocaleString("ja-JP")}</span>}
      </div>

      <form className="mt-2 flex flex-wrap gap-2">
        <input type="hidden" name="demo_no" value={demoNo} />
        <input name="dq" defaultValue={name.replace(/[（(].*?[）)]/g, "").trim()} className={`${inputCls} flex-1 min-w-56 px-2 py-1 text-xs`} />
        <button formAction={search} disabled={pending} className="rounded border border-(--color-line) px-2 py-1 text-xs">
          {pending ? "検索中..." : "候補を探す"}
        </button>
        <button
          formAction={markNoProduct}
          className="rounded border border-(--color-line) px-2 py-1 text-xs text-(--color-dim)"
        >
          マスタに登録しない
        </button>
      </form>

      {state.rows && state.demoNo === demoNo && (
        <ul className="mt-2 max-h-48 divide-y divide-(--color-line) overflow-auto rounded border border-(--color-line)">
          {state.rows.length === 0 && (
            <li className="px-2 py-2 text-xs text-(--color-dim)">
              候補がありません。発注管理の商品マスタに登録してから、もう一度お試しください。
            </li>
          )}
          {state.rows.map((p) => (
            <li key={p.id}>
              <form action={linkDemoShaft} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-(--color-panel-2)">
                <input type="hidden" name="demo_no" value={demoNo} />
                <input type="hidden" name="product_id" value={p.id} />
                <span className="w-24 shrink-0 text-(--color-dim)">{p.manufacturer}</span>
                <span className="flex-1">
                  {p.name}
                  {p.spec ? ` ${p.spec}` : ""}
                  {p.club_type ? ` (${p.club_type})` : ""}
                </span>
                <span className="w-20 shrink-0 text-right">{(p.list_price ?? 0).toLocaleString("ja-JP")}</span>
                <button className="shrink-0 rounded border border-(--color-line) px-2 py-0.5">これにする</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
