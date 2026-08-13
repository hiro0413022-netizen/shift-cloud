// JST日付ヘルパー — Vercel(UTC)上のサーバーコードで「今日」を扱うときは必ずこれを使う。
// genesis の lib/jst.ts と同実装（JST日付ルール）。member-os では素の
// new Date().toISOString() が使われ、JST 0:00〜9:00 の操作で前日日付になるバグがあった（#136）。
const TZ = "Asia/Tokyo";

/** 例: "2026-07-19"（DBのdate列・dedupeキー用） */
export function jstYmd(d: Date = new Date()): string {
  // sv-SE ロケールは YYYY-MM-DD を返す
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

/** 例: "2026/7/19"（表示用） */
export function jstDateJa(d: Date = new Date()): string {
  return d.toLocaleDateString("ja-JP", { timeZone: TZ });
}
