import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTimeline,
  toTimelineItems,
  bookingToItem,
  groupBySlot,
  unionSlots,
  monthGrid,
  monthRange,
  addDaysStr,
  addMonths,
  weekStart,
  dowOf,
  labelJa,
  TIMELINE_KINDS,
  TIMELINE_TONE,
  type BookingLike,
  type LessonLike,
  type TimelineItem,
} from "../apps/member-os/src/lib/bay-timeline-pure.ts";
import { genSlots } from "../packages/core/src/frank-booking.ts";

/* ============================================================
   FRANK GOLF 予約カレンダー 縦＝時間・横＝打席（DECISIONS #135）

   ユーザー指示（2026-08-13）:
   「Smart Hello（GOLF WINGの現行システム）と同じカレンダー表示にしてほしい」
   ＝ 縦軸が時間・横軸が打席、予約は所要時間ぶんの高さを持つブロック。

   ここで固定するのは「畳み込み」の落とし穴:
   - 55分の体験が30分コマ2つに割れて見えないこと（開始コマ1つ＋rowSpan）
   - 営業時間をはみ出す予約・完全に外の予約を黙って消さないこと
   - キャンセル済みを空きに戻すこと
   - 打席指定なしのレッスン枠を表に紛れ込ませないこと
   ============================================================ */

const HOURS = { open: "10:00", close: "22:00" };
const SLOTS = genSlots(HOURS, 30); // 10:00 〜 21:30
const BAYS = ["bayA", "bayB"];

function bk(o: {
  id: string;
  bay?: string;
  start: string;
  end: string;
  status?: string;
  kind?: string;
  name?: string;
  alert?: string | null;
  party?: number | null;
}): BookingLike {
  return {
    id: o.id,
    bay_id: o.bay ?? "bayA",
    start_time: o.start,
    end_time: o.end,
    status: o.status ?? "confirmed",
    customer_kind: o.kind ?? "member",
    guest_name: o.name ?? null,
    party_size: o.party ?? 1,
    frunk_members: o.alert !== undefined ? { name: "小川 うらら", alert_note: o.alert } : null,
    mbr_trial_requests: null,
  };
}

function ls(o: { id: string; bay?: string | null; start: string; end: string }): LessonLike {
  return { id: o.id, bay_id: o.bay === undefined ? "bayB" : o.bay, start_time: o.start, end_time: o.end, staff: { name: "堀" } };
}

/** 指定コマ・指定打席のセルを取り出す */
function cellAt(layout: ReturnType<typeof buildTimeline>, slot: string, bay: string) {
  const row = layout.rows.find((r) => r.slot === slot);
  assert.ok(row, `${slot} の行がない`);
  return row.cells[BAYS.indexOf(bay)];
}

// ------------------------------------------------------------------
// 高さ＝所要時間
// ------------------------------------------------------------------

test("55分の体験は開始コマ1つに置かれ、高さ2コマぶんになる（30分表示）", () => {
  const items = toTimelineItems([bk({ id: "b1", start: "10:00:00", end: "10:55:00", kind: "trial" })], []);
  const l = buildTimeline(SLOTS, 30, BAYS, items);

  const head = cellAt(l, "10:00", "bayA");
  assert.equal(head.kind, "block");
  if (head.kind !== "block") return;
  assert.equal(head.block.span, 2, "10:30の枠も潰しているので2コマぶんの高さ");
  assert.equal(head.block.row, 0);
  assert.equal(head.block.cutTop, false);
  assert.equal(head.block.cutBottom, false);

  // 続きのコマは covered（<td>を描かない＝rowSpanが飲み込む）
  assert.equal(cellAt(l, "10:30", "bayA").kind, "covered");
  // 3コマ目は空き
  assert.equal(cellAt(l, "11:00", "bayA").kind, "empty");
});

