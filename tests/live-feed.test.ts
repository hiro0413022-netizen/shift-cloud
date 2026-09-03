import { test } from "node:test";
import assert from "node:assert/strict";
import { mdw, hhmmJst, bookingLine, orderLine, pickNew, type LiveItem } from "../apps/member-os/src/lib/live-feed-pure.ts";

/**
 * 通知の1行（#202）。守りたいのは3つ:
 *   ① 鳴った理由が読んだだけで分かる（区分・いつ・だれ・どこ）
 *   ② 曜日がずれない（#200 の再発防止）
 *   ③ 同じ知らせを二度出さない
 */

test("曜日は日付文字列をUTCで読む（9/5は土）", () => {
  assert.equal(mdw("2026-09-05"), "9/5(土)");
  assert.equal(mdw("2026-09-02"), "9/2(水)");
  assert.equal(mdw(null), "");
});

test("時刻はJSTに直す", () => {
  assert.equal(hhmmJst("2026-09-03T05:30:00+00:00"), "14:30");
  assert.equal(hhmmJst("こわれた値"), "");
});

test("予約の1行に 区分・日時・お名前・打席が入る", () => {
  assert.equal(
    bookingLine({ kind: "trial", date: "2026-09-05", start: "13:00:00", name: "岸田 拓也", bay: "C打席" }),
    "体験 ／ 9/5(土) 13:00 ／ 岸田 拓也 様 ／ C打席"
  );
});

test("日程未定の申込は「日程未定」と言い切る", () => {
  assert.equal(bookingLine({ kind: "trial", name: "山田 花子" }), "体験 ／ 日程未定 ／ 山田 花子 様");
});

test("取消は取消と分かる", () => {
  const line = bookingLine({ kind: "member", date: "2026-09-05", start: "10:00", name: "福島 晃", cancelled: true });
  assert.ok(line.startsWith("会員の予約を取消"));
});

test("注文はどこへ・何をが分かる", () => {
  assert.equal(
    orderLine({ bay: "A打席", who: "福島 晃 様", items: [{ name: "コーヒー", qty: 1 }, { name: "トースト", qty: 2 }], at: "2026-09-03T05:32:00Z" }),
    "注文 ／ A打席 ／ 福島 晃 様 ／ コーヒー×1・トースト×2 ／ 14:32"
  );
});

test("品数が多いときは4点まで＋ほか◯点", () => {
  const items = [1, 2, 3, 4, 5, 6].map((i) => ({ name: `品${i}`, qty: 1 }));
  assert.ok(orderLine({ bay: "B打席", items }).includes("ほか2点"));
});

test("一度出した知らせは二度出さない", () => {
  const a: LiveItem = { key: "1@t2", kind: "trial", text: "x", at: "2026-09-03T02:00:00Z" };
  const b: LiveItem = { key: "2@t1", kind: "order", text: "y", at: "2026-09-03T01:00:00Z" };
  const got = pickNew([a, b], new Set(["1@t2"]));
  assert.deepEqual(got.map((i) => i.key), ["2@t1"]);
});
