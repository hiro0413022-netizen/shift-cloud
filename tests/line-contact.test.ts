// LINE個人連絡先（gn_line_contacts / #121）純粋部のテスト
import test from "node:test";
import assert from "node:assert/strict";
import { matchesContactHint, contactFromName } from "../apps/genesis/src/lib/line-contact-pure.ts";

test("matchesContactHint: 表示名にヒントのどれかが含まれればリンク（大文字小文字無視）", () => {
  const hint = "小川,うらら,ウララ,urara,ogawa";
  assert.equal(matchesContactHint("小川うらら", hint), true);
  assert.equal(matchesContactHint("urara🌸", hint), true);
  assert.equal(matchesContactHint("Urara Ogawa", hint), true);
  assert.equal(matchesContactHint("ウララ", hint), true);
  assert.equal(matchesContactHint("山田太郎", hint), false);
});

test("matchesContactHint: 空・null・空ヒントは絶対にリンクしない（誤リンク防止）", () => {
  assert.equal(matchesContactHint(null, "小川"), false);
  assert.equal(matchesContactHint("", "小川"), false);
  assert.equal(matchesContactHint("小川うらら", null), false);
  assert.equal(matchesContactHint("小川うらら", " , , "), false);
});

test("contactFromName: 正式名 > 表示名 > null の順（空白だけは無いものとして扱う）", () => {
  assert.equal(contactFromName("小川うらら", "urara🌸"), "小川うらら");
  assert.equal(contactFromName(null, "urara🌸"), "urara🌸");
  assert.equal(contactFromName("  ", "urara🌸"), "urara🌸");
  assert.equal(contactFromName(null, "  "), null);
});
