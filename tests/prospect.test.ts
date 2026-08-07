import { test } from "node:test";
import assert from "node:assert/strict";
import { auditPage, detectNoSolicit, latestYear, salesScore, stripTags, unreachableAudit } from "../packages/prospect/src/audit.ts";
import { dedupeKeys, isDuplicate, normalizeName, normalizePhone, normalizeSite } from "../packages/prospect/src/dedupe.ts";
import { isAllowed, parseRobots } from "../packages/prospect/src/robots.ts";
import { UA } from "../packages/prospect/src/http.ts";
import { cityFromAddress, extractContact, extractLinks, extractRows, guessIndustry, looksBroken } from "../packages/prospect/src/parse.ts";
import type { PageSnapshot } from "../packages/prospect/src/types.ts";

/**
 * @yozan/prospect（#110）の純粋関数を固定する。
 * この仕組みは人が見ていない時間に動くので、壊れ方がそのまま事故になる:
 *  - 重複判定が緩い → 同じ医院を二重に営業先化し、②outreach で2通目を送る
 *  - スコアが逆転 → 直す価値のない先から順にデモを作る
 *  - 「営業お断り」を拾えない → 送ってはいけない先に送る
 */

const snap = (html: string, over: Partial<PageSnapshot> = {}): PageSnapshot => ({
  url: "https://example.jp/",
  finalUrl: "https://example.jp/",
  status: 200,
  headers: {},
  html,
  elapsedMs: 400,
  bytes: html.length,
  ...over,
});

