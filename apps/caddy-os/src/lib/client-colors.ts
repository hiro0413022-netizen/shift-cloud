/* ============================================================
   ゴルフ場ごとの色分け（小川さん依頼 2026-08-22 / #146）

   カレンダーや台帳を開いた瞬間に「どのゴルフ場か」「確定か仮か」が分かるようにする。

   決めごと:
   - **色 = ゴルフ場**。色は取引先IDから決めるので、並び替えても月が変わっても同じ色のまま。
     （表示順で割り当てると、取引先が1つ増えた瞬間に全部の色がずれて覚え直しになる）
   - **形 = 状態**。確定は塗りつぶし＋実線、仮は白地＋**破線**＋「仮」の文字。
     色だけで状態を表さない（色覚特性・印刷・見づらい照明の店頭を考えると、色だけの区別は危険）。
   - Tailwind v4 は class 名を静的に走査するので、**クラス文字列はここにベタ書き**する。
     `bg-${color}-100` のような組み立ては CSS が生成されず無色になる。
   ============================================================ */

export type ClientTone = {
  /** カレンダーの帯など、塗りつぶしで使う（確定用） */
  solid: string;
  /** 仮のときの白地＋破線 */
  outline: string;
  /** 凡例・一覧の先頭に置く丸 */
  dot: string;
  /** 文字色だけ要るとき */
  text: string;
};

/** 10色。ゴルフ場が10を超えたら先頭から一巡する（実運用は7社） */
const PALETTE: ClientTone[] = [
  { solid: "bg-sky-100 text-sky-900 border-sky-300", outline: "bg-white text-sky-800 border-sky-400", dot: "bg-sky-400", text: "text-sky-800" },
  { solid: "bg-emerald-100 text-emerald-900 border-emerald-300", outline: "bg-white text-emerald-800 border-emerald-400", dot: "bg-emerald-400", text: "text-emerald-800" },
  { solid: "bg-violet-100 text-violet-900 border-violet-300", outline: "bg-white text-violet-800 border-violet-400", dot: "bg-violet-400", text: "text-violet-800" },
  { solid: "bg-orange-100 text-orange-900 border-orange-300", outline: "bg-white text-orange-800 border-orange-400", dot: "bg-orange-400", text: "text-orange-800" },
  { solid: "bg-rose-100 text-rose-900 border-rose-300", outline: "bg-white text-rose-800 border-rose-400", dot: "bg-rose-400", text: "text-rose-800" },
  { solid: "bg-teal-100 text-teal-900 border-teal-300", outline: "bg-white text-teal-800 border-teal-400", dot: "bg-teal-400", text: "text-teal-800" },
  { solid: "bg-indigo-100 text-indigo-900 border-indigo-300", outline: "bg-white text-indigo-800 border-indigo-400", dot: "bg-indigo-400", text: "text-indigo-800" },
  { solid: "bg-lime-100 text-lime-900 border-lime-300", outline: "bg-white text-lime-800 border-lime-400", dot: "bg-lime-400", text: "text-lime-800" },
  { solid: "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300", outline: "bg-white text-fuchsia-800 border-fuchsia-400", dot: "bg-fuchsia-400", text: "text-fuchsia-800" },
  { solid: "bg-cyan-100 text-cyan-900 border-cyan-300", outline: "bg-white text-cyan-800 border-cyan-400", dot: "bg-cyan-400", text: "text-cyan-800" },
];

/** ゴルフ場が未設定のとき、および自社ゴルフウィング勤務 */
const NEUTRAL: ClientTone = {
  solid: "bg-slate-100 text-slate-700 border-slate-300",
  outline: "bg-white text-slate-600 border-slate-400",
  dot: "bg-slate-400",
  text: "text-slate-600",
};

/** IDから安定した番号を作る（同じIDなら常に同じ色） */
function hashIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function clientTone(clientId: string | null | undefined): ClientTone {
  if (!clientId) return NEUTRAL;
  return PALETTE[hashIndex(clientId, PALETTE.length)];
}

/**
 * 割当1件の見た目。色=ゴルフ場、形=状態。
 * 取消は状態を最優先（グレーの取り消し線）。
 */
export function dispatchChipCls(clientId: string | null | undefined, status: string): string {
  if (status === "cancelled") return "border border-slate-200 bg-slate-50 text-slate-400 line-through";
  const t = clientTone(clientId);
  return status === "tentative" ? `border border-dashed ${t.outline}` : `border ${t.solid}`;
}
