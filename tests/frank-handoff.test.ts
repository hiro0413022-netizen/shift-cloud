// 会員ポータル → 公式サイト予約ページ の引き渡しトークン（#152）
//
// ここが壊れると「マイページからログイン済みのはずなのに、予約ページで会員番号を
// もう一度聞かれる」に戻る（= 直したはずの不具合の再発）。逆に検証が甘くなると
// 誰でも他人の会員番号で予約できてしまうので、両側を固定する。
import test from "node:test";
import assert from "node:assert/strict";
import { signHandoff, verifyHandoff, HANDOFF_TTL_SEC } from "../packages/core/src/frank-handoff.ts";

const SECRET = "frank-handoff-v1:test-service-role-key";

test("署名したトークンは同じ鍵で会員番号に戻る", () => {
  assert.equal(verifyHandoff(signHandoff("FR0002", SECRET), SECRET), "FR0002");
});

test("鍵が違えば通らない（他所で作った署名を信用しない）", () => {
  const t = signHandoff("FR0002", SECRET);
  assert.equal(verifyHandoff(t, SECRET + "x"), null);
});

test("中身を書き換えたら通らない（会員番号のなりすまし）", () => {
  const t = signHandoff("FR0002", SECRET);
  const forged = Buffer.from(JSON.stringify({ n: "FR0009", e: Math.floor(Date.now() / 1000) + 600 }), "utf8")
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal(verifyHandoff(`${forged}.${t.split(".")[1]}`, SECRET), null);
});

test("期限切れは通らない", () => {
  assert.equal(verifyHandoff(signHandoff("FR0002", SECRET, -1), SECRET), null);
});

test("壊れた入力で例外を投げない（公開APIから何でも飛んでくる）", () => {
  for (const bad of ["", ".", "a.b", "....", "x".repeat(600), "YWJj.zzz"]) {
    assert.equal(verifyHandoff(bad, SECRET), null);
  }
});

test("既定の有効期限は6時間（切れても入力フォームに戻るだけ）", () => {
  assert.equal(HANDOFF_TTL_SEC, 6 * 60 * 60);
});
