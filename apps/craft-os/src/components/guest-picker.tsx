"use client";

import { useActionState, useState } from "react";
import { findGuests } from "@/app/actions";
import { inputCls, btnGhostCls, labelCls } from "@/components/ui";

/**
 * お客様をお名前で選ぶ。
 * 受付台帳（6,261人）から選べば、お名前も電話も書かなくてよくなる。
 * 画面に出すのは お名前・フリガナ・電話の下4桁だけ（#226と同じ考え方。店頭で他の方の情報を出さない）。
 */
export function GuestPicker() {
  const [state, action, pending] = useActionState(findGuests, {});
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [manual, setManual] = useState("");

  const last4 = (g: { phone: string | null; mobile: string | null }) => {
    const v = (g.mobile || g.phone || "").replace(/\D/g, "");
    return v ? `…${v.slice(-4)}` : "";
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="guest_id" value={picked?.id ?? ""} />
      <input type="hidden" name="customer_name" value={picked?.name ?? manual} />

      {picked ? (
        <div className="flex items-center gap-3 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2">
          <span className="text-sm font-medium">{picked.name} 様</span>
          <span className="text-xs text-(--color-dim)">受付台帳から</span>
          <button type="button" onClick={() => setPicked(null)} className="ml-auto text-xs text-(--color-dim) underline">
            選び直す
          </button>
        </div>
      ) : (
        <>
          <div>
            <span className={labelCls}>お客様を探す（お名前・フリガナ・お電話）</span>
            <div className="flex gap-2">
              <input name="q" placeholder="例: 山田 / やまだ / 1234" className={inputCls} />
              <button formAction={action} disabled={pending} className={btnGhostCls}>
                {pending ? "検索中..." : "探す"}
              </button>
            </div>
          </div>

          {state.rows && state.rows.length > 0 && (
            <ul className="max-h-48 divide-y divide-(--color-line) overflow-auto rounded-lg border border-(--color-line)">
              {state.rows.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setPicked({ id: g.id, name: g.name ?? "" })}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-(--color-panel-2)"
                  >
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs text-(--color-dim)">{g.name_kana}</span>
                    <span className="ml-auto text-xs text-(--color-dim)">{last4(g)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {state.rows && state.rows.length === 0 && (
            <p className="text-xs text-(--color-dim)">見つかりませんでした。下にお名前を直接ご記入ください。</p>
          )}

          <div>
            <span className={labelCls}>見つからないとき（お名前を直接入力）</span>
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="例: 山田 太郎"
              className={inputCls}
            />
          </div>
        </>
      )}
    </div>
  );
}
