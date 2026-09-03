/**
 * 「音が鳴ったとき、それが何なのか」を1行で言う（#202・2026-09-03 ユーザー依頼）
 *
 * これまでは音と一緒に「予約に動きがありました」としか出ていなかった。
 * 鳴った理由が分からないと、結局どの画面のどこを探せばいいのか分からず、
 * **鳴っても何もしない**（そして本当に困る通知も見逃す）ようになる。
 *
 * ここは文字を作るだけの純関数にしてある（DBもReactも触らない＝テストで固定できる）。
 */

export type LiveKind = "trial" | "member" | "dropin" | "lesson" | "order" | "cancel";

export type LiveItem = {
  /** 同じ知らせを二度出さないための鍵（行のid＋更新時刻） */
  key: string;
  kind: LiveKind;
  /** 画面に出す1行。例「体験 9/5(金) 13:00 岸田 拓也 様・C打席」 */
  text: string;
  /** 並べ替え用（ISO文字列） */
  at: string;
};

const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** 「9/5(金)」。日付だけの文字列は必ず UTC として読む（+09:00 は前日の曜日になる・#200） */
export function mdw(dateStr: string | null | undefined): string {
  const s = String(dateStr ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(`${s}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`;
}

/** timestamptz → JSTの "HH:MM"（サーバーはUTCなので必ずここを通す） */
export function hhmmJst(iso: string | null | undefined): string {
  const t = Date.parse(String(iso ?? ""));
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 9 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const KIND_LABEL: Record<LiveKind, string> = {
  trial: "体験",
  member: "会員の予約",
  dropin: "都度利用",
  lesson: "レッスン",
  order: "注文",
  cancel: "取消",
};

export function kindLabel(kind: LiveKind): string {
  return KIND_LABEL[kind] ?? "お知らせ";
}

/** 予約1件を1行にする */
export function bookingLine(input: {
  kind: LiveKind;
  date?: string | null;
  start?: string | null;
  name?: string | null;
  bay?: string | null;
  cancelled?: boolean;
}): string {
  const when = [mdw(input.date), String(input.start ?? "").slice(0, 5)].filter(Boolean).join(" ");
  const who = input.name ? `${input.name} 様` : "お名前未入力";
  const head = input.cancelled ? `${kindLabel(input.kind)}を取消` : kindLabel(input.kind);
  // 日程未定の申込（体験はフォームから日付なしで届くことがある）を「未定」と言い切る
  return [head, when || "日程未定", who, input.bay ?? null].filter(Boolean).join(" ／ ");
}

/** 注文1件を1行にする（何を・どこへ） */
export function orderLine(input: {
  bay?: string | null;
  who?: string | null;
  items: Array<{ name?: string | null; qty?: number | null }>;
  at?: string | null;
}): string {
  const what = input.items
    .map((i) => `${String(i.name ?? "").trim() || "商品"}×${Number(i.qty ?? 1)}`)
    .slice(0, 4)
    .join("・");
  const more = input.items.length > 4 ? ` ほか${input.items.length - 4}点` : "";
  const time = hhmmJst(input.at);
  return [
    "注文",
    input.bay || "打席未定",
    input.who || null,
    (what || "内容なし") + more,
    time ? `${time}` : null,
  ]
    .filter(Boolean)
    .join(" ／ ");
}

/** 新しく届いたものだけを残す（key で見分ける）。古い順に見せたいので昇順に直す */
export function pickNew(items: LiveItem[], seen: Set<string>): LiveItem[] {
  return items.filter((i) => !seen.has(i.key)).sort((a, b) => (a.at < b.at ? -1 : 1));
}
