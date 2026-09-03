import test from "node:test";
import assert from "node:assert/strict";
import { jpPhoneError, normalizeJpPhone, toE164Jp, isJpMobile } from "../packages/core/src/jp-phone.ts";

/* ============================================================
   電話番号の検証（#208）
   実障害: 携帯なのに10桁「0905655867」で申込 → Square が決済リンクの発行を
   "Invalid phone number." で拒否 → お客様が決済ページに行けなかった（2026-09-03）。
   ここを通れば外部に渡してよい／通らなければ渡さない、を固定する。
   ============================================================ */

test("実障害の番号を弾く（携帯なのに10桁）", () => {
  const msg = jpPhoneError("0905655867");
  assert.ok(msg && msg.includes("11桁"), msg ?? "(null)");
  // ⚠ ここが要。怪しい番号は E164 を返さない＝Squareに渡さない
  assert.equal(toE164Jp("0905655867"), null);
});

test("正しい携帯は通る", () => {
  assert.equal(jpPhoneError("09056555867"), null);
  assert.equal(jpPhoneError("090-1234-5678"), null);
  assert.equal(jpPhoneError("090 1234 5678"), null);
  assert.equal(toE164Jp("090-1234-5678"), "+819012345678");
  assert.equal(isJpMobile("090-1234-5678"), true);
});

test("固定電話（10桁）とIP電話（11桁）", () => {
  assert.equal(jpPhoneError("0791 22 3344"), null);
  assert.equal(toE164Jp("0791 22 3344"), "+81791223344");
  assert.equal(jpPhoneError("079-123-45678"), "固定電話の番号は10桁です（入力は11桁です）。例 079-123-4567");
  assert.equal(jpPhoneError("050-1234-5678"), null);
  assert.equal(isJpMobile("0791223344"), false);
});

test("国番号つき・全角・0080始まりも正規化する", () => {
  assert.equal(toE164Jp("+81 90 1234 5678"), "+819012345678");
  assert.equal(toE164Jp("＋８１９０１２３４５６７８"), "+819012345678");
  assert.equal(toE164Jp("０９０－１２３４－５６７８"), "+819012345678");
  assert.equal(normalizeJpPhone("+81 90 1234 5678"), "09012345678");
  assert.equal(normalizeJpPhone("008190-1234-5678"), "09012345678");
});

test("空・短すぎ・文字混じりは理由を返す", () => {
  assert.equal(jpPhoneError(""), "電話番号をご入力ください");
  assert.equal(jpPhoneError(null), "電話番号をご入力ください");
  assert.equal(jpPhoneError("090あ12345678"), "電話番号は数字とハイフンでご入力ください");
  assert.ok(jpPhoneError("1234"));
  assert.equal(toE164Jp("1234"), null);
  assert.equal(toE164Jp(null), null);
});

test("フリーダイヤル 0120は10桁 / 0800は11桁", () => {
  assert.equal(jpPhoneError("0120-123-456"), null);
  assert.equal(jpPhoneError("0800-123-4567"), null);
});
