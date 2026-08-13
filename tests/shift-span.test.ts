import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSpan, parseSpan, monthsCovered, shiftsHref, printHref,
} from "../apps/shift-cloud/src/lib/shift-span.ts";

/**
 * シフト作成の期間切替（DECISIONS #135）で守りたいこと:
 *   ① 既定は今までどおり「翌月・1ヶ月」（?ym= の旧URLも動く）
 *   ② 半月の区切りは印刷画面と同じ 1〜15 / 16〜末日
 *   ③ 週の開始は月曜。月をまたいでも7日ちょうど
 *   ④ 一括操作の対象＝days なので、範囲の端が1日でもズレたら事故になる
 */

const TODAY = "2026-08-13"; // 木曜

test("パラメータ無しは翌月・1ヶ月（今までの既定）", () => {
  const r = resolveSpan({ today: TODAY });
  assert.equal(r.span, "month");
  assert.equal(r.start, "2026-09-01");
  assert.equal(r.end, "2026-09-30");
  assert.equal(r.days.length, 30);
  assert.equal(r.ym, "2026-09");
  assert.equal(r.label, "2026年9月");
});

test("旧URLの ?ym= はそのまま効く", () => {
  const r = resolveSpan({ ym: "2026-07", today: TODAY });
  assert.equal(r.start, "2026-07-01");
  assert.equal(r.end, "2026-07-31");
  assert.equal(r.base, "2026-07-01");
});

test("?d= は ?ym= より優先", () => {
  const r = resolveSpan({ span: "day", d: "2026-07-20", ym: "2026-12", today: TODAY });
  assert.equal(r.start, "2026-07-20");
  assert.equal(r.end, "2026-07-20");
  assert.deepEqual(r.days, ["2026-07-20"]);
});

test("日: 前後は1日ずつ動き、月末は翌月1日へ", () => {
  const r = resolveSpan({ span: "day", d: "2026-08-31", today: TODAY });
  assert.equal(r.prev, "2026-08-30");
  assert.equal(r.next, "2026-09-01");
  assert.equal(r.label, "2026年8月31日（月）");
  assert.equal(r.printRange, "custom");
});

test("週: 開始は月曜。水曜を渡してもその週の月曜〜日曜", () => {
  const r = resolveSpan({ span: "week", d: "2026-08-13", today: TODAY }); // 木
  assert.equal(r.start, "2026-08-10"); // 月
  assert.equal(r.end, "2026-08-16");   // 日
  assert.equal(r.days.length, 7);
  assert.equal(r.base, "2026-08-10");
});

test("週: 月曜を渡したらその日が開始（1週間ずれない）", () => {
  const r = resolveSpan({ span: "week", d: "2026-08-10", today: TODAY });
  assert.equal(r.start, "2026-08-10");
  assert.equal(r.end, "2026-08-16");
});

test("週: 日曜は「その週」＝直前の月曜から", () => {
  const r = resolveSpan({ span: "week", d: "2026-08-16", today: TODAY }); // 日
  assert.equal(r.start, "2026-08-10");
  assert.equal(r.end, "2026-08-16");
});

test("週: 月をまたいでも7日ちょうど", () => {
  const r = resolveSpan({ span: "week", d: "2026-08-31", today: TODAY }); // 月曜
  assert.equal(r.start, "2026-08-31");
  assert.equal(r.end, "2026-09-06");
  assert.equal(r.days.length, 7);
  assert.deepEqual(monthsCovered(r.start, r.end), ["2026-08-01", "2026-09-01"]);
});

test("週: →/← は7日ずつ", () => {
  const r = resolveSpan({ span: "week", d: "2026-08-13", today: TODAY });
  assert.equal(r.prev, "2026-08-03");
  assert.equal(r.next, "2026-08-17");
});

test("半月: 15日までは前半（1〜15）", () => {
  for (const d of ["2026-08-01", "2026-08-15"]) {
    const r = resolveSpan({ span: "half", d, today: TODAY });
    assert.equal(r.start, "2026-08-01");
    assert.equal(r.end, "2026-08-15");
    assert.equal(r.days.length, 15);
    assert.equal(r.printRange, "half1");
    assert.equal(r.shortLabel, "8月前半");
  }
});

test("半月: 16日からは後半（16〜末日）", () => {
  const r = resolveSpan({ span: "half", d: "2026-08-16", today: TODAY });
  assert.equal(r.start, "2026-08-16");
  assert.equal(r.end, "2026-08-31");
  assert.equal(r.days.length, 16);
  assert.equal(r.printRange, "half2");
  assert.equal(r.shortLabel, "8月後半");
});

