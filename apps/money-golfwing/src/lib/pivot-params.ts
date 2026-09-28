// pivot-params.ts — 集計表（#285/#287）の条件（URL）の読み書き。画面・CSV・ブラウザ側の操作パネルで共用
// server-only にしない（クライアントの操作パネルからも使う）
import { defaultSort, isDim, isSortKey, type Dim, type SortDir, type SortKey } from "@/lib/pivot";

export type PivotParams = {
  from: string; // YYYY-MM
  to: string; // YYYY-MM
  rows: Dim;
  cols: Dim | null;
  q: string;
  cat: string;
  /** オーナーのみ: all＝全店 / store＝いま選んでいる店舗 */
  scope: "all" | "store";
  /** 並べ替え（#287）。未指定なら defaultSort(rows) */
  sort: SortKey;
  dir: SortDir;
};

const ymOk = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);

export function jstMonth(offset = 0): string {
  const d = new Date(Date.now() + 9 * 3600_000);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function readParams(sp: Record<string, string | undefined>): PivotParams {
  let from = ymOk(sp.from) ? (sp.from as string) : jstMonth(0);
  let to = ymOk(sp.to) ? (sp.to as string) : from;
  if (from > to) [from, to] = [to, from];
  const rows: Dim = isDim(sp.rows) ? sp.rows : "pro";
  const def = defaultSort(rows);
  const sort = isSortKey(sp.sort) ? sp.sort : def.sort;
  return {
    from,
    to,
    rows,
    cols: sp.cols && sp.cols !== "none" && isDim(sp.cols) ? sp.cols : null,
    q: String(sp.q ?? "").slice(0, 60),
    cat: String(sp.cat ?? "").slice(0, 40),
    scope: sp.scope === "store" ? "store" : "all",
    sort,
    dir: sp.dir === "asc" || sp.dir === "desc" ? sp.dir : isSortKey(sp.sort) ? (sort === "label" ? "asc" : "desc") : def.dir,
  };
}

export function toQuery(p: PivotParams): string {
  const u = new URLSearchParams({ from: p.from, to: p.to, rows: p.rows, cols: p.cols ?? "none" });
  if (p.q) u.set("q", p.q);
  if (p.cat) u.set("cat", p.cat);
  if (p.scope === "store") u.set("scope", "store");
  const def = defaultSort(p.rows);
  if (p.sort !== def.sort || p.dir !== def.dir) {
    u.set("sort", p.sort);
    u.set("dir", p.dir);
  }
  return u.toString();
}

export function rangeLabel(p: PivotParams): string {
  const l = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5))}月`;
  return p.from === p.to ? l(p.from) : `${l(p.from)}〜${l(p.to)}`;
}


/** 並び順ボタンの一覧（操作パネルと表の見出しで同じ言葉を使う） */
export function sortChoices(rows: Dim): { key: SortKey; label: string; desc: string; asc: string }[] {
  const time = rows === "month" || rows === "date";
  return [
    { key: "amount", label: "金額", desc: "多い順", asc: "少ない順" },
    { key: "count", label: "件数", desc: "多い順", asc: "少ない順" },
    { key: "qty", label: "回数", desc: "多い順", asc: "少ない順" },
    { key: "unit", label: "1回あたり", desc: "高い順", asc: "安い順" },
    time
      ? { key: "label", label: "日付", desc: "新しい順", asc: "古い順" }
      : { key: "label", label: "名前", desc: "逆順", asc: "あいうえお順" },
  ];
}
