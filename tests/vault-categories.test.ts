import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByCategory, normalizeCategory, VAULT_CATEGORIES } from "../apps/genesis/src/lib/vault-categories.ts";

/**
 * Vault（システム台帳）のグループ化を固定する。
 *
 * 2026-08-07の実障害: 画面が既知カテゴリだけを表示する作りだったため、
 * '社内システム' '開発' 'SNS' など一覧に無いカテゴリの行が **40件中16件、画面から消えていた**。
 * 台帳は「そこに全部ある」ことが価値なので、件数が減る変更は必ずここで落ちるようにする。
 */

test("入力の全件が必ずどこかのグループに入る（1件も消えない）", () => {
  const rows = [
    { category: "site", name: "a" },
    { category: "社内システム", name: "b" },
    { category: "まったく知らない分類", name: "c" },
    { category: "", name: "d" },
    { category: null as unknown as string, name: "e" },
  ];
  const grouped = groupByCategory(rows);
  const total = grouped.reduce((n, g) => n + g.items.length, 0);
  assert.equal(total, rows.length, "グループ化の前後で件数が変わってはいけない");
});

test("過去の表記ゆれを正しいカテゴリに寄せる", () => {
  assert.equal(normalizeCategory("社内システム"), "site");
  assert.equal(normalizeCategory("サイト"), "site");
  assert.equal(normalizeCategory("システム"), "site");
  assert.equal(normalizeCategory("web"), "site");
  assert.equal(normalizeCategory("store"), "site");
  assert.equal(normalizeCategory("開発"), "dev");
  assert.equal(normalizeCategory("SNS"), "sns");
  assert.equal(normalizeCategory("仕入先サイト"), "other");
});

test("未知のカテゴリは other に落とす（例外を投げたり捨てたりしない）", () => {
  assert.equal(normalizeCategory("なにか新しい分類"), "other");
  assert.equal(normalizeCategory(null), "other");
  assert.equal(normalizeCategory(undefined), "other");
  assert.equal(normalizeCategory("  "), "other");
});

test("正規のキーはそのまま通す", () => {
  for (const key of Object.keys(VAULT_CATEGORIES)) {
    assert.equal(normalizeCategory(key), key);
  }
});

test("表示順は定義順（サイト/アプリが先頭・その他が末尾）", () => {
  const grouped = groupByCategory([
    { category: "other", name: "z" },
    { category: "dev", name: "y" },
    { category: "site", name: "x" },
  ]);
  assert.deepEqual(grouped.map((g) => g.cat), ["site", "dev", "other"]);
});

test("グループには画面に出すラベルが付く", () => {
  const grouped = groupByCategory([{ category: "社内システム", name: "a" }]);
  assert.equal(grouped[0].label, "サイト/アプリ");
});
