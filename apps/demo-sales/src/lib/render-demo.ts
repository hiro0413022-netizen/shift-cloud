// デモサイトレンダラー — DemoBrief＋業種テンプレート → 単一ファイルHTML。
// 方針:
//  - 写真は「院から提供された写真・フリー素材」を管理画面からアップロードしたもの（demo-assetsバケットの公開URL）のみ。
//    既存サイトの写真・ロゴは無断利用しない。未設定の箇所はCSSグラデーション＋絵文字のプレースホルダで成立させる
//  - レスポンシブ1ファイル（PC/スマホ両対応）。スマホは下部固定の電話/予約/アクセスバー
//  - noindex/nofollow をHTML側にも埋め込む（配信側の X-Robots-Tag と二重化）
//  - DEMOラベル常時表示。仮データには「※仮」を残す（正式契約後に差し替える前提を隠さない）

import { getTemplate } from "./templates";
import type { DemoBrief } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl2br = (s: string) => esc(s).replace(/\n/g, "<br>");

export function renderDemo(brief: DemoBrief): string {
  const t = getTemplate(brief.industry);
  const d = t.defaults;
  const primary = brief.colorPrimary || t.palette.primary;
  const name = brief.clinicName;
  const tagline = brief.tagline || d.tagline;
  const intro = brief.intro || d.intro;
  const services = brief.services?.length ? brief.services : d.services;
  const strengths = brief.strengths?.length ? brief.strengths : d.strengths;
  const firstVisit = brief.firstVisit?.length ? brief.firstVisit : d.firstVisit;
  const hoursRows = brief.hoursRows?.length ? brief.hoursRows : d.hoursRows;
  const hoursNote = brief.hoursNote ?? d.hoursNote;
  const reserveNote = brief.reserveNote || d.reserveNote;
  const phone = brief.phone || "00-0000-0000（※仮）";
  const telHref = "tel:" + (brief.phone || "0000000000").replace(/[^\d+]/g, "");
  const address = brief.address || "住所を掲載します（※仮）";
  const news = brief.news?.length
    ? brief.news
    : [
        { date: "2026.07", text: "ホームページをリニューアルしました（※仮のお知らせ）" },
        { date: "2026.07", text: `${t.vocab.hours}・${t.vocab.firstVisit.replace(/へ$/, "")}のご案内を見やすくしました（※仮）` },
      ];

  const hoursTable = `
    <table class="hours">
      ${hoursRows
        .map(
          (row, i) =>
            `<tr>${row
              .map((c, j) => (i === 0 || j === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`))
              .join("")}</tr>`
        )
        .join("")}
    </table>`;

  const webReserveBtn = brief.webReserve
    ? `<a class="btn btn-sub" href="#reserve">Web予約（デモ）</a>`
    : "";

  // 画像（アップロード済みのみ。URLは公開バケット）
  const safeImg = (u?: string) => (u && /^https?:\/\//.test(u) ? esc(u) : "");
  const logo = safeImg(brief.logoImage);
  const hero = safeImg(brief.heroImage);
  // ヒーローの見せ方: overlay=暗いスクリム＋白文字（既定） / card=白カード＋黒文字 / light=写真を薄く敷く
  const heroClass = brief.heroStyle === "card" ? "card" : brief.heroStyle === "light" ? "lt" : "ov";
  const dImg = safeImg(brief.directorImage);
  const gallery = (brief.gallery ?? []).filter((g) => safeImg(g.url)).slice(0, 6);

  const gallerySection = gallery.length
    ? `
<section id="gallery">
  <h2>院内のご案内</h2><span class="h2sub">Gallery</span>
  <div class="gal">
    ${gallery
      .map(
        (g) => `<figure><img src="${safeImg(g.url)}" alt="${esc(g.caption ?? "院内の様子")}" loading="lazy">${
          g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ""
        }</figure>`
      )
      .join("")}
  </div>
</section>`
    : "";

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${esc(name)}（提案用デモ）</title>
<style>
:root{--p:${primary};--pd:${t.palette.dark};--soft:${t.palette.soft};--ac:${t.palette.accent};--txt:#1f2937;--dim:#6b7280;--line:#e5e7eb}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;color:var(--txt);line-height:1.8;background:#fff;padding-top:36px}
.demo-ribbon{position:fixed;top:0;left:0;right:0;z-index:100;background:#111827;color:#fbbf24;font-size:12px;text-align:center;padding:8px;letter-spacing:.05em}
header{position:sticky;top:36px;z-index:90;background:rgba(255,255,255,.95);backdrop-filter:blur(6px);border-bottom:1px solid var(--line)}
.hwrap{max-width:1080px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:12px 20px}
.logo{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:700;color:var(--pd)}
.logo small{display:block;font-size:10px;font-weight:400;color:var(--dim);letter-spacing:.2em}
.logo img{height:44px;width:auto;max-width:160px;object-fit:contain}
footer .flogo{height:40px;width:auto;max-width:160px;object-fit:contain;margin-bottom:10px}
nav a{margin-left:18px;font-size:14px;color:var(--txt);text-decoration:none}
nav a:hover{color:var(--p)}
.tel-head{display:flex;align-items:center;gap:10px}
.tel-head a{background:var(--p);color:#fff;text-decoration:none;padding:8px 16px;border-radius:8px;font-weight:700;font-size:15px}
.hero{background:linear-gradient(135deg,var(--soft) 0%,#fff 55%,var(--soft) 100%);position:relative;overflow:hidden}
.hero::after{content:"${t.heroEmoji}";position:absolute;right:-10px;bottom:-30px;font-size:220px;opacity:.12}
.hero-in{max-width:1080px;margin:0 auto;padding:72px 20px 64px}
.hbox{max-width:640px}
/* 写真あり: 画像は常にcoverで中央 */
.hero.img{background:#0f172a}
.hero.img::before{content:"";position:absolute;inset:0;background-image:url("${hero}");background-size:cover;background-position:center;transform:scale(1.02)}
.hero.img .hero-in{position:relative;z-index:2;padding:104px 20px 112px}
/* A: 暗いスクリム＋白文字 */
.hero.ov::after{content:"";position:absolute;inset:0;font-size:0;background:linear-gradient(95deg,rgba(9,14,26,.82) 0%,rgba(9,14,26,.66) 38%,rgba(9,14,26,.3) 72%,rgba(9,14,26,.12) 100%),linear-gradient(180deg,rgba(9,14,26,.35),rgba(9,14,26,.15) 40%,rgba(9,14,26,.45))}
.hero.ov h1{color:#fff;text-shadow:0 3px 26px rgba(0,0,0,.5)}
.hero.ov p{color:rgba(255,255,255,.94);text-shadow:0 2px 14px rgba(0,0,0,.5)}
.hero.ov .btn-sub{background:rgba(255,255,255,.14);color:#fff;border-color:rgba(255,255,255,.85);backdrop-filter:blur(6px)}
/* B: 白いカード＋黒文字 */
.hero.card::after{content:"";position:absolute;inset:0;font-size:0;background:linear-gradient(180deg,rgba(9,14,26,.12),rgba(9,14,26,.28))}
.hero.card .hbox{background:rgba(255,255,255,.94);backdrop-filter:blur(10px);border-radius:22px;padding:40px 40px 36px;box-shadow:0 24px 60px rgba(9,14,26,.25)}
/* C: 写真を薄く敷く */
.hero.lt::after{content:"";position:absolute;inset:0;font-size:0;background:linear-gradient(100deg,rgba(255,255,255,.96) 0%,rgba(255,255,255,.9) 46%,rgba(255,255,255,.5) 76%,rgba(255,255,255,.2) 100%)}
.gal{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.gal figure{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
.gal img{display:block;width:100%;height:220px;object-fit:cover}
.gal figcaption{padding:10px 14px;font-size:13px;color:var(--dim)}
.d-photo img{width:100%;height:100%;object-fit:cover;border-radius:14px}
.hero h1{font-size:34px;line-height:1.5;color:var(--pd);margin-bottom:16px}
.hero p{max-width:560px;color:var(--dim);margin-bottom:28px}
.cta{display:flex;gap:12px;flex-wrap:wrap}
.btn{display:inline-block;padding:15px 30px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;transition:transform .15s ease,box-shadow .15s ease}
.btn:hover{transform:translateY(-2px)}
.btn-tel{background:var(--p);color:#fff;box-shadow:0 10px 26px color-mix(in srgb,var(--p) 45%,transparent)}
.btn-sub{background:#fff;color:var(--p);border:2px solid var(--p);box-shadow:0 8px 22px rgba(9,14,26,.12)}
.newsbar{max-width:1080px;margin:-24px auto 0;padding:0 20px;position:relative;z-index:5}
.newsbar .in{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 20px;box-shadow:0 6px 20px rgba(0,0,0,.06)}
.newsbar .row{display:flex;gap:14px;font-size:14px;padding:4px 0}
.newsbar .date{color:var(--p);font-weight:700;white-space:nowrap}
section{max-width:1080px;margin:0 auto;padding:64px 20px}
h2{font-size:24px;color:var(--pd);text-align:center;margin-bottom:8px}
.h2sub{display:block;text-align:center;font-size:11px;letter-spacing:.3em;color:var(--ac);margin-bottom:32px;text-transform:uppercase}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.card{background:var(--soft);border-radius:14px;padding:26px}
.card h3{color:var(--pd);font-size:17px;margin-bottom:8px}
.card p{font-size:14px;color:var(--dim)}
.strengths{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.strengths .s{background:#fff;border:1px solid var(--line);border-left:5px solid var(--p);border-radius:10px;padding:18px 20px;font-weight:600;font-size:15px}
.hours-wrap{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px}
table.hours{width:100%;border-collapse:collapse;font-size:14px;min-width:560px}
.hours th,.hours td{border:1px solid var(--line);padding:10px 8px;text-align:center}
.hours th{background:var(--soft);color:var(--pd)}
.note{font-size:13px;color:var(--dim);margin-top:12px}
ol.flow{counter-reset:n;list-style:none}
ol.flow li{position:relative;padding:14px 16px 14px 56px;background:#fff;border:1px solid var(--line);border-radius:10px;margin-bottom:10px;font-size:15px}
ol.flow li::before{counter-increment:n;content:counter(n);position:absolute;left:14px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;background:var(--p);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14px}
.director{display:grid;grid-template-columns:180px 1fr;gap:28px;align-items:start;background:var(--soft);border-radius:16px;padding:32px}
.d-photo{width:180px;height:180px;border-radius:14px;background:linear-gradient(160deg,var(--ac),var(--pd));display:flex;align-items:center;justify-content:center;font-size:64px;color:#fff}
.director h3{color:var(--pd);margin-bottom:10px}
.director .nm{font-size:14px;color:var(--dim);margin-bottom:12px}
.access-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.map-ph{background:repeating-linear-gradient(45deg,var(--soft),var(--soft) 12px,#fff 12px,#fff 24px);border:1px dashed var(--ac);border-radius:14px;min-height:260px;display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:14px;text-align:center}
dl.info div{display:grid;grid-template-columns:96px 1fr;gap:10px;padding:12px 0;border-bottom:1px solid var(--line);font-size:15px}
dl.info dt{color:var(--pd);font-weight:700}
.recruit{background:linear-gradient(135deg,var(--pd),var(--p));border-radius:16px;color:#fff;text-align:center;padding:44px 24px}
.recruit h2{color:#fff}
.recruit p{opacity:.9;margin:10px 0 22px;font-size:15px}
.recruit a{background:#fff;color:var(--pd);padding:12px 30px;border-radius:10px;text-decoration:none;font-weight:700}
footer{background:#1f2937;color:#9ca3af;text-align:center;font-size:12px;padding:28px 20px 96px;margin-top:40px}
footer .fn{color:#fff;font-size:15px;font-weight:700;margin-bottom:6px}
.mobile-bar{display:none;position:fixed;bottom:0;left:0;right:0;z-index:100;background:#fff;border-top:1px solid var(--line);box-shadow:0 -4px 16px rgba(0,0,0,.08)}
.mobile-bar a{flex:1;text-align:center;padding:12px 4px 14px;font-size:12px;text-decoration:none;color:var(--pd);font-weight:700}
.mobile-bar a span{display:block;font-size:20px}
.mobile-bar a.tel{background:var(--p);color:#fff}
@media(max-width:760px){
  .hero.img .hero-in{padding:72px 20px 84px}
  .hero.ov::after{background:linear-gradient(180deg,rgba(9,14,26,.45) 0%,rgba(9,14,26,.62) 55%,rgba(9,14,26,.78) 100%)}
  .hero.lt::after{background:linear-gradient(180deg,rgba(255,255,255,.93) 0%,rgba(255,255,255,.9) 60%,rgba(255,255,255,.86) 100%)}
  .hero.card .hbox{padding:28px 24px 24px;border-radius:18px}
  .gal img{height:180px}
  .logo{font-size:16px;gap:8px}
  .logo img{height:34px;max-width:110px}
  body{padding-top:32px}
  .demo-ribbon{font-size:10px;padding:7px 4px}
  header{top:32px}
  nav{display:none}
  .hero h1{font-size:25px}
  .hero-in{padding:48px 20px 56px}
  .director{grid-template-columns:1fr;text-align:center}
  .d-photo{margin:0 auto}
  .access-grid{grid-template-columns:1fr}
  .mobile-bar{display:flex}
  .tel-head a{padding:7px 12px;font-size:13px}
}
</style>
</head>
<body>
<div class="demo-ribbon">営業提案用デモサイト（非公開・検索対象外）— 仮画像・仮文章（※仮）を含みます。正式制作時に実素材へ差し替えます</div>
<header>
  <div class="hwrap">
    <div class="logo">
      ${logo ? `<img src="${logo}" alt="${esc(name)}">` : ""}
      <span>${esc(name)}<small>${esc(t.label)}（デモ）</small></span>
    </div>
    <nav>
      <a href="#services">${esc(t.vocab.services)}</a>
      <a href="#hours">${esc(t.vocab.hours)}</a>
      <a href="#first">${esc(t.vocab.firstVisit)}</a>
      ${gallery.length ? `<a href="#gallery">院内のご案内</a>` : ""}
      <a href="#access">アクセス</a>
    </nav>
    <div class="tel-head"><a href="${telHref}">📞 ${esc(phone)}</a></div>
  </div>
</header>

<div class="hero${hero ? ` img ${heroClass}` : ""}">
  <div class="hero-in">
    <div class="hbox">
      <h1>${nl2br(tagline)}</h1>
      <p>${nl2br(intro)}</p>
      <div class="cta">
        <a class="btn btn-tel" href="${telHref}">📞 電話で予約・相談する</a>
        ${webReserveBtn}
        <a class="btn btn-sub" href="#first">${esc(t.vocab.firstVisit)}</a>
      </div>
    </div>
  </div>
</div>

<div class="newsbar"><div class="in">
${news.map((n) => `<div class="row"><span class="date">${esc(n.date)}</span><span>${esc(n.text)}</span></div>`).join("")}
</div></div>

<section>
  <h2>当院が選ばれる理由</h2><span class="h2sub">Features</span>
  <div class="strengths">
    ${strengths.map((s) => `<div class="s">✅ ${esc(s)}</div>`).join("")}
  </div>
</section>

<section id="services" style="background:var(--soft);max-width:none"><div style="max-width:1080px;margin:0 auto">
  <h2>${esc(t.vocab.services)}</h2><span class="h2sub">Services</span>
  <div class="cards">
    ${services.map((s) => `<div class="card" style="background:#fff"><h3>${esc(s.name)}</h3><p>${esc(s.desc)}</p></div>`).join("")}
  </div>
</div></section>

<section id="hours">
  <h2>${esc(t.vocab.hours)}</h2><span class="h2sub">Hours</span>
  <div class="hours-wrap">${hoursTable}
  <p class="note">${esc(hoursNote)}</p>
  <p class="note" id="reserve">🗓 <b>ご予約について:</b> ${esc(reserveNote)}</p>
  </div>
</section>

<section id="first" style="background:var(--soft);max-width:none"><div style="max-width:800px;margin:0 auto">
  <h2>${esc(t.vocab.firstVisit)}</h2><span class="h2sub">First Visit</span>
  <ol class="flow">
    ${firstVisit.map((f) => `<li>${esc(f)}</li>`).join("")}
  </ol>
</div></section>
${gallerySection}
<section>
  <div class="director">
    <div class="d-photo">${dImg ? `<img src="${dImg}" alt="${esc(brief.directorName || "院長")}">` : t.heroEmoji}</div>
    <div>
      <h3>ごあいさつ</h3>
      <p class="nm">${esc(brief.directorTitle || "院長")}　${esc(brief.directorName || "（お名前を掲載します ※仮）")}</p>
      <p style="font-size:15px">${nl2br(brief.directorMessage || `${t.vocab.patients}に安心して通っていただける場所であるために、一つひとつの診療を丁寧に。スタッフ一同、心を込めて対応いたします。（※仮文章 — 院長先生のお考えを伺って作成します）`)}</p>
    </div>
  </div>
</section>

<section id="access" style="background:var(--soft);max-width:none"><div style="max-width:1080px;margin:0 auto">
  <h2>アクセス</h2><span class="h2sub">Access</span>
  <div class="access-grid">
    <div class="map-ph">🗺 Googleマップを埋め込みます<br>（正式制作時に実際の地図・写真を掲載）</div>
    <dl class="info">
      <div><dt>住所</dt><dd>${esc(address)}</dd></div>
      <div><dt>電話</dt><dd><a href="${telHref}" style="color:var(--p);font-weight:700;text-decoration:none">${esc(phone)}</a></dd></div>
      <div><dt>交通</dt><dd>${esc(brief.access || "最寄り駅・バス停からの道順を掲載します（※仮）")}</dd></div>
      <div><dt>駐車場</dt><dd>${esc(brief.parking || "駐車場のご案内を掲載します（※仮）")}</dd></div>
    </dl>
  </div>
</div></section>

<section>
  <div class="recruit">
    <h2>採用情報</h2>
    <p>${esc(brief.recruit || "一緒に働く仲間を募集しています。募集職種・条件はこちらから。（※仮 — 採用ページは集患・採用強化プランで制作）")}</p>
    <a href="#">募集要項を見る（デモ）</a>
  </div>
</section>

<footer>
  ${logo ? `<img class="flogo" src="${logo}" alt="${esc(name)}">` : ""}
  <div class="fn">${esc(name)}</div>
  <div>${esc(address)}　📞 ${esc(phone)}</div>
  <div style="margin-top:10px;opacity:.7">このページは営業提案用のデモサイトです。実在の医院の公式サイトではありません。<br>制作: YOZAN（お問い合わせは提案書記載の連絡先へ）</div>
</footer>

<div class="mobile-bar">
  <a class="tel" href="${telHref}"><span>📞</span>電話する</a>
  <a href="#reserve"><span>🗓</span>予約方法</a>
  <a href="#hours"><span>⏰</span>${esc(t.vocab.hours)}</a>
  <a href="#access"><span>🗺</span>アクセス</a>
</div>
</body>
</html>`;
}
