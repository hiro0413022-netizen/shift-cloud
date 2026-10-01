// 受付台帳・名簿Excelの店舗の決め方（2026-10-01: GOLF WING の台帳・Excelに FRANK の登録者が混ざった実障害）
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStoreView } from "../apps/member-os/src/lib/store-view.ts";

const GW = "gw", FR = "frank";

test("両店が見える人（オーナー）は既定で主店舗だけ＝他店の登録者が混ざらない", () => {
  const owner = { isOwner: true, storeIds: [GW, FR], primaryStoreId: GW };
  assert.deepEqual(resolveStoreView(owner, [GW, FR], undefined), { storeIds: [GW], selected: GW });
  assert.deepEqual(resolveStoreView(owner, [GW, FR], FR), { storeIds: [FR], selected: FR });
  assert.deepEqual(resolveStoreView(owner, [GW, FR], "all"), { storeIds: [GW, FR], selected: "all" });
});

test("見えない店舗を指定しても主店舗に戻す／1店舗の人に全店は無い", () => {
  const staff = { isOwner: false, storeIds: [GW], primaryStoreId: GW };
  assert.deepEqual(resolveStoreView(staff, [GW], FR), { storeIds: [GW], selected: GW });
  assert.deepEqual(resolveStoreView(staff, [GW], "all"), { storeIds: [GW], selected: GW });
});

test("所属ゼロは0件（絞り込みなし＝全件にしない）", () => {
  const none = { isOwner: false, storeIds: [], primaryStoreId: null };
  assert.deepEqual(resolveStoreView(none, [], undefined).storeIds, ["00000000-0000-0000-0000-000000000000"]);
});
