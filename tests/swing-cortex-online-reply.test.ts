// オンラインレッスン：返信下書きの材料づくり
//
// 守りたいこと:
//   1. AIが作ったURL（ライブラリに無いもの）は下書きから消える
//   2. 返信待ちの判定（最後の返信より後に届いたか）
//   3. 「今回返すもの」は最後の返信より後の会員の発言だけ
//   4. 似た相談の過去返信が上に来る
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanDraft, waitInfo, pendingIncoming, buildPairs, pickExamples, rankVideos, buildSystemPrompt, type ThreadMsg,
} from "../apps/swing-cortex/src/lib/online/reply.ts";

test("候補にないURLは消し、マークダウンを外す", () => {
  const r = cleanDraft(
    {
      reply: "**いい感じです**👍\n- 右足を踏ん張る\n【動画】\nhttps://youtu.be/REAL123456\n【作り話】\nhttps://youtu.be/FAKE999999",
      focus: ["右足かかとの外回り", "とても長い課題の名前がここに入ってしまうケースを切る", "c", "d"],
    },
    ["https://youtu.be/REAL123456"]
  );
  assert.ok(r.reply.includes("https://youtu.be/REAL123456"));
  assert.ok(!r.reply.includes("FAKE"));
  assert.ok(!r.reply.includes("**"));
  assert.ok(r.reply.includes("・右足を踏ん張る"));
  assert.equal(r.focus.length, 3);
  assert.ok(r.focus[1].length <= 24);
});

test("返信待ちの判定", () => {
  const now = new Date("2026-09-15T12:00:00+09:00");
  assert.deepEqual(waitInfo(null, null, now), { waiting: false, hours: 0 });
  assert.equal(waitInfo("2026-09-14T12:00:00+09:00", "2026-09-14T13:00:00+09:00", now).waiting, false);
  const w = waitInfo("2026-09-14T12:00:00+09:00", "2026-09-13T13:00:00+09:00", now);
  assert.equal(w.waiting, true);
  assert.equal(Math.round(w.hours), 24);
});

const T: ThreadMsg[] = [
  { direction: "in", kind: "text", body: "トップで左肘が曲がります", sentAt: "2026-09-01T10:00:00+09:00" },
  { direction: "in", kind: "video", body: "動画を送信しました。", sentAt: "2026-09-01T10:00:01+09:00" },
  { direction: "out", kind: "text", body: "左肘は伸ばす意識より、左肩を入れる意識を持ってみましょう！参考動画を送ります。", sentAt: "2026-09-02T10:00:00+09:00" },
  { direction: "in", kind: "text", body: "ラウンドでスライスが出ました", sentAt: "2026-09-03T10:00:00+09:00" },
  { direction: "out", kind: "text", body: "スライスはフェースの向きが原因のことが多いので、グリップを確認してみましょう！", sentAt: "2026-09-04T10:00:00+09:00" },
  { direction: "in", kind: "video", body: "動画を送信しました。", sentAt: "2026-09-05T10:00:00+09:00" },
  { direction: "in", kind: "text", body: "右足を意識しました", sentAt: "2026-09-05T10:00:05+09:00" },
];

test("今回返すものは最後の返信より後だけ", () => {
  const p = pendingIncoming(T);
  assert.equal(p.text, "右足を意識しました");
  assert.equal(p.videos, 1);
  assert.equal(p.since, "2026-09-05T10:00:00+09:00");
});

test("似た相談の過去返信が上に来る", () => {
  const pairs = buildPairs(T);
  assert.equal(pairs.length, 2);
  assert.ok(pairs[0].incoming.includes("動画・写真 1件"));
  const top = pickExamples(pairs, "コースでスライスが止まりません", 1);
  assert.equal(top.length, 1);
  assert.ok(top[0].reply.includes("スライス"));
});

test("動画はメモに近いタイトルが上", () => {
  const v = rankVideos(
    [
      { url: "a", title: "【基礎】トップは右足体重！体重移動の方法", useCount: 9 },
      { url: "b", title: "【重要】フェースの返し方！左手首の掌屈を徹底解説！", useCount: 1 },
    ],
    "フェースが開いてスライス。左手首の掌屈を覚える",
    2
  );
  assert.equal(v[0].url, "b");
});

test("プランのルールがプロンプトに入る", () => {
  const s = buildSystemPrompt({ coach_name: "RaRa", plan_rules: { regular: "スイングのみ" } }, "regular");
  assert.ok(s.includes("RaRa"));
  assert.ok(s.includes("レギュラープラン。スイングのみ"));
  assert.ok(s.includes("動画を見ていない"));
});
