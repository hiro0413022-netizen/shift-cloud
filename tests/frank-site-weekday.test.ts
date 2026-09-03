import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * 体験予約ページの曜日ズレの再発防止（#200・2026-09-03）
 *
 * 実障害: お客様が 9/2（水）の体験を予約したのに、選択中の表示と完了画面が
 *         「9/2（火）」と出ていた。火曜は定休日なので、お客様は不安になる。
 *
 * 原因: new Date("2026-09-02T00:00:00+09:00") は UTC では 2026-09-01T15:00Z。
 *       そこへ getUTCDay() を掛けると**前日の曜日**が返る。
 *
 * 決まり: 日付だけの文字列から曜日を出すときは "T00:00:00Z"（または T12:00:00Z）で読む。
 *         サイトの inline JS はテストから import できないので、**書き方そのもの**を見張る。
 */

const FILES = ["sites/frank-golf/trial-booking.html", "sites/frank-golf/_build.py"];

test("体験予約ページに +09:00 のまま getUTCDay する書き方が無い", () => {
  for (const f of FILES) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.equal(
      src.includes("T00:00:00+09:00"),
      false,
      `${f}: 日付文字列に +09:00 を付けると getUTCDay() が前日の曜日を返します（"T00:00:00Z" を使ってください）`
    );
  }
});

test("曜日の出し方（Z で読む）が実際に正しい", () => {
  const WD = ["日", "月", "火", "水", "木", "金", "土"];
  const dow = (d: string) => WD[new Date(`${d}T00:00:00Z`).getUTCDay()];
  assert.equal(dow("2026-09-02"), "水"); // プレオープン日
  assert.equal(dow("2026-09-03"), "木");
  assert.equal(dow("2026-09-08"), "火"); // 定休日
  // 旧実装なら1日前の曜日になっていたこと（同じ間違いを二度としないための記録）
  assert.equal(WD[new Date("2026-09-02T00:00:00+09:00").getUTCDay()], "火");
});
