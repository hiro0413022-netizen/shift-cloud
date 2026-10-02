// YouTube チャンネルの新着動画の読み方（#335・2026-10-03）。実行: npm test
// 公式サイトに出す ID は URL と HTML 属性に直接入るので、形が違うものは必ず捨てる。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeXmlEntities,
  isYoutubeId,
  parseYoutubeFeed,
  pickVideos,
  youtubeThumb,
  type YoutubeVideo,
} from "../packages/core/src/youtube-feed.ts";

function entry(id: string, title: string, opts: { short?: boolean; views?: string; date?: string } = {}) {
  const href = opts.short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
  return `<entry>
  <id>yt:video:${id}</id>
  <yt:videoId>${id}</yt:videoId>
  <yt:channelId>UC4QTQjrDLsx4WF3fdYuLHZQ</yt:channelId>
  <title>${title}</title>
  <link rel="alternate" href="${href}"/>
  <published>${opts.date ?? "2026-09-30T09:00:00+00:00"}</published>
  <media:group>
   <media:title>${title}</media:title>
   <media:community><media:statistics views="${opts.views ?? "100"}"/></media:community>
  </media:group>
 </entry>`;
}
const feed = (...entries: string[]) =>
  `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>RaRa LESSON</title>${entries.join("")}</feed>`;

test("新しい順のまま、ID・タイトル・公開日・再生回数を読む", () => {
  const v = parseYoutubeFeed(
    feed(
      entry("72b2Jop8dh8", "【伸び上がる人必見】バックスイングはこう上げる！", { views: "11782" }),
      entry("PMIM93hQeWY", "【ご報告】姫路にインドアゴルフスタジオを作りました！", { date: "2026-09-26T09:00:00+00:00" }),
    ),
  );
  assert.equal(v.length, 2);
  assert.deepEqual(v[0], {
    id: "72b2Jop8dh8",
    title: "【伸び上がる人必見】バックスイングはこう上げる！",
    published: "2026-09-30T09:00:00+00:00",
    views: 11782,
    short: false,
  });
  assert.equal(v[1].id, "PMIM93hQeWY");
});

test("フィードの title（チャンネル名）を動画と取り違えない", () => {
  const v = parseYoutubeFeed(feed(entry("-6bj9APmA4Y", "お辞儀スイング応用編")));
  assert.equal(v.length, 1);
  assert.equal(v[0].title, "お辞儀スイング応用編");
});

test("タイトルの実体参照を戻し、改行・連続空白は1つにする", () => {
  const v = parseYoutubeFeed(feed(entry("WP1TQwNnpXQ", "手元が&quot;浮く&quot;人 &amp; 直し方\n  &#x2605;&#9733;")));
  assert.equal(v[0].title, '手元が"浮く"人 & 直し方 ★★');
});

test("IDの形が違う entry は捨てる（URLやHTMLに入るため）", () => {
  const v = parseYoutubeFeed(
    feed(
      entry('abc"><scrip', "攻撃"),
      entry("short", "短すぎ"),
      entry("Nq9IDFRyGi0", "スピン量"),
    ),
  );
  assert.deepEqual(v.map((x) => x.id), ["Nq9IDFRyGi0"]);
});

test("同じ動画が2回あっても1本、タイトルが空なら捨てる", () => {
  const v = parseYoutubeFeed(feed(entry("LIAQiFM9oFE", "右足"), entry("LIAQiFM9oFE", "右足"), entry("ctNzZp5oHmE", "  ")));
  assert.deepEqual(v.map((x) => x.id), ["LIAQiFM9oFE"]);
});

test("壊れた入力・空でも落ちない", () => {
  assert.deepEqual(parseYoutubeFeed(""), []);
  assert.deepEqual(parseYoutubeFeed(null), []);
  assert.deepEqual(parseYoutubeFeed("<html>503</html>"), []);
  assert.deepEqual(parseYoutubeFeed(feed(`<entry><yt:videoId>UBica22HgvY</yt:videoId>`)), []);
});

test("再生回数が無い・数字でないときは null", () => {
  const v = parseYoutubeFeed(feed(entry("KpVqhnDRtGE", "3大要素", { views: "" }), entry("ffHlkOM6v8o", "腕を振れ", { views: "1e9" })));
  assert.equal(v[0].views, null);
  assert.equal(v[1].views, null);
});

test("ショートを見分ける", () => {
  const v = parseYoutubeFeed(feed(entry("x_8gimkm7Dw", "フェースターン", { short: true })));
  assert.equal(v[0].short, true);
});

const mk = (id: string, short = false): YoutubeVideo => ({ id, title: id, published: "", views: null, short });

test("おすすめで固定している動画は一覧から外し、ショートは後回し", () => {
  const list = [mk("aaaaaaaaaaa"), mk("bbbbbbbbbbb", true), mk("PMIM93hQeWY"), mk("ccccccccccc"), mk("ddddddddddd")];
  assert.deepEqual(
    pickVideos(list, { limit: 3, exclude: ["PMIM93hQeWY"] }).map((v) => v.id),
    ["aaaaaaaaaaa", "ccccccccccc", "ddddddddddd"],
  );
});

test("通常の動画が足りないときだけショートで埋める", () => {
  const list = [mk("aaaaaaaaaaa"), mk("bbbbbbbbbbb", true), mk("ccccccccccc", true)];
  assert.deepEqual(pickVideos(list, { limit: 2 }).map((v) => v.id), ["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  assert.deepEqual(pickVideos(list, { limit: 0 }), []);
  assert.deepEqual(pickVideos(list, { limit: 9, includeShorts: true }).length, 3);
});

test("サムネイルURL・IDの判定", () => {
  assert.equal(youtubeThumb("PMIM93hQeWY"), "https://i.ytimg.com/vi/PMIM93hQeWY/hqdefault.jpg");
  assert.equal(youtubeThumb("PMIM93hQeWY", "maxres"), "https://i.ytimg.com/vi/PMIM93hQeWY/maxresdefault.jpg");
  assert.equal(youtubeThumb("../../x"), "");
  assert.equal(isYoutubeId("-6bj9APmA4Y"), true);
  assert.equal(isYoutubeId("-6bj9APmA4"), false);
  assert.equal(isYoutubeId(123), false);
});

test("実体参照の境界（範囲外の数値は消す）", () => {
  assert.equal(decodeXmlEntities("&#1114112;a&lt;b&gt;&apos;"), "a<b>'");
});