test("半月: 30日の月は後半が16〜30", () => {
  const r = resolveSpan({ span: "half", d: "2026-09-20", today: TODAY });
  assert.equal(r.end, "2026-09-30");
  assert.equal(r.days.length, 15);
});

test("半月: 前半←は前月の後半、後半→は翌月の前半", () => {
  const first = resolveSpan({ span: "half", d: "2026-01-05", today: TODAY });
  assert.equal(first.prev, "2025-12-16");
  assert.equal(first.next, "2026-01-16");
  const second = resolveSpan({ span: "half", d: "2026-12-20", today: TODAY });
  assert.equal(second.prev, "2026-12-01");
  assert.equal(second.next, "2027-01-01");
});

test("月: 末日は月ごとに正しい（うるう年の2月＝29日）", () => {
  assert.equal(resolveSpan({ span: "month", ym: "2024-02", today: TODAY }).end, "2024-02-29");
  assert.equal(resolveSpan({ span: "month", ym: "2026-02", today: TODAY }).end, "2026-02-28");
  assert.equal(resolveSpan({ span: "month", ym: "2100-02", today: TODAY }).end, "2100-02-28"); // 100年ルール
  assert.equal(resolveSpan({ span: "month", ym: "2026-04", today: TODAY }).days.length, 30);
});

test("月: うるう年2月の後半は16〜29", () => {
  const r = resolveSpan({ span: "half", d: "2024-02-16", today: TODAY });
  assert.equal(r.end, "2024-02-29");
  assert.equal(r.days.length, 14);
});

test("月: ←→ は年をまたぐ", () => {
  const r = resolveSpan({ span: "month", ym: "2026-01", today: TODAY });
  assert.equal(r.prev, "2025-12-01");
  assert.equal(r.next, "2026-02-01");
});

test("days は start〜end の連続で、端を含む", () => {
  const r = resolveSpan({ span: "half", d: "2026-08-16", today: TODAY });
  assert.equal(r.days[0], r.start);
  assert.equal(r.days[r.days.length - 1], r.end);
  assert.equal(new Set(r.days).size, r.days.length);
});

test("おかしなURLパラメータは既定に落ちる（落ちない・例外を投げない）", () => {
  assert.equal(parseSpan("hour"), "month");
  assert.equal(parseSpan(null), "month");
  assert.equal(parseSpan("week"), "week");
  // 存在しない日付・書式違いは無視して既定（翌月）
  assert.equal(resolveSpan({ span: "day", d: "2026-02-30", today: TODAY }).start, "2026-09-01");
  assert.equal(resolveSpan({ span: "day", d: "2026-13-01", today: TODAY }).start, "2026-09-01");
  assert.equal(resolveSpan({ span: "day", d: "8/13", today: TODAY }).start, "2026-09-01");
  assert.equal(resolveSpan({ ym: "2026-8", today: TODAY }).start, "2026-09-01");
});

test("monthsCovered は同月なら1件、またぐと両方", () => {
  assert.deepEqual(monthsCovered("2026-08-01", "2026-08-31"), ["2026-08-01"]);
  assert.deepEqual(monthsCovered("2026-12-28", "2027-01-03"), ["2026-12-01", "2027-01-01"]);
});

test("印刷リンク: 半月/月はrange、日/週はcustomで開始終了を渡す", () => {
  const half = resolveSpan({ span: "half", d: "2026-08-16", today: TODAY });
  assert.equal(printHref("S1", half), "/admin/shifts/print?store=S1&ym=2026-08&range=half2");
  const week = resolveSpan({ span: "week", d: "2026-08-31", today: TODAY });
  assert.equal(
    printHref("S1", week),
    "/admin/shifts/print?store=S1&ym=2026-08&range=custom&start=2026-08-31&end=2026-09-06",
  );
});

test("画面リンクは span と基準日を必ず持つ（期間が勝手に月へ戻らない）", () => {
  const r = resolveSpan({ span: "week", d: "2026-08-13", today: TODAY });
  assert.equal(shiftsHref("S1", r.span, r.base), "/admin/shifts?store=S1&span=week&d=2026-08-10");
  assert.equal(shiftsHref("S2", r.span, r.next), "/admin/shifts?store=S2&span=week&d=2026-08-17");
});