test("ちょうど30分の予約は1コマ、2時間の予約は4コマ", () => {
  const items = toTimelineItems(
    [
      bk({ id: "b1", start: "10:00:00", end: "10:30:00" }),
      bk({ id: "b2", bay: "bayB", start: "13:00:00", end: "15:00:00" }),
    ],
    [],
  );
  const l = buildTimeline(SLOTS, 30, BAYS, items);
  const a = cellAt(l, "10:00", "bayA");
  const b = cellAt(l, "13:00", "bayB");
  assert.equal(a.kind === "block" && a.block.span, 1);
  assert.equal(b.kind === "block" && b.block.span, 4);
  for (const s of ["13:30", "14:00", "14:30"]) assert.equal(cellAt(l, s, "bayB").kind, "covered");
  assert.equal(cellAt(l, "15:00", "bayB").kind, "empty");
});

test("半端な開始時刻はコマの先頭に寄せる（10:15開始が11:00に見えない）", () => {
  const items = toTimelineItems([bk({ id: "b1", start: "10:15:00", end: "11:00:00" })], []);
  const l = buildTimeline(SLOTS, 30, BAYS, items);
  const c = cellAt(l, "10:00", "bayA");
  assert.equal(c.kind, "block");
  assert.equal(c.kind === "block" && c.block.row, 0);
  assert.equal(c.kind === "block" && c.block.span, 2);
});

test("表示粒度を60分にしても崩れない（1件は1コマぶん）", () => {
  const slots60 = genSlots(HOURS, 60);
  const items = toTimelineItems([bk({ id: "b1", start: "10:30:00", end: "11:00:00" })], []);
  const l = buildTimeline(slots60, 60, BAYS, items);
  const c = cellAt(l, "10:00", "bayA");
  assert.equal(c.kind === "block" && c.block.span, 1);
});

// ------------------------------------------------------------------
// はみ出し・営業時間外
// ------------------------------------------------------------------

test("営業時間より前から始まる予約は、表に入る分だけ描いて cutTop を立てる", () => {
  const items = toTimelineItems([bk({ id: "b1", start: "09:00:00", end: "10:30:00" })], []);
  const l = buildTimeline(SLOTS, 30, BAYS, items);
  const c = cellAt(l, "10:00", "bayA");
  assert.equal(c.kind, "block");
  if (c.kind !== "block") return;
  assert.equal(c.block.span, 1);
  assert.equal(c.block.cutTop, true);
  assert.equal(c.block.cutBottom, false);
  assert.equal(l.unplaced.length, 0, "はみ出しても消さない");
});

test("閉店をまたぐ予約は最後のコマまでで止まり cutBottom を立てる", () => {
  const items = toTimelineItems([bk({ id: "b1", start: "21:30:00", end: "23:00:00" })], []);
  const l = buildTimeline(SLOTS, 30, BAYS, items);
  const c = cellAt(l, "21:30", "bayA");
  assert.equal(c.kind, "block");
  if (c.kind !== "block") return;
  assert.equal(c.block.span, 1, "表の外まで伸ばさない");
  assert.equal(c.block.cutBottom, true);
});

test("営業時間の完全に外にある予約は unplaced に回す（黙って消さない）", () => {
  const items = toTimelineItems([bk({ id: "b1", start: "08:00:00", end: "09:00:00" })], []);
  const l = buildTimeline(SLOTS, 30, BAYS, items);
  assert.equal(l.unplaced.length, 1);
  assert.equal(l.unplaced[0].reason, "outside_hours");
  assert.equal(l.rows.every((r) => r.cells.every((c) => c.kind === "empty")), true);
});

test("定休日（枠ゼロ）でも予約が残っていれば unplaced で見える", () => {
  const items = toTimelineItems([bk({ id: "b1", start: "10:00:00", end: "11:00:00" })], []);
  const l = buildTimeline([], 30, BAYS, items);
  assert.equal(l.rows.length, 0);
  assert.equal(l.unplaced.length, 1);
  assert.equal(l.unplaced[0].reason, "outside_hours");
});

// ------------------------------------------------------------------
// キャンセル・打席指定なし・重なり
// ------------------------------------------------------------------

