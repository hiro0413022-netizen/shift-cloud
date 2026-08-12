import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeText, matchesQuery, summarize, optionCounts, resolveRange, shiftMonth, addDay, BLANK_LABEL,
} from "../apps/money-golfwing/src/lib/table-filter.ts";

/**
 * money-os の一覧の「探す・絞る・集計する」（DECISIONS #133）。
 * Excelでやっていたオートフィルタ／Ctrl+F／ピボットの置き換えなので、
 * 表記ゆれで引けない・空欄行が消える、が起きないことを固定する。
 */

test("全角と大文字小文字の差を吸収する", () => {
  assert.equal(normalizeText("ＴＩＴＬＥＩＳＴ"), "titleist");
  assert.equal(normalizeText("  ｸﾞﾘｯﾌﾟ "), "グリップ");
  assert.equal(normalizeText(null), "");
});

test("キーワードは全角入力でも引ける", () => {
  assert.ok(matchesQuery(["TITLEIST Pro V1", "ボール"], "ｔｉｔｌｅｉｓｔ"));
  assert.ok(matchesQuery(["グリップ交換"], "ｸﾞﾘｯﾌﾟ"));
});

test("スペース区切りはAND、-付きは除外", () => {
  const row = ["グリップ交換", "井殿", "現金"];
  assert.ok(matchesQuery(row, "グリップ 井殿"));
  assert.ok(!matchesQuery(row, "グリップ 卜部"));
  assert.ok(!matchesQuery(row, "グリップ -井殿"));
  assert.ok(matchesQuery(row, "グリップ -返品"));
});

test("空の検索語は全件通す（うっかり空振りで0件にしない）", () => {
  assert.ok(matchesQuery(["なんでも"], ""));
  assert.ok(matchesQuery(["なんでも"], "   "));
});

test("数値の列も検索対象にできる", () => {
  assert.ok(matchesQuery(["ボール", 12000], "12000"));
});

type R = { product: string; pro: string; amount: number; qty: number };
const rows: R[] = [
  { product: "グリップ交換", pro: "井殿", amount: 3000, qty: 1 },
  { product: "グリップ交換", pro: "卜部", amount: 3000, qty: 2 },
  { product: "ボール", pro: "", amount: 12000, qty: 3 },
];

test("商品別の集計は金額の大きい順", () => {
  const s = summarize(rows, (r) => r.product, (r) => r.amount, (r) => r.qty);
  assert.deepEqual(s.map((x) => x.key), ["ボール", "グリップ交換"]);
  assert.deepEqual(s[1], { key: "グリップ交換", count: 2, qty: 3, amount: 6000 });
});

test("担当が空欄の行も（未設定）として集計に残す", () => {
  const s = summarize(rows, (r) => r.pro, (r) => r.amount);
  const blank = s.find((x) => x.key === BLANK_LABEL);
  assert.equal(blank?.amount, 12000);
  assert.equal(s.reduce((a, x) => a + x.amount, 0), 18000); // 合計が明細と一致する
});

test("プルダウンの候補は件数の多い順・空欄は出さない", () => {
  const o = optionCounts(rows, (r) => r.pro);
  assert.deepEqual(o, [{ value: "井殿", count: 1 }, { value: "卜部", count: 1 }]);
});

test("期間プリセット（toは翌日/翌月1日＝そのままgte/ltで使える）", () => {
  assert.deepEqual(resolveRange({ preset: "month", month: "2026-08" }), { from: "2026-08-01", to: "2026-09-01", label: "2026-08" });
  const q = resolveRange({ preset: "3m", month: "2026-01" });
  assert.equal(q.from, "2025-11-01");
  assert.equal(q.to, "2026-02-01"); // 年またぎでもズレない
  const y = resolveRange({ preset: "year", month: "2026-08" });
  assert.deepEqual([y.from, y.to], ["2026-01-01", "2027-01-01"]);
});

test("任意期間は終了日も含む", () => {
  const r = resolveRange({ preset: "custom", month: "2026-08", from: "2026-03-01", to: "2026-03-31" });
  assert.equal(r.from, "2026-03-01");
  assert.equal(r.to, "2026-04-01");
});

test("開始と終了を逆に入れてもエラーにしない", () => {
  const r = resolveRange({ preset: "custom", month: "2026-08", from: "2026-05-10", to: "2026-05-01" });
  assert.ok(r.from < r.to);
});

test("月送り・日送り", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(addDay("2026-02-28"), "2026-03-01"); // 2026年は平年
});
