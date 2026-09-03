import test from "node:test";
import assert from "node:assert/strict";
import {
  slotsOfMinutes,
  isOpenBooking,
  openSlots,
  checkOpenSlots,
  normalizeCorporateUsers,
  corporateSpec,
  corporateSeats,
  corporateSeatFullMessage,
  memberDisplayName,
  canBookAsCorporate,
  slotUsageLabel,
} from "../packages/core/src/frank-corporate.ts";

/* ============================================================
   法人プランと「予約は消化してから次を取る」（2026-09-01 ユーザー確定）

   法人ライト   利用者2名まで・先の予約は合計4コマ
   法人プレミアム 利用者は人数制限なし（max_users = null）・先の予約は合計8コマ・同伴ビジター無料

   #206（2026-09-03）で「入会は無記名・使う人だけ記名」に変えた。
   入会フォームは0名で通す（minUsers=0）／会員ページからの追加は1名必須（minUsers=1）。
   数え方は全会員共通（個人プランも同じ判定を通す）。1コマ=1時間。

   ここがズレると「○を押したのに予約できません」か、上限を超えて取れてしまう。
   ============================================================ */

const B = (date: string, endTime: string, minutes: number, status?: string) => ({ date, endTime, minutes, status });

test("コマ数は1時間=1コマ。端数は切り上げ（25分でも1コマ押さえている）", () => {
  assert.equal(slotsOfMinutes(60), 1);
  assert.equal(slotsOfMinutes(120), 2);
  assert.equal(slotsOfMinutes(25), 1);
  assert.equal(slotsOfMinutes(90), 2);
  assert.equal(slotsOfMinutes(0), 1);
});

test("消化済みの判定: キャンセル・来店済み・無断欠は枠を占有しない", () => {
  assert.equal(isOpenBooking(B("2026-09-10", "11:00", 60, "cancelled"), "2026-09-01", "10:00"), false);
  assert.equal(isOpenBooking(B("2026-09-10", "11:00", 60, "visited"), "2026-09-01", "10:00"), false);
  assert.equal(isOpenBooking(B("2026-09-10", "11:00", 60, "no_show"), "2026-09-01", "10:00"), false);
  assert.equal(isOpenBooking(B("2026-09-10", "11:00", 60, "booked"), "2026-09-01", "10:00"), true);
});

test("消化済みの判定: 過ぎた日付と、今日の終わった時間帯", () => {
  assert.equal(isOpenBooking(B("2026-08-31", "11:00", 60), "2026-09-01", "10:00"), false);
  // 今日の10:00〜11:00 は、いま10:30なら「まだ終わっていない」＝枠を持っている
  assert.equal(isOpenBooking(B("2026-09-01", "11:00", 60), "2026-09-01", "10:30"), true);
  // 11:00を過ぎたら消化済み
  assert.equal(isOpenBooking(B("2026-09-01", "11:00", 60), "2026-09-01", "11:00"), false);
  assert.equal(isOpenBooking(B("2026-09-01", "11:00", 60), "2026-09-01", "12:00"), false);
});

test("秒つきの時刻（DBのtime型）でも壊れない", () => {
  assert.equal(isOpenBooking(B("2026-09-01", "11:00:00", 60), "2026-09-01", "10:30"), true);
});

test("合計コマ数", () => {
  const rows = [
    B("2026-09-02", "11:00", 60),
    B("2026-09-02", "14:00", 120),
    B("2026-08-30", "11:00", 60), // 過ぎている
    B("2026-09-03", "11:00", 60, "cancelled"), // キャンセル
  ];
  assert.equal(openSlots(rows, "2026-09-01", "10:00"), 3);
});

test("法人プレミアム: 明日8コマ押さえたら、明後日は取れない", () => {
  const rows = [
    B("2026-09-02", "12:00", 120),
    B("2026-09-02", "14:00", 120),
    B("2026-09-02", "16:00", 120),
    B("2026-09-02", "18:00", 120),
  ];
  const r = checkOpenSlots({ bookings: rows, addMinutes: 60, limit: 8, todayYmd: "2026-09-01", nowHm: "10:00", corporate: true });
  assert.equal(r.ok, false);
  assert.equal(r.used, 8);
  assert.equal(r.remaining, 0);
  assert.match(r.error ?? "", /消化/);
});

