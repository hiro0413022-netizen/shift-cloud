/* ============================================================
   ゴルフ場ごとの色分け（小川さん依頼 2026-08-22 / #146）

   カレンダーや台帳を開いた瞬間に「どのゴルフ場か」「確定か仮か」が分かるようにする。

   決めごと:
   - **色 = ゴルフ場**。主要4社は小川さん指定の色で固定（下の NAMED）。
     それ以外は取引先IDから決めるので、並び替えても月が変わっても同じ色のまま。
     （表示順で割り当てると、取引先が1つ増えた瞬間に全部の色がずれて覚え直しになる）
   - **形 = 状態**。確定は塗りつぶし＋実線、仮は白地＋**破線**＋「仮」の文字。
     色だけで状態を表さない（色覚特性・印刷・見づらい照明の店頭を考えると、色だけの区別は危険）。
     ※ ゴルフ場へ提出するPDF/CSVには仮の印を出さない（#145b・社内だけの情報）。ここは社内画面用。
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

const YELLOW: ClientTone = {
  solid: "bg-yellow-100 text-yellow-900 border-yellow-400",
  outline: "bg-white text-yellow-800 border-yellow-500",
  dot: "bg-yellow-400",
  text: "text-yellow-800",
};
const RED: ClientTone = {
  solid: "bg-red-100 text-red-900 border-red-300",
  outline: "bg-white text-red-800 border-red-400",
  dot: "bg-red-500",
  text: "text-red-800",
};
const BLUE: ClientTone = {
  solid: "bg-blue-100 text-blue-900 border-blue-300",
  outline: "bg-white text-blue-800 border-blue-400",
  dot: "bg-blue-500",
  text: "text-blue-800",
};
const PINK: ClientTone = {
  solid: "bg-pink-100 text-pink-900 border-pink-300",
  outline: "bg-white text-pink-700 border-pink-400",
  dot: "bg-pink-400",
  text: "text-pink-700",
};

/**
 * 小川さん指定の固定色（2026-08-22）。
 * 表記ゆれ（倶/俱・法人名の有無）で外れないよう、**名前に含まれるかどうか**で判定する。
 * 上から順に見て最初に当たったものを使う。
 */
const NAMED: Array<{ match: string; tone: ClientTone }> = [
  { match: "マスターズ", tone: YELLOW }, // 延田エンタープライズ マスターズゴルフ倶楽部
  { match: "加古川", tone: RED },
  { match: "西宮高原", tone: BLUE },
  { match: "芦屋", tone: PINK },
];

/** 指定のない取引先用。上の4色とかぶらない色だけを並べる */
const PALETTE: ClientTone[] = [
  { solid: "bg-emerald-100 text-emerald-900 border-emerald-300", outline: "bg-white text-emerald-800 border-emerald-400", dot: "bg-emerald-400", text: "text-emerald-800" },
  { solid: "bg-violet-100 text-violet-900 border-violet-300", outline: "bg-white text-violet-800 border-violet-400", dot: "bg-violet-400", text: "text-violet-800" },
  { solid: "bg-orange-100 text-orange-900 border-orange-300", outline: "bg-white text-orange-800 border-orange-400", dot: "bg-orange-400", text: "text-orange-800" },
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

/**
 * 取引先の色。名前が分かるときは必ず渡すこと（指定色の判定に使う）。
 * 名前が無い呼び出しでも落ちないよう、ID だけでも動くようにしてある。
 */
export function clientTone(clientId: string | null | undefined, clientName?: string | null): ClientTone {
  if (clientName) {
    const hit = NAMED.find((n) => clientName.includes(n.match));
    if (hit) return hit.tone;
  }
  if (!clientId) return NEUTRAL;
  return PALETTE[hashIndex(clientId, PALETTE.length)];
}

/**
 * 割当1件の見た目。色=ゴルフ場、形=状態。
 * 取消は状態を最優先（グレーの取り消し線）。
 */
export function dispatchChipCls(
  clientId: string | null | undefined,
  status: string,
  clientName?: string | null
): string {
  if (status === "cancelled") return "border border-slate-200 bg-slate-50 text-slate-400 line-through";
  const t = clientTone(clientId, clientName);
  return status === "tentative" ? `border border-dashed ${t.outline}` : `border ${t.solid}`;
}
