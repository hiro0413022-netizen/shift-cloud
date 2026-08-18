import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeKey,
  phoneKey,
  matchesMember,
  filterMembers,
  sortMembers,
  countByStatus,
  type FrunkMemberLike,
} from "../apps/member-os/src/lib/frunk-member-search.ts";

/* ============================================================
   FRANK会員の検索（#139 / 2026-08-18）

   固定したいのは「現場で当たらない」パターン:
   - 全角で打った会員番号（ＦＲ０００１）でも当たる
   - ひらがなで打っても カナ に当たる
   - 電話はハイフン有無・国番号付きでも当たる
   - 氏名の姓名のあいだの空白ちがいで外れない
   ============================================================ */

const M = (o: Partial<FrunkMemberLike>): FrunkMemberLike => ({ id: o.id ?? "x", ...o });

const TANAKA = M({
  id: "1",
  member_no: "FR0001",
  name: "田中 太郎",
  name_kana: "タナカ タロウ",
  phone: "090-1234-5678",
  email: "tanaka@example.com",
  status: "active",
  plan_id: "p1",
  join_date: "2026-09-02",
});
const SUZUKI = M({
  id: "2",
  member_no: "FR0002",
  name: "鈴木 花子",
  name_kana: "スズキ ハナコ",
  phone: "08098765432",
  status: "suspended",
  plan_id: "p2",
  join_date: "2026-09-10",
});
const LEFT = M({ id: "3", member_no: "FR0003", name: "佐藤 一", name_kana: "サトウ ハジメ", status: "left", plan_id: "p1" });

test("normalizeKey: 全角・記号・ひらがなを寄せる", () => {
  assert.equal(normalizeKey("ＦＲ０００１"), "fr0001");
  assert.equal(normalizeKey("田中 太郎"), "田中太郎");
  assert.equal(normalizeKey("たなか"), normalizeKey("タナカ"));
});

test("phoneKey: 表記ちがいを下10桁に寄せる", () => {
  assert.equal(phoneKey("090-1234-5678"), "9012345678");
  assert.equal(phoneKey("+81 90 1234 5678"), "9012345678");
  assert.equal(phoneKey(null), "");
});

test("matchesMember: 氏名・カナ・会員番号・電話・メールで当たる", () => {
  assert.ok(matchesMember(TANAKA, "たなか"));
  assert.ok(matchesMember(TANAKA, "田中太郎"));
  assert.ok(matchesMember(TANAKA, "ＦＲ０００１"));
  assert.ok(matchesMember(TANAKA, "09012345678"));
  assert.ok(matchesMember(TANAKA, "090-1234"));
  assert.ok(matchesMember(TANAKA, "TANAKA@example.com"));
  assert.ok(!matchesMember(TANAKA, "鈴木"));
  // 空の検索語は絞らない
  assert.ok(matchesMember(TANAKA, ""));
});

test("filterMembers: 検索語・ステータス・プランのAND", () => {
  const all = [TANAKA, SUZUKI, LEFT];
  assert.deepEqual(filterMembers(all, { status: "active" }).map((m) => m.id), ["1"]);
  assert.deepEqual(filterMembers(all, { planId: "p1" }).map((m) => m.id), ["1", "3"]);
  assert.deepEqual(filterMembers(all, { q: "ハナコ" }).map((m) => m.id), ["2"]);
  assert.deepEqual(filterMembers(all, { q: "ハナコ", status: "active" }).map((m) => m.id), []);
  // "all" は絞らない
  assert.equal(filterMembers(all, { status: "all" }).length, 3);
});

test("sortMembers: 既定は会員番号順・カナ順/入会日順も選べる", () => {
  const all = [SUZUKI, LEFT, TANAKA];
  assert.deepEqual(sortMembers(all, "member_no").map((m) => m.id), ["1", "2", "3"]);
  assert.deepEqual(sortMembers(all, "join_date_desc").map((m) => m.id), ["2", "1", "3"]);
  assert.deepEqual(sortMembers(all, "status").map((m) => m.id), ["1", "2", "3"]);
  // 会員番号なしを先頭に紛れ込ませない
  const noNo = M({ id: "9", name: "未採番", status: "pending" });
  assert.deepEqual(sortMembers([noNo, TANAKA], "member_no").map((m) => m.id), ["1", "9"]);
});

test("countByStatus: 0件のステータスも0で返す", () => {
  const c = countByStatus([TANAKA, SUZUKI, LEFT], ["active", "suspended", "left", "pending"]);
  assert.deepEqual(c, { active: 1, suspended: 1, left: 1, pending: 0 });
});