test("法人プレミアム: 明日が終われば、また8コマ取れる", () => {
  const rows = [
    B("2026-09-02", "12:00", 120),
    B("2026-09-02", "14:00", 120),
    B("2026-09-02", "16:00", 120),
    B("2026-09-02", "18:00", 120),
  ];
  // 9/3 になれば 9/2 は消化済み
  const r = checkOpenSlots({ bookings: rows, addMinutes: 120, limit: 8, todayYmd: "2026-09-03", nowHm: "10:00", corporate: true });
  assert.ok(r.ok);
  assert.equal(r.used, 0);
});

test("法人ライト: 4コマまで。2時間×2で満杯", () => {
  const rows = [B("2026-09-05", "12:00", 120), B("2026-09-06", "12:00", 120)];
  assert.ok(checkOpenSlots({ bookings: rows, addMinutes: 60, limit: 8, todayYmd: "2026-09-01", nowHm: "10:00" }).ok);
  const r = checkOpenSlots({ bookings: rows, addMinutes: 60, limit: 4, todayYmd: "2026-09-01", nowHm: "10:00", corporate: true });
  assert.equal(r.ok, false);
  assert.equal(r.remaining, 0);
});

test("残り1コマのときに2時間は取れない（理由も残り数で伝える）", () => {
  const rows = [B("2026-09-05", "12:00", 120), B("2026-09-06", "11:00", 60)];
  const r = checkOpenSlots({ bookings: rows, addMinutes: 120, limit: 4, todayYmd: "2026-09-01", nowHm: "10:00" });
  assert.equal(r.ok, false);
  assert.equal(r.remaining, 1);
  assert.match(r.error ?? "", /残り1コマ/);
});

test("個人プランも同じ判定（レギュラー=1コマ）", () => {
  const rows = [B("2026-09-05", "12:00", 60)];
  assert.equal(checkOpenSlots({ bookings: rows, addMinutes: 60, limit: 1, todayYmd: "2026-09-01", nowHm: "10:00" }).ok, false);
  // その日が終われば次が取れる
  assert.ok(checkOpenSlots({ bookings: rows, addMinutes: 60, limit: 1, todayYmd: "2026-09-06", nowHm: "10:00" }).ok);
});

test("利用者の検証: 空行は捨てる・上限超えは弾く", () => {
  const ok = normalizeCorporateUsers(
    [
      { name: "山田 太郎", phone: "090-1111-2222" },
      { name: "", phone: "" },
      { name: "鈴木 花子", phone: "090-3333-4444" },
    ],
    2,
  );
  assert.equal(ok.users.length, 2);
  assert.equal(ok.error, undefined);

  const over = normalizeCorporateUsers(
    [
      { name: "A", phone: "09011112222" },
      { name: "B", phone: "09033334444" },
      { name: "C", phone: "09055556666" },
    ],
    2,
  );
  assert.match(over.error ?? "", /2名まで/);
});

test("利用者の検証: 電話番号は必須（ログインに下4桁を使う）・重複も弾く", () => {
  assert.match(normalizeCorporateUsers([{ name: "山田", phone: "" }], 4).error ?? "", /電話番号/);
  assert.match(normalizeCorporateUsers([{ name: "", phone: "09011112222" }], 4).error ?? "", /お名前/);
  const dup = normalizeCorporateUsers(
    [{ name: "A", phone: "090-1111-2222" }, { name: "B", phone: "09011112222" }],
    4,
  );
  assert.match(dup.error ?? "", /重複/);
  // 会員ページからの追加は1名必須（minUsers=1）
  assert.match(normalizeCorporateUsers([], 4, 1).error ?? "", /1名以上/);
  // 入会フォームは無記名で通す（#206）。0名でもエラーにしない
  assert.equal(normalizeCorporateUsers([], 4).error, undefined);
  assert.equal(normalizeCorporateUsers([], null).users.length, 0);
});

test("人数制限なし（法人プレミアム）は何名でも受ける", () => {
  const many = normalizeCorporateUsers(
    Array.from({ length: 9 }).map((_, i) => ({ name: `社員${i}`, phone: `0901111${String(i).padStart(4, "0")}` })),
    null,
    1,
  );
  assert.equal(many.error, undefined);
  assert.equal(many.users.length, 9);
});

