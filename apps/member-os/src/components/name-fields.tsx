"use client";

import { splitName } from "@/lib/name";

/**
 * 氏名の入力（姓／名・セイ／メイ）の共通フィールド。
 * お客様の入力欄は必ずこれを使う（1欄だと表記が混ざって名簿が崩れる。詳細は lib/name.ts）。
 * AddressFields と同じく grid の中に置く前提で、セルだけを返す。
 */
export function NameFields({
  inputClassName,
  labelClassName,
  defaults,
  required = true,
  kana = true,
  requiredMark,
}: {
  inputClassName: string;
  labelClassName: string;
  defaults?: { name?: string | null; name_kana?: string | null };
  required?: boolean;
  kana?: boolean;
  /** 必須マークの色をアプリに合わせる（例: <span className="text-rose-500"> *</span>） */
  requiredMark?: React.ReactNode;
}) {
  const n = splitName(defaults?.name);
  const k = splitName(defaults?.name_kana);
  const mark = required ? (requiredMark ?? <span className="text-rose-500"> *</span>) : null;

  return (
    <>
      <label className="block text-sm">
        <span className={labelClassName}>姓{mark}</span>
        <input
          name="family_name"
          type="text"
          autoComplete="family-name"
          required={required}
          defaultValue={n.family}
          placeholder="山田"
          className={inputClassName}
        />
      </label>

      <label className="block text-sm">
        <span className={labelClassName}>名{mark}</span>
        <input
          name="given_name"
          type="text"
          autoComplete="given-name"
          required={required}
          defaultValue={n.given}
          placeholder="太郎"
          className={inputClassName}
        />
      </label>

      {kana && (
        <>
          <label className="block text-sm">
            <span className={labelClassName}>セイ（フリガナ）</span>
            <input
              name="family_name_kana"
              type="text"
              defaultValue={k.family}
              placeholder="ヤマダ"
              className={inputClassName}
            />
          </label>

          <label className="block text-sm">
            <span className={labelClassName}>メイ（フリガナ）</span>
            <input
              name="given_name_kana"
              type="text"
              defaultValue={k.given}
              placeholder="タロウ"
              className={inputClassName}
            />
          </label>
        </>
      )}
    </>
  );
}
