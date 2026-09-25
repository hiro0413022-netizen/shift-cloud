// コーチ紹介（#279・2026-09-25）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicCoaches,
  normalizeCoachInput,
  splitLines,
  checkPhoto,
  isShowable,
} from "../packages/core/src/frank-coach-profile.ts";

const row = (o: Record<string, unknown>) => ({ id: "x", name: "名前", ...o }) as never;

test("並び順→名前の順に出る", () => {
  const out = publicCoaches([
    row({ id: "b", name: "佐藤", sort_order: 20 }),
    row({ id: "a", name: "小川 うらら", sort_order: 10 }),
    row({ id: "c", name: "阿部", sort_order: 20 }),
  ]);
  assert.deepEqual(out.map((c) => c.id), ["a", "c", "b"]);
});

test("下書き・名前なしは表に出さない", () => {
  assert.equal(isShowable(row({ published: false })), false);
  assert.equal(isShowable(row({ name: "  " })), false);
  assert.equal(publicCoaches([row({ published: false })]).length, 0);
});

test("名前を出さないスタッフは、行が残っていても公開面に出ない", () => {
  // #243 の line_hidden。管理画面の候補から外すだけでなく、公開用の変換でも落とす
  const hidden = "bb276810-2603-41f1-b464-371f827a271e";
  const out = publicCoaches(
    [row({ id: "ng", name: "出さない人", staff_id: hidden }), row({ id: "ok", name: "出す人" })],
    [hidden],
  );
  assert.deepEqual(out.map((c) => c.id), ["ok"]);
});

test("紹介文と資格は行に割れる（空行は落ちる）", () => {
  assert.deepEqual(splitLines("あ\n\n い \r\nう"), ["あ", "い", "う"]);
  const [c] = publicCoaches([row({ bio: "1行目\n2行目", quals: "資格A\n資格B" })]);
  assert.deepEqual(c.bio, ["1行目", "2行目"]);
  assert.deepEqual(c.quals, ["資格A", "資格B"]);
});

test("入力の整え：空欄は null・並び順は既定100", () => {
  const r = normalizeCoachInput({ name: " 小川 うらら ", bio: "", published: "on" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.name, "小川 うらら");
  assert.equal(r.value.bio, null);
  assert.equal(r.value.sort_order, 100);
  assert.equal(r.value.published, true);
});

test("名前は必須", () => {
  const r = normalizeCoachInput({ name: "   " });
  assert.equal(r.ok, false);
});

test("写真URLは http(s) か相対パスだけ", () => {
  const bad = normalizeCoachInput({ name: "A", photo_url: "javascript:alert(1)" });
  assert.ok(bad.ok && bad.value.photo_url === null);
  const good = normalizeCoachInput({ name: "A", photo_url: "https://example.com/a.jpg" });
  assert.ok(good.ok && good.value.photo_url === "https://example.com/a.jpg");
});

test("写真の受け入れ条件", () => {
  assert.equal(checkPhoto(null), null);
  assert.equal(checkPhoto({ type: "image/jpeg", size: 100 }), null);
  assert.ok(checkPhoto({ type: "image/gif", size: 100 }));
  assert.ok(checkPhoto({ type: "image/png", size: 20 * 1024 * 1024 }));
});
