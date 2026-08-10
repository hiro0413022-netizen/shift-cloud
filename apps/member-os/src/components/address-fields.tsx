"use client";

import { useState } from "react";
import { PREFECTURES, lookupPostal, normalizePostal, splitPrefecture } from "@/lib/address";

/**
 * 郵便番号 → 都道府県・住所 を自動入力する共通フィールド。
 * 7桁そろった時点で zipcloud を引き、都道府県(select)と市区町村以降を埋める。
 * 見た目はアプリ側のクラスを渡して合わせる（受付台帳＝小さめ / タブレット＝大きめ）。
 */
export function AddressFields({
  inputClassName,
  labelClassName,
  defaults,
  showBuilding = true,
  required = false,
  wideClassName = "sm:col-span-2",
}: {
  inputClassName: string;
  labelClassName: string;
  defaults?: {
    postal_code?: string;
    prefecture?: string;
    address1?: string;
    building?: string;
  };
  showBuilding?: boolean;
  required?: boolean;
  wideClassName?: string;
}) {
  // defaults.address1 に都道府県が混ざっている旧データも正しく分解して表示する
  const seed = splitPrefecture(defaults?.address1 ?? "");
  const [postal, setPostal] = useState(defaults?.postal_code ?? "");
  const [prefecture, setPrefecture] = useState(defaults?.prefecture || seed.prefecture || "");
  const [address1, setAddress1] = useState(defaults?.prefecture ? (defaults?.address1 ?? "") : seed.rest);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function onPostalChange(value: string) {
    setPostal(value);
    setNotFound(false);
    if (!normalizePostal(value)) return;
    setLoading(true);
    const r = await lookupPostal(value);
    setLoading(false);
    if (!r) return setNotFound(true);
    setPrefecture(r.prefecture);
    // 番地・建物などの手入力済み部分は消さない（市区町村だけ差し替え）
    setAddress1((prev) => {
      const kept = prev.trim();
      return kept && kept.startsWith(r.city) ? kept : r.city;
    });
  }

  return (
    <>
      <label className="block text-sm">
        <span className={labelClassName}>
          郵便番号
          {loading && <span className="ml-2 text-xs text-accent">住所を検索中…</span>}
          {notFound && <span className="ml-2 text-xs text-amber-600">該当なし（手入力してください）</span>}
        </span>
        <input
          name="postal_code"
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="670-0000"
          className={inputClassName}
          value={postal}
          onChange={(e) => onPostalChange(e.target.value)}
        />
      </label>

      <label className="block text-sm">
        <span className={labelClassName}>都道府県{required && <span className="text-rose-500"> *</span>}</span>
        <select
          name="prefecture"
          className={inputClassName}
          value={prefecture}
          required={required}
          onChange={(e) => setPrefecture(e.target.value)}
        >
          <option value="">選択</option>
          {PREFECTURES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className={`block text-sm ${wideClassName}`}>
        <span className={labelClassName}>住所（市区町村・番地）{required && <span className="text-rose-500"> *</span>}</span>
        <input
          name="address1"
          type="text"
          autoComplete="address-line1"
          placeholder="姫路市〇〇町1-2-3"
          className={inputClassName}
          value={address1}
          required={required}
          onChange={(e) => setAddress1(e.target.value)}
        />
      </label>

      {showBuilding && (
        <label className="block text-sm">
          <span className={labelClassName}>建物・部屋番号</span>
          <input
            name="building"
            type="text"
            autoComplete="address-line2"
            defaultValue={defaults?.building ?? ""}
            placeholder="〇〇マンション101"
            className={inputClassName}
          />
        </label>
      )}
    </>
  );
}
