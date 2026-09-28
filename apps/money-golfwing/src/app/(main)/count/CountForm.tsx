"use client";

import { useState } from "react";
import { DENOMS_CLIENT } from "./denoms";
import { inputCls, btnCls, yen, Field } from "@/components/ui";

/**
 * レジ締め（2026-09-28 作り直し）
 *   以前は枚数を入れても保存するまで合計が出ず、「合っているか」が分からなかった。
 *   入れたそばから 合計・帳簿との差 を大きく出す。保存の中身（name=d10000 …）は以前と同じ。
 */
export default function CountForm({
  action,
  today,
  theoretical,
}: {
  action: (fd: FormData) => void | Promise<void>;
  today: string;
  theoretical: number;
}) {
  const [qty, setQty] = useState<Record<number, string>>({});
  const n = (v: string | undefined) => {
    const x = Number(String(v ?? "").replace(/[^\d]/g, ""));
    return Number.isFinite(x) ? x : 0;
  };
  const total = DENOMS_CLIENT.reduce((a, d) => a + d * n(qty[d]), 0);
  const diff = total - theoretical;
  const touched = Object.values(qty).some((v) => v !== "");

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="日付">
          <input type="date" name="counted_at" defaultValue={today} className={inputCls} required />
        </Field>
        <Field label="数える場所">
          <select name="location" className={inputCls} defaultValue="register">
            <option value="register">レジ</option>
            <option value="safe">金庫</option>
          </select>
        </Field>
        <Field label="メモ（任意）">
          <input name="memo" className={inputCls} />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">お札・小銭の<strong>枚数</strong>を入れてください</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {DENOMS_CLIENT.map((d) => (
            <label key={d} className="rounded-lg border border-(--color-line) bg-white p-2 text-center">
              <span className="block text-sm font-bold">{d.toLocaleString()}円</span>
              <input
                name={`d${d}`}
                inputMode="numeric"
                placeholder="0"
                value={qty[d] ?? ""}
                onChange={(e) => setQty({ ...qty, [d]: e.target.value })}
                className="mt-1 w-full rounded-md border border-(--color-line) px-2 py-2 text-center text-lg tabular-nums outline-none focus:border-(--color-gold)"
              />
              <span className="mt-1 block text-xs tabular-nums text-(--color-dim)">{n(qty[d]) ? `${yen(d * n(qty[d]))}円` : " "}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 rounded-xl bg-(--color-panel-2) p-4 sm:grid-cols-3">
        <div>
          <p className="text-sm text-(--color-dim)">数えた合計</p>
          <p className="text-3xl font-bold tabular-nums">{yen(total)}円</p>
        </div>
        <div>
          <p className="text-sm text-(--color-dim)">帳簿ではあるはずの金額</p>
          <p className="text-3xl font-bold tabular-nums text-(--color-dim)">{yen(theoretical)}円</p>
        </div>
        <div>
          <p className="text-sm text-(--color-dim)">差</p>
          {!touched ? (
            <p className="text-lg text-(--color-dim)">枚数を入れると出ます</p>
          ) : diff === 0 ? (
            <p className="text-3xl font-bold text-(--color-ok)">ぴったり ✓</p>
          ) : (
            <p className="text-3xl font-bold tabular-nums text-(--color-accent)">
              {diff > 0 ? "+" : "−"}
              {Math.abs(diff).toLocaleString("ja-JP")}円
              <span className="ml-2 text-sm font-medium">{diff > 0 ? "多い" : "足りない"}</span>
            </p>
          )}
        </div>
      </div>
      {touched && diff !== 0 && (
        <p className="text-sm text-(--color-dim)">
          差があっても保存できます。数え直しても合わないときは、メモに心当たり（おつりの渡し間違い等）を書いてください。
        </p>
      )}

      <button className={`${btnCls} w-full py-3.5 text-lg`}>このレジ締めを保存</button>
    </form>
  );
}