test("席数: ご担当者ご自身も1名として数える（法人ライトは2名まで）", () => {
  assert.deepEqual(corporateSeats({ maxUsers: 2, registered: 1, selfUse: false }), {
    used: 1, limit: 2, remaining: 1, canAdd: true, full: false,
  });
  // ご担当者が自分も使う場合、残りは1名
  assert.deepEqual(corporateSeats({ maxUsers: 2, registered: 1, selfUse: true }), {
    used: 2, limit: 2, remaining: 0, canAdd: false, full: true,
  });
  // 無制限は常に追加できる
  assert.deepEqual(corporateSeats({ maxUsers: null, registered: 30, selfUse: true }), {
    used: 31, limit: null, remaining: null, canAdd: true, full: false,
  });
  assert.match(corporateSeatFullMessage(2), /2名/);
});

test("会員表記は法人名＋個人名（#206）", () => {
  assert.equal(memberDisplayName({ name: "山田 太郎", company_name: "株式会社ヨザン" }), "株式会社ヨザン 山田 太郎");
  // 個人会員は今までどおりお名前だけ
  assert.equal(memberDisplayName({ name: "山田 太郎", company_name: null }), "山田 太郎");
  // 会社名だけ／氏名だけでも頭が空かない
  assert.equal(memberDisplayName({ name: "", company_name: "株式会社ヨザン" }), "株式会社ヨザン");
  assert.equal(memberDisplayName(null), "");
});

test("使う人は利用者登録が必須。契約者の行は登録するまで予約できない（#206）", () => {
  const corp = { isCorporate: true };
  // ご利用者（親にぶら下がっている）は予約できる
  assert.equal(canBookAsCorporate(corp, { corporate_parent_id: "root" }).ok, true);
  // ご契約者は、ご自身を登録するまで予約できない
  const contract = canBookAsCorporate(corp, { corporate_parent_id: null, corporate_self_use: false });
  assert.equal(contract.ok, false);
  assert.match(contract.error ?? "", /ご利用者/);
  // 登録すれば取れる
  assert.equal(canBookAsCorporate(corp, { corporate_parent_id: null, corporate_self_use: true }).ok, true);
  // 個人会員には関係ない
  assert.equal(canBookAsCorporate({ isCorporate: false }, { corporate_parent_id: null }).ok, true);
});

test("予約枠の見せ方: 残りと満杯を同じ言い方にする（画面とサーバーでズレない）", () => {
  const half = slotUsageLabel({ used: 3, limit: 8, corporate: true });
  assert.match(half.headline, /御社のご予約 3／8コマ/);
  assert.match(half.detail, /あと5コマ/);
  assert.equal(half.full, false);
  const full = slotUsageLabel({ used: 8, limit: 8, corporate: true });
  assert.equal(full.full, true);
  assert.match(full.detail, /埋まっています/);
});

test("プランから法人の設定を読む（列が無くても壊れない）", () => {
  assert.deepEqual(corporateSpec({ is_corporate: true, max_users: 2, max_open_slots: 4, companion_free: false }), {
    isCorporate: true, maxUsers: 2, usersUnlimited: false, maxOpenSlots: 4, companionFree: false,
  });
  // 法人プレミアムは max_users = null（人数制限なし・#206）。
  // 「未設定だから2名」と読み替えると、無制限のはずのプランが2名で止まる
  assert.deepEqual(corporateSpec({ is_corporate: true, max_users: null, max_open_slots: 8, companion_free: true }), {
    isCorporate: true, maxUsers: null, usersUnlimited: true, maxOpenSlots: 8, companionFree: true,
  });
  assert.deepEqual(corporateSpec({ max_bookings_per_day: 2 }), {
    isCorporate: false, maxUsers: 1, usersUnlimited: false, maxOpenSlots: 2, companionFree: false,
  });
  assert.deepEqual(corporateSpec(null), {
    isCorporate: false, maxUsers: 1, usersUnlimited: false, maxOpenSlots: 1, companionFree: false,
  });
});
