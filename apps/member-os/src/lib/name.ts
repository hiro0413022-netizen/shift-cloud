/**
 * 氏名の結合・分解。
 *
 * お客様に入力してもらうときは必ず「姓」「名」を分ける（1欄だと
 * 「山田太郎」「太郎 山田」「山田　太郎（全角）」が混ざり、名簿の並び替え・
 * 宛名・Excel出力・重複判定がすべて崩れる）。
 * 一方 DB 側は name / name_kana の1列のままなので、保存時にここで結合する。
 */

function t(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/**
 * 姓・名を1つの氏名に結合する（区切りは半角スペース）。
 * fallback は旧フォーム（お名前1欄）からの送信を受けるための保険。
 * 例: joinName("山田", "太郎") → "山田 太郎"
 */
export function joinName(
  family: string | null | undefined,
  given: string | null | undefined,
  fallback?: string | null
): string {
  const joined = [t(family), t(given)].filter(Boolean).join(" ");
  return joined || t(fallback);
}

/**
 * 「山田 太郎」を姓・名に分解する（編集フォームの初期値用）。
 * 区切りは半角/全角スペース。区切りが無い場合はすべて姓に入れる
 * （勝手に文字数で割ると「佐々木」「宮」のような姓を壊す）。
 */
export function splitName(full: string | null | undefined): { family: string; given: string } {
  const s = t(full).replace(/[\s　]+/g, " ");
  if (!s) return { family: "", given: "" };
  const i = s.indexOf(" ");
  if (i < 0) return { family: s, given: "" };
  return { family: s.slice(0, i), given: s.slice(i + 1).trim() };
}

type FormLike = { get(name: string): FormDataEntryValue | null };

/**
 * フォームから氏名・フリガナを取り出して結合済みの値にする。
 * 4つのフォーム（/join-web, /join/[token], /trial, /reception）で同じ扱いにするため
 * サーバーアクションからはこれを呼ぶ。
 */
export function readName(form: FormLike): { name: string; nameKana: string | null } {
  const g = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    name: joinName(g("family_name"), g("given_name"), g("name")),
    nameKana: joinName(g("family_name_kana"), g("given_name_kana"), g("name_kana")) || null,
  };
}
