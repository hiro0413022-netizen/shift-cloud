// craft-os 工房の段取り: 平日発送・翌日夕方着・火曜定休（2026-09-19 ユーザーの説明）
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrivalDate, planWork, shipDate } from "../apps/craft-os/src/lib/work-schedule.ts";

// 2026-09-19 は土曜
test("土曜の発注は月曜発送・火曜は定休なので水曜着", () => {
  assert.equal(shipDate("2026-09-19"), "2026-09-21");
  assert.equal(arrivalDate("2026-09-19"), "2026-09-23");
});
test("日曜の発注も月曜発送→水曜着", () => {
  assert.equal(arrivalDate("2026-09-20"), "2026-09-23");
});
test("月曜の発注は火曜着のはずが定休→水曜着", () => {
  assert.equal(arrivalDate("2026-09-21"), "2026-09-23");
});
test("水曜の発注は木曜着・金曜の発注は土曜着", () => {
  assert.equal(arrivalDate("2026-09-23"), "2026-09-24");
  assert.equal(arrivalDate("2026-09-25"), "2026-09-26");
});
test("段取り: お渡し連絡は組立の翌営業日（火曜を飛ばす）／仕上げ期日があればその日", () => {
  const p = planWork({ orderYmd: "2026-09-26" }); // 土曜
  assert.deepEqual(p.map((s) => s.date), ["2026-09-26", "2026-09-30", "2026-09-30", "2026-10-01"]);
  const q = planWork({ orderYmd: "2026-09-24", dueYmd: "2026-09-28" });
  assert.equal(q.find((s) => s.key === "contact")?.date, "2026-09-28");
  const r = planWork({ orderYmd: "2026-09-21" }); // 月曜 → 水曜着 → 木曜連絡
  assert.equal(r[3].date, "2026-09-24");
});