test("キャンセル済みは載せない（空き枠に戻す）", () => {
  const items = toTimelineItems(
    [
      bk({ id: "b1", start: "10:00:00", end: "11:00:00", status: "cancelled" }),
      bk({ id: "b2", start: "12:00:00", end: "13:00:00", status: "visited" }),
    ],
    [],
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "b2");
  const l = buildTimeline(SLOTS, 30, BAYS, items);
  assert.equal(cellAt(l, "10:00", "bayA").kind, "empty");
  assert.equal(cellAt(l, "12:00", "bayA").kind, "block");
});

test("打席指定なしのレッスン枠は表に置かず unplaced（no_bay）へ", () => {
  const items = toTimelineItems([], [ls({ id: "l1", bay: null, start: "14:00:00", end: "15:00:00" })]);
  const l = buildTimeline(SLOTS, 30, BAYS, items);
  assert.equal(l.unplaced.length, 1);
  assert.equal(l.unplaced[0].reason, "no_bay");
  assert.equal(l.unplaced[0].item.kind, "lesson");
});

test("打席が決まっているレッスン枠は普通に並ぶ", () => {
  const items = toTimelineItems([], [ls({ id: "l1", start: "14:00:00", end: "15:00:00" })]);
  const l = buildTimeline(SLOTS, 30, BAYS, items);
  const c = cellAt(l, "14:00", "bayB");
  assert.equal(c.kind === "block" && c.block.span, 2);
  assert.equal(c.kind === "block" && c.block.item.kind, "lesson");
});

test("同じ打席・同じ時間の二重予約は、先の1件を表に出して後の1件を conflict で見せる", () => {
  const items = toTimelineItems(
    [
      bk({ id: "b2", start: "10:30:00", end: "11:30:00" }),
      bk({ id: "b1", start: "10:00:00", end: "11:00:00" }),
    ],
    [],
  );
  const l = buildTimeline(SLOTS, 30, BAYS, items);
  const c = cellAt(l, "10:00", "bayA");
  assert.equal(c.kind === "block" && c.block.item.id, "b1", "開始が早いほうを残す");
  assert.equal(l.unplaced.length, 1);
  assert.equal(l.unplaced[0].item.id, "b2");
  assert.equal(l.unplaced[0].reason, "conflict");
});

test("打席が違えば同じ時間でも並ぶ", () => {
  const items = toTimelineItems(
    [bk({ id: "b1", start: "10:00:00", end: "11:00:00" }), bk({ id: "b2", bay: "bayB", start: "10:00:00", end: "11:00:00" })],
    [],
  );
  const l = buildTimeline(SLOTS, 30, BAYS, items);
  assert.equal(cellAt(l, "10:00", "bayA").kind, "block");
  assert.equal(cellAt(l, "10:00", "bayB").kind, "block");
  assert.equal(l.unplaced.length, 0);
});

test("台帳に無い打席（休止した打席の古い予約）は表に紛れ込ませない", () => {
  const items = toTimelineItems([bk({ id: "b1", bay: "bayD", start: "10:00:00", end: "11:00:00" })], []);
  const l = buildTimeline(SLOTS, 30, BAYS, items);
  assert.equal(l.unplaced.length, 1);
  assert.equal(l.unplaced[0].reason, "no_bay");
});

// ------------------------------------------------------------------
// 表示内容
// ------------------------------------------------------------------

test("誰の予約かは 会員名→体験申込名→ゲスト名 の順（最後は「ご予約」）", () => {
  assert.equal(bookingToItem(bk({ id: "1", start: "10:00", end: "11:00", alert: null })).title, "小川 うらら");
  const guest = bookingToItem(bk({ id: "2", start: "10:00", end: "11:00", name: "山田 太郎", kind: "dropin" }));
  assert.equal(guest.title, "山田 太郎");
  assert.equal(guest.kind, "dropin");
  assert.equal(bookingToItem(bk({ id: "3", start: "10:00", end: "11:00", kind: "dropin" })).title, "ご予約");
});

