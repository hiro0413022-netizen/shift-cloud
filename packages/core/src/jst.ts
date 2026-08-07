// JST日付ヘルパー — Vercel(UTC)上のサーバーコードで「今日」を扱うときは必ずこれを使う。
// 背景: 日次cronは6:00 JST＝前日21:00 UTCに走るため、new Date()のUTC日付をそのまま使うと
// レポートタイトル・タスク日付・dedupeキーが全て「前日」になる（2026-07-19に発覚 / #73）。
//
// apps/genesis/src/lib/jst.ts からの逐語切り出し（inventory-osにもコピーが発生していたためcoreへ集約）。
// 既存アプリのコピーは当面そのまま（B-6: 移行は1アプリずつ・Vercelビルド確認付き）。新規アプリはこちらを使う。
const TZ = "Asia/Tokyo";

/** 例: "2026/7/19"（レポートタイトル・本文表示用） */
export function jstDateJa(d: Date = new Date()): string {
  return d.toLocaleDateString("ja-JP", { timeZone: TZ });
}

/** 例: "2026-07-19"（DBのdate列・dedupeキー用） */
export function jstYmd(d: Date = new Date()): string {
  // sv-SE ロケールは YYYY-MM-DD を返す
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

/** JST基準の月初日 "YYYY-MM-01"。offsetMonths=-1 で前月初。 */
export function jstMonthStart(offsetMonths = 0, base: Date = new Date()): string {
  const ymd = jstYmd(base);
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1 + offsetMonths, 1));
  return d.toISOString().slice(0, 10);
}
