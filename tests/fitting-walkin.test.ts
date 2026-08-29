// フィッティング予約 → 受付台帳（DECISIONS #186）の純関数テスト
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FITTING_LEDGER_PREFIX,
  fittingReservationNo,
  jstDateOf,
  jstTimeOf,
  fittingLedgerNote,
  fittingReserveIntake,
  fittingReferral,
} from "../packages/core/src/fitting-walkin.ts";

test("冪等キーはFRANKの体験と衝突しない", () => {
  assert.equal(FITTING_LEDGER_PREFIX, "RES-");
  assert.equal(fittingReservationNo("42c4cfb4"), "RES-42c4cfb4");
  assert.notEqual(fittingReservationNo("x"), "FRANK-TRIAL-x");
});

test("台帳の日付はJSTで決まる（UTCの日付ではない）", () => {
  // 2026-08-29 13:30 JST = 2026-08-29T04:30:00Z
  assert.equal(jstDateOf("2026-08-29T04:30:00Z"), "2026-08-29");
  // JSTの深夜1時。UTCだと前日16時なので、UTCで切ると1日ズレる
  assert.equal(jstDateOf("2026-08-29T16:00:00Z"), "2026-08-30");
  assert.equal(jstDateOf(null), null);
  assert.equal(jstDateOf("こわれた日付"), null);
});

test("時刻もJST", () => {
  assert.equal(jstTimeOf("2026-08-29T04:30:00Z"), "13:30");
  assert.equal(jstTimeOf(null), "");
});

test("台帳の備考は予約の中身が1行で分かる", () => {
  const note = fittingLedgerNote({
    confirmed_at: "2026-08-29T04:30:00Z",
    service_name: "シャフトフィッティング 2コマ",
    bring_clubs: "ドライバー1本",
    club_maker: "タイトリスト",
    club_model: "tsr2",
    club_shaft: "ツアーAD DI",
    club_flex: "50S",
    head_speed: "42",
    concern: "チーピン、飛距離\r\nドライバーがヒール気味に当たる",
  });
  assert.equal(
    note,
    "フィッティング予約 13:30 シャフトフィッティング 2コマ／持込: ドライバー1本／" +
      "使用中: タイトリスト tsr2 ツアーAD DI 50S／HS 42／お悩み: チーピン、飛距離 ドライバーがヒール気味に当たる",
  );
  // 同期のたびに作り直せるよう、先頭は必ず固定の文字列で始まる（スタッフが書き換えたメモの判別に使う）
  assert.ok(note.startsWith("フィッティング予約"));
});

test("備考は空の項目を並べない", () => {
  assert.equal(fittingLedgerNote({ confirmed_at: "2026-08-30T02:00:00Z" }), "フィッティング予約 11:00");
});

test("予約でいただいた内容は survey.reserve 用に空文字をnullで畳む", () => {
  const intake = fittingReserveIntake({
    request_seq: 4,
    service_name: "シャフトフィッティング 2コマ",
    head_speed: "42",
    club_maker: "  ",
    concern: null,
    age: 34,
  });
  assert.equal(intake.request_seq, 4);
  assert.equal(intake.head_speed, "42");
  assert.equal(intake.club_maker, null); // 空白だけはnull
  assert.equal(intake.concern, null);
  assert.equal(intake.age, 34);
});

test("流入元はWeb予約と分かる形で入る", () => {
  assert.deepEqual(fittingReferral("web"), {
    referral_source: "ホームページ",
    referral_source_other: "フィッティングWeb予約（Web予約）",
  });
  assert.equal(fittingReferral("line").referral_source, "公式LINE");
});