test("重要説明事項があると alert が立つ（空白だけなら立てない）", () => {
  assert.equal(bookingToItem(bk({ id: "1", start: "10:00", end: "11:00", alert: "腰痛あり" })).alert, true);
  assert.equal(bookingToItem(bk({ id: "2", start: "10:00", end: "11:00", alert: "  " })).alert, false);
  assert.equal(bookingToItem(bk({ id: "3", start: "10:00", end: "11:00", alert: null })).alert, false);
});

test("種別は4つとも色が定義されていて、会員と都度が同じ色になっていない", () => {
  assert.deepEqual(TIMELINE_KINDS, ["member", "trial", "dropin", "lesson"]);
  const blocks = TIMELINE_KINDS.map((k) => TIMELINE_TONE[k].block);
  assert.equal(new Set(blocks).size, 4, "4種とも別の色（sky/indigo混在の再発防止）");
  for (const k of TIMELINE_KINDS) {
    assert.ok(TIMELINE_TONE[k].label.length > 0);
    assert.ok(TIMELINE_TONE[k].dot.length > 0);
  }
});

// ------------------------------------------------------------------
// 週表示（縦＝時間・横＝曜日）
// ------------------------------------------------------------------

test("週の時間軸は全日の和集合（平日10-22と土日9-20が混ざっても抜けない）", () => {
  const weekday = genSlots({ open: "10:00", close: "22:00" }, 60);
  const weekend = genSlots({ open: "09:00", close: "20:00" }, 60);
  const u = unionSlots([weekday, weekend]);
  assert.equal(u[0], "09:00");
  assert.equal(u[u.length - 1], "21:00");
  assert.equal(new Set(u).size, u.length, "重複しない");
});

test("週表示はコマに重なっている予定を全部拾う（打席は合算）", () => {
  const items: TimelineItem[] = toTimelineItems(
    [
      bk({ id: "b1", start: "10:00:00", end: "12:00:00" }),
      bk({ id: "b2", bay: "bayB", start: "11:00:00", end: "11:30:00" }),
    ],
    [],
  );
  const slots = genSlots(HOURS, 60);
  const g = groupBySlot(slots, 60, items);
  assert.equal(g[0].length, 1, "10時台は b1 だけ");
  assert.equal(g[1].length, 2, "11時台は b1（継続）と b2");
  assert.equal(g[2].length, 0, "12時台は空き（終了ちょうどは含めない）");
});

// ------------------------------------------------------------------
// 月ミニカレンダーの日付計算
// ------------------------------------------------------------------

test("月グリッドは常に6週×7日で、先頭は日曜", () => {
  const g = monthGrid("2026-08");
  assert.equal(g.length, 6);
  assert.equal(g[0].length, 7);
  assert.equal(dowOf(g[0][0]), 0);
  assert.ok(g.flat().includes("2026-08-01"));
  assert.ok(g.flat().includes("2026-08-31"));
});

test("2月・年またぎでも日付がズレない", () => {
  assert.equal(addDaysStr("2026-02-28", 1), "2026-03-01");
  assert.equal(addDaysStr("2024-02-28", 1), "2024-02-29"); // うるう年
  assert.equal(addDaysStr("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysStr("2026-01-01", -1), "2025-12-31");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
});

test("月の範囲は「1日以上・翌月1日未満」（末日を取りこぼさない）", () => {
  assert.deepEqual(monthRange("2026-08"), { from: "2026-08-01", to: "2026-09-01" });
  assert.deepEqual(monthRange("2026-12"), { from: "2026-12-01", to: "2027-01-01" });
});

test("週のはじまりは日曜。日曜そのものはその日から", () => {
  assert.equal(weekStart("2026-08-13"), "2026-08-09"); // 木 → 直前の日曜
  assert.equal(weekStart("2026-08-09"), "2026-08-09");
  assert.equal(labelJa("2026-08-13"), "8/13（木）");
});
