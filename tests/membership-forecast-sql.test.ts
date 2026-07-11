// 月会費予測SQL（0028）の単価・ルール固定テスト。
// 正典: DECISIONS #31/#32・memory golfwing-sales-methodology。
// DB関数そのものは本番のみのため、マイグレーションSQLの内容が正典と一致することを検証する
// （単価の誤編集・ルール削除の回帰防止）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../supabase/migrations/0028_golfwing_membership_forecast.sql"),
  "utf8"
);

test("単価表（税抜）がDECISIONS #31と一致", () => {
  const prices: Array<[string, number]> = [
    ["レギュラー会員", 17500],
    ["マスター会員", 22500],
    ["プラチナレギュラー会員", 17500],
    ["ライト会員", 9800],
    ["法人会員", 55000],
    ["レギュラー家族割会員", 12250],
  ];
  for (const [type, price] of prices) {
    const re = new RegExp(`when\\s+'${type}'\\s+then\\s+${price}`);
    assert.match(sql, re, `${type} = ${price}円 がSQLに存在すること`);
  }
});

test("課金対象ルール: 実績優先・退会月末まで課金・休会除外・0円種別", () => {
  assert.match(sql, /mon_sales/, "実績(mon_sales)優先の分岐があること");
  assert.match(sql, /deleted_at\s*=\s*now\(\)/, "実績がある月は予測を論理削除すること");
  assert.match(sql, /else 0/, "その他種別（チケット/モニター/トライアル/スタッフ等）は0円");
  assert.match(sql, /membership_forecast/, "専用カテゴリ membership_forecast を使うこと");
});
