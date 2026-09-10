import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuery, isSearchable, maskedPhone, fmtVisitDay, candidateHint, readCandidates,
  type ReceptionCandidate,
} from "../apps/member-os/src/lib/reception-search-pure.ts";

/**
 * 店頭タブレット「2回目以降の方」の検索（DECISIONS #226 / migration 0150）。
 *
 * ここで守りたいのは3つ:
 *   ① 「山田 太郎」も「やまだ」も同じお名前として引ける（表記のぶれで見つからない＝二重登録に戻る）
 *   ② 1文字では引かない（名簿がずらりと並ぶ）
 *   ③ 画面に出す個人情報は電話の下4桁まで（住所・生年月日は候補に入れない）
 */

function cand(over: Partial<ReceptionCandidate> = {}): ReceptionCandidate {
  return {
    id: "g1", name: "山田 太郎", name_kana: "ヤマダ タロウ",
    phone_tail: "5678", visit_count: 3, last_visit: "2026-07-03", ...over,
  };
}

test("正規化: 空白・中黒を落とし、ひらがなはカタカナに寄せる", () => {
  assert.equal(normalizeQuery("山田 太郎"), "山田太郎");
  assert.equal(normalizeQuery("山田　太郎"), "山田太郎");
  assert.equal(normalizeQuery("やまだ"), "ヤマダ");
  assert.equal(normalizeQuery("ヤマダ"), "ヤマダ");
  assert.equal(normalizeQuery("さゝ"), "サゝ"); // 変換表にない字はそのまま
  assert.equal(normalizeQuery(null), "");
});

test("1文字では引かない・2文字から引く", () => {
  assert.equal(isSearchable("山"), false);
  assert.equal(isSearchable("や"), false);
  assert.equal(isSearchable("山 田"), true);  // 空白を抜いて2文字なら引ける
  assert.equal(isSearchable("山 "), false);  // 空白を抜くと1文字
  assert.equal(isSearchable("山田"), true);
  assert.equal(isSearchable("やまだ"), true);
  assert.equal(isSearchable("  "), false);
});

test("電話は下4桁だけ・4桁そろわなければ出さない", () => {
  assert.equal(maskedPhone("5678"), "****5678");
  assert.equal(maskedPhone("567"), null);
  assert.equal(maskedPhone(""), null);
  assert.equal(maskedPhone(null), null);
});

test("前回来店日の表示", () => {
  assert.equal(fmtVisitDay("2026-07-03"), "2026/7/3");
  assert.equal(fmtVisitDay("2026-12-25T00:00:00Z"), "2026/12/25");
  assert.equal(fmtVisitDay(null), null);
});

test("候補の説明文は前回来店・回数・下4桁だけ（住所や生年月日は出さない）", () => {
  const line = candidateHint(cand());
  assert.match(line, /前回 2026\/7\/3/);
  assert.match(line, /3回目のご来店/);
  assert.match(line, /\*\*\*\*5678/);
});

test("初来店で履歴が無い候補でも文が壊れない", () => {
  assert.equal(candidateHint(cand({ visit_count: 0, last_visit: null, phone_tail: null })), "");
});

test("DBの生JSON: 氏名かIDが欠けた行は落とす", () => {
  const rows = readCandidates([
    { id: "a", name: "山田 太郎", name_kana: "ヤマダ タロウ", phone_tail: "0001", visit_count: 2, last_visit: "2026-07-03" },
    { id: "", name: "名前だけ" },
    { id: "b", name: "   " },
    { id: "c", name: "佐藤 花子", name_kana: null, phone_tail: null, visit_count: null, last_visit: null },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.id), ["a", "c"]);
  assert.equal(rows[1].visit_count, 0);
  assert.equal(rows[1].name_kana, null);
});

test("DBの生JSON: 配列でなければ空", () => {
  assert.deepEqual(readCandidates(null), []);
  assert.deepEqual(readCandidates({ id: "a" }), []);
});

test("候補に住所・生年月日・電話全桁が混ざっていても持ち出さない", () => {
  const rows = readCandidates([
    { id: "a", name: "山田 太郎", phone_tail: "5678", address1: "姫路市...", birth_date: "1980-01-01", phone: "090-1234-5678" },
  ]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["id", "last_visit", "name", "name_kana", "phone_tail", "visit_count"]);
});
