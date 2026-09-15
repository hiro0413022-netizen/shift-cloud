// オンラインレッスン：LINEトーク履歴CSVの読み取り
//
// 守りたいこと:
//   1. 本文の改行・カンマ・Excel対策の「'」を壊さず読めること
//   2. 同じCSVを2回取り込んでも二重にならない（fingerprint が決定的・同じ秒の同じ本文も区別）
//   3. 表示名の「☆」「⚠️」「(レギュラー)」から会員名・プラン・印を分けられること
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLineExport, parseLineName, parseFileName, nameKeyOf, extractVideos, normalizeYoutubeUrl, kindOf,
} from "../apps/swing-cortex/src/lib/online/line-csv.ts";

const CSV = [
  "﻿アカウント名,RaRaLESSON 会員様専用",
  "タイムゾーン,'+09:00",
  "ダウンロード日時,2026/09/15 14:34",
  "送信者タイプ,送信者名,送信日,送信時刻,内容",
  'Account,応答メッセージ,2025/09/18,14:22:59,"akiraさん\r\n\r\nこちらは会員様専用アカウントとなります"',
  "User,☆辻子　曜(レギュラー),2025/09/18,14:24:55,辻子　曜です。よろしくお願いします。",
  "User,☆辻子　曜(レギュラー),2025/09/18,14:26:21,動画を送信しました。",
  "User,☆辻子　曜(レギュラー),2025/09/18,14:26:21,動画を送信しました。",
  'User,☆辻子　曜(レギュラー),2025/09/23,08:34:40,"\'\r\nレッスンありがとうございます。\r\n左手側の腕畳み, 意識しました"',
  'Account,RaRa,2025/09/19,08:06:14,"動きかなり良くなっていますね👏\r\n┈┈┈┈┈┈┈┈┈┈\r\n【重要】腕のたたみ方-肘は体の前から外さない-\r\nhttps://youtu.be/5kBDxR35BaU\r\nこの動画を参考に""畳んで""ください！"',
  "",
].join("\r\n");

test("ヘッダー・複数行・クォート・接頭辞「'」を読める", () => {
  const r = parseLineExport(CSV, "20250918_20260909_☆辻子曜レギュラー.csv");
  assert.equal(r.accountName, "RaRaLESSON 会員様専用");
  assert.equal(r.messages.length, 6);
  assert.equal(r.skipped, 0);
  const sys = r.messages.find((m) => m.direction === "system");
  assert.ok(sys && sys.body.startsWith("akiraさん"));
  const quoted = r.messages.find((m) => m.body.includes("腕畳み"));
  assert.ok(quoted);
  assert.equal(quoted.body, "レッスンありがとうございます。\n左手側の腕畳み, 意識しました");
  const reply = r.messages.find((m) => m.direction === "out");
  assert.ok(reply && reply.body.includes('"畳んで"'));
  assert.equal(reply.sentAt, "2025-09-19T08:06:14+09:00");
  // 時刻順に並ぶ
  const times = r.messages.map((m) => m.sentAt);
  assert.deepEqual([...times].sort(), times);
});

test("同じ秒に同じ本文が2件あっても別の指紋、2回読めば同じ指紋", () => {
  const a = parseLineExport(CSV);
  const b = parseLineExport(CSV);
  const vids = a.messages.filter((m) => m.kind === "video");
  assert.equal(vids.length, 2);
  assert.notEqual(vids[0].fingerprint, vids[1].fingerprint);
  assert.deepEqual(a.messages.map((m) => m.fingerprint), b.messages.map((m) => m.fingerprint));
});

test("表示名から 名前・プラン・印 を分ける", () => {
  assert.deepEqual(parseLineName("☆辻子　曜(レギュラー)"), {
    name: "辻子 曜", nameKey: "辻子曜", lineName: "☆辻子　曜(レギュラー)", plan: "regular", mark: "☆",
  });
  const w = parseLineName("⚠️村居 尚樹(レギュラー)");
  assert.equal(w.name, "村居 尚樹");
  assert.equal(w.mark, "⚠️");
  assert.equal(parseLineName("武長敦(プレミアム)").plan, "premium");
  assert.equal(parseLineName("山田 花子").plan, "other");
});

test("CSVから会員が読めればそれを使い、無ければファイル名から", () => {
  const r = parseLineExport(CSV);
  assert.equal(r.member?.name, "辻子 曜");
  const onlyAccount = CSV.split("\r\n").filter((l) => !l.startsWith("User")).join("\r\n");
  const f = parseLineExport(onlyAccount, "20250509_20260914_⚠️村居 尚樹レギュラー.csv");
  assert.equal(f.member?.name, "村居 尚樹");
  assert.equal(f.member?.plan, "regular");
  assert.equal(parseFileName("20260108_20260913_武長敦プレミアム.csv")?.plan, "premium");
});

test("照合キーは空白・全角・印・プラン表記の違いを吸収する", () => {
  assert.equal(nameKeyOf("☆辻子　曜(レギュラー)"), nameKeyOf("辻子 曜"));
  assert.equal(nameKeyOf("陶　江"), nameKeyOf("陶江"));
});

test("返信文から動画のタイトルとURLを拾う（?si= は落とす）", () => {
  const v = extractVideos(
    "動きいいです\n【重要】腕のたたみ方-肘は体の前から外さない-\nhttps://youtu.be/5kBDxR35BaU\n" +
      "〈参考動画〉\n【飛距離アップ】回転だけしてたらいいと思ってない？\nhttps://youtu.be/svXvzgIjRpE?si=abc\n" +
      "https://www.youtube.com/watch?v=x_8gimkm7Dw&t=3"
  );
  assert.deepEqual(v, [
    { url: "https://youtu.be/5kBDxR35BaU", title: "【重要】腕のたたみ方-肘は体の前から外さない-" },
    { url: "https://youtu.be/svXvzgIjRpE", title: "【飛距離アップ】回転だけしてたらいいと思ってない？" },
    { url: "https://youtu.be/x_8gimkm7Dw", title: "" },
  ]);
  assert.equal(normalizeYoutubeUrl("https://example.com/x"), null);
  assert.equal(kindOf("写真を送信しました。"), "photo");
  assert.equal(kindOf("写真を送信しましたが見えますか"), "text");
});
