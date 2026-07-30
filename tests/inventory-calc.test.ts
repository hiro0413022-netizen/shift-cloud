import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signedQty,
  theoreticalQty,
  needsReorder,
  cogs,
  groupByLocation,
  OUTBOUND_KINDS,
  MOVEMENT_LABEL,
  NO_LOCATION,
} from "../apps/inventory-os/src/lib/inventory-calc.ts";

/**
 * Inventory OS（#96）の純粋計算を固定する。
 * ここが壊れると在庫の数字が静かにずれる:
 *  - 符号の取り違えで販売が入庫になる
 *  - 適正在庫の判定が reorder_point 未設定の品番にまで効いて発注候補が溢れる
 *  - 期首が無い月に売上原価を出してしまい、PLに根拠のない数字が流れる
 */

test("出庫種別は数量を負にする（画面ではマイナスを打たせない）", () => {
  assert.equal(signedQty("sale", 3), -3);
  assert.equal(signedQty("workshop", 1), -1);
  assert.equal(signedQty("damage", 2), -2);
  assert.equal(signedQty("receipt", 12), 12);
  assert.equal(signedQty("transfer", 5), 5);
});

test("符号は種別だけで決まる — 負値を入れても入庫は入庫のまま", () => {
  // 現場が「-3」と打っても販売は -3、入荷は +3。二重反転させない
  assert.equal(signedQty("sale", -3), -3);
  assert.equal(signedQty("receipt", -3), 3);
});

test("小数・文字化けした数量は切り捨てる", () => {
  assert.equal(signedQty("receipt", 2.9), 2);
  assert.equal(signedQty("receipt", Number.NaN), 0);
});

test("出庫種別の一覧に adjust を含めない（棚卸調整は差の符号をそのまま持つ）", () => {
  assert.ok(!OUTBOUND_KINDS.includes("adjust"));
  assert.equal(MOVEMENT_LABEL.adjust, "棚卸調整");
});

test("理論在庫＝直近の確定棚卸＋その後の入出庫", () => {
  assert.equal(theoreticalQty(24, 10), 34);
  assert.equal(theoreticalQty(24, -5), 19);
  // 一度も数えられていない品番は入出庫だけで数える
  assert.equal(theoreticalQty(null, 3), 3);
  assert.equal(theoreticalQty(null, null), 0);
});

test("適正在庫は未設定なら判定しない", () => {
  assert.equal(needsReorder(0, null), false);
  assert.equal(needsReorder(2, 3), true);
  assert.equal(needsReorder(3, 3), true); // ちょうどでも発注候補（切らしてからでは遅い）
  assert.equal(needsReorder(4, 3), false);
});

test("売上原価は三分法。期首が無い月は計算しない", () => {
  assert.equal(cogs(2983678, 0, 2769993), 213685);
  assert.equal(cogs(1000, 500, 1200), 300);
  // 移行直後の最初の月は前月の棚卸が無い＝推計せず null を返す
  assert.equal(cogs(null, 500, 1200), null);
});

test("保管場所グルーピングは品番数の多い順、未設定は最後", () => {
  const rows = [
    { location1: "バックヤード" },
    { location1: "グリップホルダーに陳列" },
    { location1: null },
    { location1: "グリップホルダーに陳列" },
    { location1: "グリップホルダーに陳列" },
    { location1: "バックヤード" },
    { location1: null },
  ];
  const g = groupByLocation(rows);
  assert.deepEqual(
    g.map((x) => [x.location, x.rows.length]),
    [
      ["グリップホルダーに陳列", 3],
      ["バックヤード", 2],
      [NO_LOCATION, 2],
    ]
  );
});

test("保管場所が全部未設定でも落ちない", () => {
  const g = groupByLocation([{ location1: null }, { location1: null }]);
  assert.equal(g.length, 1);
  assert.equal(g[0].location, NO_LOCATION);
  assert.equal(g[0].rows.length, 2);
});