const MODERN = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>@media (max-width: 600px){ .a{display:flex} } :root{--c:#000}</style></head>
<body><h1>まきの内科クリニック</h1>
<p>2026年の診療時間はこちら。ご予約はWeb予約から。初めての方へ、アクセス・駐車場のご案内。院長のプロフィール。採用情報あり。</p>
<a href="tel:0727000000">お電話</a><form><input></form>
${Array.from({ length: 10 }, (_, i) => `<a href="/p${i}">ページ${i}</a><img src="/i${i}.jpg">`).join("")}
${"診療内容の説明。".repeat(400)}
</body></html>`;

const LEGACY = `<html><head><title>ふるいクリニック</title></head>
<body bgcolor="#ffffff"><table width="800" role="presentation"><tr><td>
<font size="3">診療時間 9:00-12:00</font><br>Copyright 2011 ふるいクリニック
</td></tr></table></body></html>`;

// ---------------------------------------------------------------- audit

test("最新の西暦を拾う（未来の年は無視する）", () => {
  const now = new Date("2026-08-07T00:00:00+09:00");
  assert.equal(latestYear("2011年開院 2018年改装", now), 2018);
  assert.equal(latestYear("ご予約 2030年まで選べます", now), null);
  assert.equal(latestYear("更新なし", now), null);
});

test("stripTags は script/style を落として本文だけ残す", () => {
  const t = stripTags("<div>あ<script>var x=1</script><style>a{}</style>い</div>");
  assert.equal(t, "あ い");
});

test("スマホ未対応・SSL無し・更新が古い先ほどスコアが高い", () => {
  const good = auditPage(snap(MODERN), { now: new Date("2026-08-07") });
  const bad = auditPage(snap(LEGACY, { finalUrl: "http://old.example.jp/" }), { now: new Date("2026-08-07") });
  assert.ok(bad.score > good.score, `古いサイトの方が有望なはず (good=${good.score} bad=${bad.score})`);
  assert.equal(good.items.mobile.score, 5);
  assert.equal(bad.items.mobile.score, 1);
  assert.equal(bad.items.ssl.score, 1);
  assert.equal(bad.items.updated.score, 1);
});

test("改善余地が無いサイトのスコアは低く、致命的に古いサイトは高い", () => {
  const good = auditPage(snap(MODERN), { psiScore: 95, now: new Date("2026-08-07") });
  const bad = auditPage(snap(LEGACY, { finalUrl: "http://old.example.jp/" }), { psiScore: 20, now: new Date("2026-08-07") });
  assert.ok(good.score < 35, `十分なサイトが上位に来てはいけない (${good.score})`);
  assert.ok(bad.score > 70, `古いサイトが上位に来るべき (${bad.score})`);
});

test("PageSpeedのスコアが speed 項目に反映される", () => {
  assert.equal(auditPage(snap(MODERN), { psiScore: 100 }).items.speed.score, 5);
  assert.equal(auditPage(snap(MODERN), { psiScore: 20 }).items.speed.score, 1);
  // 未計測でも項目は必ず埋める（欠測を「悪い」にしない）
  assert.ok(auditPage(snap(MODERN)).items.speed.score >= 2);
});

test("「営業お断り」表示を検出する（②outreach の送信除外に使う）", () => {
  assert.equal(detectNoSolicit("営業目的のメールはお断りいたします"), true);
  assert.equal(detectNoSolicit("営業のお電話はご遠慮ください"), true);
  assert.equal(detectNoSolicit("セールスはお断り"), true);
  assert.equal(detectNoSolicit("平日は営業しております"), false);
  assert.ok(auditPage(snap(`<html><body>${"あ".repeat(50)}営業メールはお断りします</body></html>`)).noSolicit);
});

test("サーバーエラーの先はスコアを下げる", () => {
  const items = auditPage(snap(LEGACY)).items;
  const ok = salesScore(items, snap(LEGACY));
  const ng = salesScore(items, snap(LEGACY, { status: 500 }));
  assert.equal(ng, Math.max(0, ok - 20));
});

test("取得できなかった先は0点にせず中位に置く（消さずに人が見る）", () => {
  const a = unreachableAudit("timeout");
  assert.equal(a.ok, false);
  assert.equal(a.score, 40);
  assert.deepEqual(a.items, {});
});

// ---------------------------------------------------------------- dedupe

test("屋号の表記ゆれを正規化する", () => {
  assert.equal(normalizeName("医療法人社団　まきの内科クリニック"), normalizeName("まきの内科クリニック"));
  assert.equal(normalizeName("ＡＢＣ歯科医院"), "abc歯科医院");
});

test("電話番号は書式が違っても同じ鍵になる", () => {
  assert.equal(normalizePhone("072-770-0000"), "0727700000");
  assert.equal(normalizePhone("＋81 72-770-0000"), "0727700000");
  assert.equal(normalizePhone("072"), null);
});

test("サイトURLは www・末尾スラッシュ・スキームの差を吸収する", () => {
  assert.equal(normalizeSite("https://www.example.jp/"), normalizeSite("http://example.jp"));
  assert.equal(normalizeSite("ftp://example.jp"), null);
  assert.equal(normalizeSite("こわれたURL"), null);
});

test("電話かサイトが一致すれば屋号が違っても同一先とみなす", () => {
  const a = { ...dedupeKeys({ name: "たなか歯科", phone: "072-770-0000" }), city: "伊丹市" };
  const b = { ...dedupeKeys({ name: "たなか歯科クリニック", phone: "0727700000" }), city: "宝塚市" };
  assert.equal(isDuplicate(a, b), true);
});

test("屋号だけの一致は同じ市のときに限る（同名の医院は全国にある）", () => {
  const itami = { ...dedupeKeys({ name: "たなか歯科" }), city: "伊丹市" };
  const takarazuka = { ...dedupeKeys({ name: "たなか歯科" }), city: "宝塚市" };
  assert.equal(isDuplicate(itami, takarazuka), false);
  assert.equal(isDuplicate(itami, { ...itami }), true);
  // 市が分からない側があるときは安全側（重複とみなす）に倒す
  assert.equal(isDuplicate(itami, { ...dedupeKeys({ name: "たなか歯科" }), city: null }), true);
});

// ---------------------------------------------------------------- robots

test("robots.txt の Disallow を守り、Allow の方が長ければ通す", () => {
  const r = parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/open\n");
  assert.equal(isAllowed(r, "/kikan/list.html"), true);
  assert.equal(isAllowed(r, "/private/x"), false);
  assert.equal(isAllowed(r, "/private/open/a"), true);
});

test("自分宛のグループがあればワイルドカードより優先する", () => {
  const txt = "User-agent: *\nDisallow: /\n\nUser-agent: yozanprospectbot\nDisallow: /admin\n";
  assert.equal(isAllowed(parseRobots(txt, "yozanprospectbot"), "/kikan"), true);
  assert.equal(isAllowed(parseRobots(txt, "yozanprospectbot"), "/admin/x"), false);
  assert.equal(isAllowed(parseRobots(txt, "othersbot"), "/kikan"), false);
});

test("robots.txt が無い場合は制限なしとして扱う", () => {
  assert.equal(isAllowed({ rules: [], missing: true }, "/anything"), true);
  // 「Disallow:」空指定は制限なしの意味
  assert.equal(isAllowed(parseRobots("User-agent: *\nDisallow:\n"), "/anything"), true);
});

// ---------------------------------------------------------------- directory

test("一覧ページから詳細ページのリンクを絶対URLで拾う", () => {
  const html = `<a href="itamidb.cgi?cmd=dp&num=94">中川</a><a href="itamidb.cgi?cmd=dp&num=94">重複</a>
    <a href="/about">ここは違う</a><a href="https://other.example/x">外部</a><a href="#top">アンカー</a>`;
  const links = extractLinks(html, "https://www.itami-med.or.jp/kikan/index.html", "cmd=dp");
  assert.deepEqual(links, ["https://www.itami-med.or.jp/kikan/itamidb.cgi?cmd=dp&num=94"]);
});

test("パターン未指定なら同一ホストのリンクだけ拾う", () => {
  const html = `<a href="/a">A</a><a href="https://other.example/b">B</a><a href="mailto:x@y.jp">mail</a>`;
  const links = extractLinks(html, "https://www.itami-med.or.jp/kikan/index.html");
  assert.deepEqual(links, ["https://www.itami-med.or.jp/a"]);
});

test("詳細ページから屋号・電話・住所・自院サイトを拾う", () => {
  const html = `<html><head><title>中川クリニック | 伊丹市医師会</title></head><body>
    <h1>中川クリニック</h1>
    <p>〒664-0000 兵庫県伊丹市中央1-2-3</p>
    <p>TEL 072-770-1234</p>
    <a href="https://www.itami-med.or.jp/kikan/">名簿に戻る</a>
    <a href="https://www.facebook.com/x">Facebook</a>
    <a href="https://nakagawa-clinic.jp/">公式サイト</a>
  </body></html>`;
  const c = extractContact(html, "https://www.itami-med.or.jp/kikan/itamidb.cgi?cmd=dp&num=94");
  assert.equal(c.name, "中川クリニック");
  assert.equal(c.phone, "072-770-1234");
  assert.equal(c.websiteUrl, "https://nakagawa-clinic.jp/");
  assert.ok(c.address?.includes("伊丹市"));
  assert.equal(c.city, "伊丹市");
});

test("屋号が取れないページは name が空になり、営業先にしない目印になる", () => {
  const c = extractContact("<html><body><p>本文だけ</p></body></html>", "https://x.jp/a");
  assert.equal(c.name, "");
});

// ---------------------------------------------------------------- places

test("Placesの住所から市区町村を切り出す", () => {
  assert.equal(cityFromAddress("日本、〒664-0851 兵庫県伊丹市中央１丁目"), "伊丹市");
  assert.equal(cityFromAddress(null), null);
});

test("名簿ページの診療科名から業種を寄せる（拾えなければ巡回元の設定に戻す）", () => {
  assert.equal(guessIndustry("診療科目: 整形外科、リハビリテーション科", "naika"), "ortho");
  assert.equal(guessIndustry("ささき犬猫病院 動物病院", "naika"), "vet");
  assert.equal(guessIndustry("たきやま整骨院", "naika"), "judo");
  assert.equal(guessIndustry("カット・カラーの美容室", "other"), "salon");
  // 手がかりが無いときに勝手に other へ落とさない
  assert.equal(guessIndustry("診療案内", "naika"), "naika");
});

// ---------------------------------------------------------------- HTTPヘッダ

test("User-Agent はASCIIだけ（日本語を入れると全リクエストが落ちる）", () => {
  // 2026-08-07の実障害: UAに「株式会社YOZAN」が入っており、HTTPヘッダは ByteString(Latin-1) しか
  // 受け付けないため fetch が TypeError を投げ、**巡回も採点も1件残らず失敗**していた。
  // 画面上は「採点8・新規0」と一見動いたように見えるのが厄介なので、文字種をここで固定する。
  const bad = [...UA].filter((c) => c.charCodeAt(0) > 255);
  assert.deepEqual(bad, [], `UAに使えない文字が含まれています: ${bad.join(",")}`);
  // 実際にヘッダとして組み立てられることまで確認する（上の判定の裏取り）
  assert.doesNotThrow(() => new Headers({ "user-agent": UA }));
  // 誰が来ているか分かるよう、連絡先は必ず入れる
  assert.ok(UA.includes("@"), "UAに連絡先が必要");
});

// ---------------------------------------------------------------- 一覧の行から拾う（#114）

// 伊丹市医師会DBの構造を模したもの。詳細ページには見出しが無く title が全ページ共通なので、
// 一覧の表から「リンクの文字＝屋号」「同じ行のセル＝住所・電話・診療科」を読む。
const LIST_HTML = `<table>
<tr><th>医院・施設機関名</th><th>住所</th><th>電話番号</th><th>診療科目</th></tr>
<tr>
  <td><a href="itamidb.cgi?cmd=dp&num=6">あいわ内科クリニック</a></td>
  <td>伊丹市中央3-8-14</td><td>072-773-7160</td><td>内科、循環器内科</td>
</tr>
<tr>
  <td><a href="itamidb.cgi?cmd=dp&num=8">やまだ動物病院</a></td>
  <td>兵庫県伊丹市西台6-14-2</td><td>072-778-8110</td><td>動物病院</td>
</tr>
<tr><td><a href="/about">医師会について</a></td><td>案内</td></tr>
</table>`;

test("一覧ページの行から屋号・住所・電話を拾う（詳細ページの見出しに頼らない）", () => {
  const rows = extractRows(LIST_HTML, "https://www.itami-med.or.jp/kikan/list.html", "cmd=dp");
  assert.equal(rows.length, 2, "link_patternに合う行だけ拾う");
  assert.equal(rows[0].name, "あいわ内科クリニック");
  assert.equal(rows[0].phone, "072-773-7160");
  assert.equal(rows[0].city, "伊丹市");
  assert.ok(rows[0].address?.includes("中央"));
  assert.equal(rows[1].name, "やまだ動物病院");
  assert.equal(rows[1].city, "伊丹市", "都道府県付きの住所からも市を取れる");
});

test("行の診療科名から業種を寄せる（名簿は科が混在するため）", () => {
  const rows = extractRows(LIST_HTML, "https://www.itami-med.or.jp/kikan/list.html", "cmd=dp");
  assert.equal(guessIndustry(`${rows[1].name} ${rows[1].hint}`, "naika"), "vet");
  assert.equal(guessIndustry(`${rows[0].name} ${rows[0].hint}`, "other"), "naika");
});

test("屋号が全件同じなら「抽出が壊れている」と判定する", () => {
  // #114の実障害そのもの: title を拾って10件すべて同じ屋号になり、
  // 1件だけ登録されて残りが重複扱いで静かに消えた
  const same = Array.from({ length: 10 }, () => ({ name: "ITAMI med Database [データ詳細]" }));
  assert.match(looksBroken(same) ?? "", /全件同じ/);

  // 種類が少なすぎる場合も異常として拾う
  const few = [...Array(9)].map((_, i) => ({ name: i < 8 ? "同じ名前" : "別の名前" }));
  assert.ok(looksBroken(few));

  // 正常なら null（止めない）
  const ok = [...Array(10)].map((_, i) => ({ name: `クリニック${i}` }));
  assert.equal(looksBroken(ok), null);
  // 件数が少ないうちは判定しない（たまたま同名の可能性があるため）
  assert.equal(looksBroken([{ name: "a" }, { name: "a" }]), null);
});
