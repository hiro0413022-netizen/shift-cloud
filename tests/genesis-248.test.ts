import test from "node:test";
import assert from "node:assert/strict";
import { detectWake, normalizeForWake, wakeStartup } from "../apps/genesis/src/lib/jarvis-pure.ts";
import { SYSTEM_CARDS, mergeSystemCards, splitLinkLabel } from "../apps/genesis/src/lib/store-links.ts";

// #248 「ジェネシスと呼んでも反応しない」（実機 Edge で待受が一度も押されていなかった）＋ システムへ直行カード

test("#248 呼びかけ: ひらがな・全角英字・大文字でも気づく", () => {
  assert.equal(normalizeForWake("げねしすＧＥＮ"), "ゲネシスgen");
  assert.equal(detectWake("Genesis 今日の予約").rest, "今日の予約");
  assert.equal(detectWake("ＧＥＮＥＳＩＳ、売上は").rest, "売上は");
  assert.equal(detectWake("じぇねしす 会員数").rest, "会員数");
  assert.equal(detectWake("ジェネシス、ジェネシス、今月の売上は？").rest, "今月の売上は？");
  assert.equal(detectWake("発想力がわかんなくなっちゃう").hit, false);
});

test("#248 待受: 自分でオフなら触らない／許可済みなら自動／未許可なら案内だけ", () => {
  assert.equal(wakeStartup("off", "granted"), "off");
  assert.equal(wakeStartup("on", null), "auto");
  assert.equal(wakeStartup(null, "granted"), "auto");
  assert.equal(wakeStartup(null, "prompt"), "hint");
  assert.equal(wakeStartup(null, "denied"), "hint");
  assert.equal(wakeStartup(null, null), "hint");
});

test("#248 直行カード: sp_links を足す・同じホストは二重に出さない・括弧を一言に", () => {
  assert.deepEqual(splitLinkLabel("Smart Hello（予約スケジュール）"), { name: "Smart Hello", note: "予約スケジュール" });
  assert.deepEqual(splitLinkLabel("YOZANコーポレートサイト"), { name: "YOZANコーポレートサイト", note: null });
  const merged = mergeSystemCards(SYSTEM_CARDS, [
    { id: "1", label: "Smart Hello（予約スケジュール）", url: "https://golfwingtakarazuka.smarthello.jp/account/login", note: "共有ID", store: "GOLF WING 宝塚" },
    { id: "2", label: "Money OS（お金管理）", url: "https://money-golfwing.vercel.app", note: null },
    { id: "3", label: "壊れたリンク", url: "javascript:alert(1)", note: null },
    { id: "4", label: "Smart Hello 2", url: "https://golfwingtakarazuka.smarthello.jp/x", note: null },
    { id: "5", label: "ワークス WebEDI（発注）", url: "https://webedi-sv.worksweb-jp.com/websys/orderlogin/login/", note: "商品発注サイト" },
  ]);
  assert.equal(merged.length, SYSTEM_CARDS.length + 2);
  const sh = merged.find((c) => c.key === "link:1");
  assert.equal(sh?.name, "Smart Hello");
  assert.equal(sh?.note, "予約スケジュール");
  assert.equal(sh?.store, "GOLF WING 宝塚");
  assert.equal(sh?.icon, "link");
  assert.equal(new Set(merged.map((c) => c.key)).size, merged.length);
  // 既知アプリのURLはすべて https
  for (const c of SYSTEM_CARDS) assert.match(c.href, /^https:\/\//);
});
