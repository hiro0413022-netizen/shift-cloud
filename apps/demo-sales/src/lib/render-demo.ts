// デモサイトレンダラー v2 — DemoBrief＋業種テンプレート → 複数ページ構成の単一ファイルHTML。
// 方針:
//  - 単一HTMLのままハッシュルーティングで6ページ（ホーム/案内/初めての方へ/紹介/アクセス/Web予約）。見出しは業種語彙(vocabOf)で切り替える。
//    DB(dms_demos.html)・配信(/d/[token])・version管理は従来のまま
//  - 写真は「先方から提供された写真・フリー素材」のみ。未設定箇所は sample-art.ts のSVGイラスト（※仮画像ラベル入り）で成立
//  - Web予約はデモ動作のみ: カレンダー→時間枠→入力→確認→完了。どこにも送信・保存しない
//  - アニメーション: スクロール連動のフェード/スライドイン・ヘッダー縮小・ページ遷移フェード。prefers-reduced-motion対応
//  - noindex/nofollow・DEMOリボン・※仮ラベルは従来どおり
//  - 埋め込みJSはテンプレートリテラル内のため、バッククォートと ${ を使わない（文字列連結で書く）

import { getTemplate, vocabOf, SYMPTOMS, EXTRA_FAQ } from "./templates";
import { sampleHero, samplePortrait, sampleMap, sampleGallery } from "./sample-art";
import type { DemoBrief } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl2br = (s: string) => esc(s).replace(/\n/g, "<br>");

export function renderDemo(brief: DemoBrief): string {
  const t = getTemplate(brief.industry);
  // 語彙は必ず vocabOf 経由で取る。業種を足したときに「院長あいさつ」が美容室のデモに出るのを防ぐ（#110）
  const vb = vocabOf(t);
  const d = t.defaults;
  const primary = brief.colorPrimary || t.palette.primary;
  const palette = { ...t.palette, primary };
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
  const symptoms = SYMPTOMS[t.key] ?? SYMPTOMS.other;
  const news = brief.news?.length
    ? brief.news
    : [
        { date: "2026.07", text: "ホームページをリニューアルしました（※仮のお知らせ）" },
        { date: "2026.07", text: "Web予約を開始しました（※仮のお知らせ）" },
        { date: "2026.07", text: `${t.vocab.hours}・${t.vocab.firstVisit.replace(/へ$/, "")}のご案内を見やすくしました（※仮）` },
      ];

  // ---- 画像（実写真が最優先。無ければSVGサンプル） ----
  const safeImg = (u?: string) => (u && /^https?:\/\//.test(u) ? esc(u) : "");
  const logo = safeImg(brief.logoImage);
  const realHero = safeImg(brief.heroImage);
  const hero = realHero || sampleHero(palette, t.heroEmoji);
  // 実写真は brief.heroStyle に従う。SVGサンプルは明るい絵なので light 固定
  const heroClass = realHero
    ? brief.heroStyle === "card"
      ? "card"
      : brief.heroStyle === "light"
        ? "lt"
        : "ov"
    : "lt";
  const dImg = safeImg(brief.directorImage) || samplePortrait(palette);
  const realGallery = (brief.gallery ?? []).filter((g) => safeImg(g.url)).slice(0, 6);
  const gallery = realGallery.length
    ? realGallery.map((g) => ({ url: safeImg(g.url), caption: g.caption ?? `${vb.place}の様子` }))
    : sampleGallery(palette, t.heroEmoji);
  const mapImg = sampleMap(palette);

  // ---- FAQ（共通＋業種別） ----
  const faq: { q: string; a: string }[] = [
    { q: "予約は必要ですか？", a: reserveNote },
    { q: `初めての${vb.visit}で必要なものは？`, a: firstVisit[0] ?? "ご持参いただくものを掲載します。（※仮）" },
    { q: "駐車場はありますか？", a: brief.parking || "駐車場のご案内を掲載します。（※仮）" },
    ...(EXTRA_FAQ[t.key] ?? []),
    { q: "クレジットカードは使えますか？", a: "お支払い方法の対応状況を掲載します。（※仮）" },
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

  const svcEmojis = [t.heroEmoji, "💬", "📋", "🧪", "💊", "🌿", "🤝", "📖"];
  const hoursJson = JSON.stringify(hoursRows).replace(/</g, "\\u003c");

  // CTAバンド（各ページ下部の共通導線）
  const ctaBand = `
<div class="ctaband rv">
  <h3>ご予約・ご相談はお気軽に</h3>
  <p>${esc(reserveNote)}</p>
  <div class="cta">
    <a class="btn btn-w" href="${telHref}">📞 ${esc(phone)}</a>
    <a class="btn btn-ghost" href="#/reserve">🗓 Web予約（デモ）</a>
  </div>
</div>`;

  // ==== ページ: ホーム ====
  const pgHome = `
<div class="page" data-pg="home">
  <div class="hero img ${heroClass}">
    <div class="hero-in">
      <div class="hbox">
        <h1>${nl2br(tagline)}</h1>
        <p>${nl2br(intro)}</p>
        <div class="cta">
          <a class="btn btn-tel" href="${telHref}">📞 電話で予約・相談する</a>
          <a class="btn btn-sub" href="#/reserve">🗓 Web予約（デモ）</a>
        </div>
      </div>
    </div>
  </div>

  <div class="newsbar"><div class="in">
    <div class="nhead">お知らせ</div>
    ${news.slice(0, 3).map((n) => `<div class="row"><span class="date">${esc(n.date)}</span><span>${esc(n.text)}</span></div>`).join("")}
  </div></div>

  <section>
    <h2 class="rv">当院が選ばれる理由</h2><span class="h2sub rv">Features</span>
    <div class="strengths">
      ${strengths.map((s, i) => `<div class="s rv" style="transition-delay:${i * 0.08}s">✅ ${esc(s)}</div>`).join("")}
    </div>
  </section>

  <section class="wide soft"><div class="inn">
    <h2 class="rv">${esc(t.vocab.services)}</h2><span class="h2sub rv">Services</span>
    <div class="cards">
      ${services
        .map(
          (s, i) =>
            `<div class="card wt rv" style="transition-delay:${i * 0.08}s"><div class="ic">${svcEmojis[i % svcEmojis.length]}</div><h3>${esc(s.name)}</h3><p>${esc(s.desc)}</p></div>`
        )
        .join("")}
    </div>
    <div class="more rv"><a class="btn btn-line" href="#/services">${esc(t.vocab.services)}をくわしく見る →</a></div>
  </div></section>

  <section>
    <h2 class="rv">院内のご案内</h2><span class="h2sub rv">Gallery</span>
    <div class="gal three">
      ${gallery
        .slice(0, 3)
        .map(
          (g, i) =>
            `<figure class="rv" style="transition-delay:${i * 0.08}s"><img src="${g.url}" alt="${esc(g.caption)}" loading="lazy"><figcaption>${esc(g.caption)}</figcaption></figure>`
        )
        .join("")}
    </div>
    <div class="more rv"><a class="btn btn-line" href="#/about">${esc(vb.about)}を見る →</a></div>
  </section>

  <section class="wide soft"><div class="inn">
    <div class="teaser rv">
      <img class="tsr-img" src="${dImg}" alt="${esc(brief.directorName || vb.owner)}">
      <div>
        <h2 style="text-align:left">ごあいさつ</h2>
        <p class="nm">${esc(brief.directorTitle || vb.owner)}　${esc(brief.directorName || "（お名前を掲載します ※仮）")}</p>
        <p class="tsr-txt">${nl2br(
          (brief.directorMessage || `${vb.patients}に安心してお越しいただける場所であるために、一つひとつの${vb.careWord}を丁寧に。スタッフ一同、心を込めて対応いたします。（※仮文章）`).slice(0, 90)
        )}…</p>
        <a class="btn btn-line" href="#/about">全文を読む →</a>
      </div>
    </div>
  </div></section>

  <section>
    <h2 class="rv">${esc(t.vocab.hours)}・アクセス</h2><span class="h2sub rv">Hours / Access</span>
    <div class="hours-wrap rv">${hoursTable}
      <p class="note">${esc(hoursNote)}</p>
    </div>
    <div class="acc-teaser rv">
      <img src="${mapImg}" alt="地図（※仮）">
      <div>
        <dl class="info">
          <div><dt>住所</dt><dd>${esc(address)}</dd></div>
          <div><dt>電話</dt><dd><a class="tel-link" href="${telHref}">${esc(phone)}</a></dd></div>
        </dl>
        <a class="btn btn-line" href="#/access">アクセスをくわしく見る →</a>
      </div>
    </div>
  </section>

  <section>${ctaBand}</section>
</div>`;

  // ==== ページ: 案内（診療案内 / メニュー） ====
  const pgServices = `
<div class="page" data-pg="services">
  <div class="phero"><h1>${esc(t.vocab.services)}</h1><p>Services</p></div>
  <section>
    <p class="lead rv">${nl2br(intro)}</p>
    <div class="svc-list">
      ${services
        .map(
          (s, i) => `
      <div class="svc rv" style="transition-delay:${(i % 3) * 0.07}s">
        <div class="svc-no">${String(i + 1).padStart(2, "0")}</div>
        <div class="svc-ic">${svcEmojis[i % svcEmojis.length]}</div>
        <div><h3>${esc(s.name)}</h3><p>${esc(s.desc)}</p></div>
      </div>`
        )
        .join("")}
    </div>
  </section>
  <section class="wide soft"><div class="inn">
    <h2 class="rv">こんな症状・お悩みはご相談ください</h2><span class="h2sub rv">Check</span>
    <div class="sym">
      ${symptoms.map((s, i) => `<div class="s rv" style="transition-delay:${i * 0.06}s">☑ ${esc(s)}</div>`).join("")}
    </div>
    <p class="note rv" style="text-align:center">上記以外でも、気になることがあればお気軽にご相談ください。（※仮）</p>
  </div></section>
  <section>
    <h2 class="rv">${esc(t.vocab.hours)}</h2><span class="h2sub rv">Hours</span>
    <div class="hours-wrap rv">${hoursTable}<p class="note">${esc(hoursNote)}</p></div>
    ${ctaBand}
  </section>
</div>`;

  // ==== ページ: 初めての方へ ====
  const pgFirst = `
<div class="page" data-pg="first">
  <div class="phero"><h1>${esc(t.vocab.firstVisit)}</h1><p>First Visit</p></div>
  <section>
    <h2 class="rv">${esc(vb.visitFlow)}・お持ちいただくもの</h2><span class="h2sub rv">Flow</span>
    <ol class="flow">
      ${firstVisit.map((f, i) => `<li class="rv" style="transition-delay:${i * 0.08}s">${esc(f)}</li>`).join("")}
    </ol>
  </section>
  <section class="wide soft"><div class="inn">
    <h2 class="rv">よくあるご質問</h2><span class="h2sub rv">FAQ</span>
    <div class="faq">
      ${faq
        .map(
          (f, i) => `
      <details class="rv" style="transition-delay:${(i % 4) * 0.06}s">
        <summary><span class="q">Q</span>${esc(f.q)}<span class="ar">▾</span></summary>
        <div class="a"><span class="q a-q">A</span>${esc(f.a)}</div>
      </details>`
        )
        .join("")}
    </div>
  </div></section>
  <section>${ctaBand}</section>
</div>`;

  // ==== ページ: 紹介（院長あいさつ / スタッフ・店舗紹介） ====
  const pgAbout = `
<div class="page" data-pg="about">
  <div class="phero"><h1>${esc(vb.about)}</h1><p>About</p></div>
  <section>
    <div class="director rv">
      <div class="d-photo"><img src="${dImg}" alt="${esc(brief.directorName || vb.owner)}"></div>
      <div>
        <h3>ごあいさつ</h3>
        <p class="nm">${esc(brief.directorTitle || vb.owner)}　${esc(brief.directorName || "（お名前を掲載します ※仮）")}</p>
        <p style="font-size:15px">${nl2br(brief.directorMessage || `${vb.patients}に安心してお越しいただける場所であるために、一つひとつの${vb.careWord}を丁寧に。スタッフ一同、心を込めて対応いたします。（※仮文章 — ${vb.ownerHonorific}のお考えを伺って作成します）`)}</p>
      </div>
    </div>
  </section>
  <section class="wide soft"><div class="inn">
    <h2 class="rv">院内のご案内</h2><span class="h2sub rv">Gallery</span>
    <div class="gal">
      ${gallery
        .map(
          (g, i) =>
            `<figure class="rv" style="transition-delay:${(i % 3) * 0.08}s"><img src="${g.url}" alt="${esc(g.caption)}" loading="lazy"><figcaption>${esc(g.caption)}</figcaption></figure>`
        )
        .join("")}
    </div>
  </div></section>
  <section>
    <div class="recruit rv">
      <h2>採用情報</h2>
      <p>${esc(brief.recruit || "一緒に働く仲間を募集しています。募集職種・条件はこちらから。（※仮 — 採用ページは集患・採用強化プランで制作）")}</p>
      <a href="#/first" onclick="return false" style="cursor:default">募集要項を見る（デモ）</a>
    </div>
  </section>
  <section>${ctaBand}</section>
</div>`;

  // ==== ページ: アクセス ====
  const pgAccess = `
<div class="page" data-pg="access">
  <div class="phero"><h1>アクセス</h1><p>Access</p></div>
  <section>
    <div class="access-grid">
      <img class="map-img rv" src="${mapImg}" alt="地図（※仮）">
      <dl class="info rv">
        <div><dt>住所</dt><dd>${esc(address)}</dd></div>
        <div><dt>電話</dt><dd><a class="tel-link" href="${telHref}">${esc(phone)}</a></dd></div>
        <div><dt>交通</dt><dd>${esc(brief.access || "最寄り駅・バス停からの道順を掲載します（※仮）")}</dd></div>
        <div><dt>駐車場</dt><dd>${esc(brief.parking || "駐車場のご案内を掲載します（※仮）")}</dd></div>
      </dl>
    </div>
  </section>
  <section class="wide soft"><div class="inn">
    <h2 class="rv">${esc(t.vocab.hours)}</h2><span class="h2sub rv">Hours</span>
    <div class="hours-wrap rv">${hoursTable}
      <p class="note">${esc(hoursNote)}</p>
      <p class="note">🗓 <b>ご予約について:</b> ${esc(reserveNote)}</p>
    </div>
  </div></section>
  <section>${ctaBand}</section>
</div>`;

  // ==== ページ: Web予約（デモ） ====
  const pgReserve = `
<div class="page" data-pg="reserve">
  <div class="phero"><h1>Web予約</h1><p>Reservation</p></div>
  <section style="max-width:820px">
    <div class="demo-note rv">※このWeb予約は<b>営業提案用のデモ</b>です。操作を試せますが、実際の予約・データ送信は一切行われません。</div>
    <div class="steps rv">
      <div class="st on" data-st="1"><span>1</span>日付</div>
      <div class="st" data-st="2"><span>2</span>時間</div>
      <div class="st" data-st="3"><span>3</span>入力</div>
      <div class="st" data-st="4"><span>4</span>完了</div>
    </div>

    <div id="r-step1" class="rbox rv">
      <div class="cal-head">
        <button type="button" id="cal-prev" class="cal-nav">‹</button>
        <div id="cal-title" class="cal-title"></div>
        <button type="button" id="cal-next" class="cal-nav">›</button>
      </div>
      <table class="cal" id="cal-table"></table>
      <p class="note">「休」= 休診日（${esc(t.vocab.hours)}表から自動判定・※仮）</p>
    </div>

    <div id="r-step2" class="rbox hid">
      <div class="rb-head"><b id="slot-date"></b> の空き状況（※仮のデータです）</div>
      <div id="slot-list"></div>
      <p class="note">○=予約可能　×=予約済み（デモ用の仮データ）</p>
      <button type="button" class="btn btn-line" id="back1">← 日付を選び直す</button>
    </div>

    <div id="r-step3" class="rbox hid">
      <div class="rb-head">ご予約情報の入力（<b id="form-when"></b>）</div>
      <div class="fld"><label>お名前 <span class="req">必須</span></label><input type="text" id="f-name" placeholder="山田 太郎"></div>
      <div class="fld"><label>お電話番号 <span class="req">必須</span></label><input type="tel" id="f-tel" placeholder="090-0000-0000"></div>
      <div class="fld"><label>ご利用区分</label><select id="f-kind"><option>初めての${vb.visit}</option><option>2回目以降</option><option>相談のみ</option></select></div>
      <div class="fld"><label>ご相談内容（任意）</label><textarea id="f-note" rows="3" placeholder="症状やご希望があればご記入ください"></textarea></div>
      <p class="ferr hid" id="f-err">お名前とお電話番号を入力してください（デモのため実在の情報でなくて構いません）</p>
      <div class="cta">
        <button type="button" class="btn btn-tel" id="to-confirm">入力内容を確認する</button>
        <button type="button" class="btn btn-line" id="back2">← 時間を選び直す</button>
      </div>
    </div>

    <div id="r-step4" class="rbox hid">
      <div class="rb-head">ご予約内容の確認</div>
      <dl class="info" id="confirm-list"></dl>
      <div class="cta">
        <button type="button" class="btn btn-tel" id="do-reserve">この内容で予約する（デモ）</button>
        <button type="button" class="btn btn-line" id="back3">← 入力に戻る</button>
      </div>
    </div>

    <div id="r-done" class="rbox hid done">
      <div class="done-ic">✓</div>
      <h3>ご予約を受け付けました（デモ）</h3>
      <p id="done-when" style="font-weight:700"></p>
      <p class="note">実際のサイトでは、確認メール送信・院内の予約台帳への反映までを自動で行えます。<br>（このデモでは送信・保存は行われていません）</p>
      <button type="button" class="btn btn-line" id="r-reset">最初からやり直す</button>
    </div>
  </section>
  <section style="max-width:820px">
    <div class="ctaband rv">
      <h3>お急ぎの場合はお電話で</h3>
      <p>${esc(reserveNote)}</p>
      <div class="cta"><a class="btn btn-w" href="${telHref}">📞 ${esc(phone)}</a></div>
    </div>
  </section>
</div>`;

  const navLinks = `
      <a href="#/home" data-nav="home">ホーム</a>
      <a href="#/services" data-nav="services">${esc(t.vocab.services)}</a>
      <a href="#/first" data-nav="first">${esc(t.vocab.firstVisit)}</a>
      <a href="#/about" data-nav="about">${esc(vb.aboutShort)}</a>
      <a href="#/access" data-nav="access">アクセス</a>`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${esc(name)}（提案用デモ）</title>
<style>
${buildCss(palette, hero)}
</style>
</head>
<body>
<div class="demo-ribbon">営業提案用デモサイト（非公開・検索対象外）— 仮画像・仮文章（※仮）を含みます。正式制作時に実素材へ差し替えます</div>
<header id="hd">
  <div class="hwrap">
    <a class="logo" href="#/home">
      ${logo ? `<img src="${logo}" alt="${esc(name)}">` : ""}
      <span>${esc(name)}<small>${esc(t.label)}（デモ）</small></span>
    </a>
    <nav>${navLinks}
      <a class="nav-cta" href="#/reserve" data-nav="reserve">🗓 Web予約</a>
    </nav>
    <div class="hd-r">
      <a class="tel-head" href="${telHref}">📞 ${esc(phone)}</a>
      <button type="button" class="menu-btn" id="menu-btn" aria-label="メニュー"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>

<div class="drawer" id="drawer">
  <nav>${navLinks}
    <a href="#/reserve" data-nav="reserve">🗓 Web予約（デモ）</a>
    <a href="${telHref}">📞 電話をかける</a>
  </nav>
</div>

<main id="main">
${pgHome}
${pgServices}
${pgFirst}
${pgAbout}
${pgAccess}
${pgReserve}
</main>

<footer>
  ${logo ? `<img class="flogo" src="${logo}" alt="${esc(name)}">` : ""}
  <div class="fn">${esc(name)}</div>
  <div>${esc(address)}　📞 ${esc(phone)}</div>
  <nav class="fnav">${navLinks}<a href="#/reserve">Web予約</a></nav>
  <div style="margin-top:10px;opacity:.7">このページは営業提案用のデモサイトです。実在の医院の公式サイトではありません。<br>制作: YOZAN（お問い合わせは提案書記載の連絡先へ）</div>
</footer>

<div class="mobile-bar">
  <a class="tel" href="${telHref}"><span>📞</span>電話する</a>
  <a href="#/reserve"><span>🗓</span>Web予約</a>
  <a href="#/first"><span>👋</span>初めての方</a>
  <a href="#/access"><span>🗺</span>アクセス</a>
</div>

<script type="application/json" id="hours-data">${hoursJson}</script>
<script>
${buildJs()}
</script>
</body>
</html>`;
}

// ---- CSS / JS は関数に分離（テンプレートの見通しのため） ----

function buildCss(
  p: { primary: string; dark: string; soft: string; accent: string },
  heroUrl: string
): string {
  return `
:root{--p:${p.primary};--pd:${p.dark};--soft:${p.soft};--ac:${p.accent};--txt:#1f2937;--dim:#6b7280;--line:#e5e7eb}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;color:var(--txt);line-height:1.8;background:#fff;padding-top:36px}
.demo-ribbon{position:fixed;top:0;left:0;right:0;z-index:120;background:#111827;color:#fbbf24;font-size:12px;text-align:center;padding:8px;letter-spacing:.05em}
/* ヘッダー（スクロールで縮小） */
header{position:fixed;top:36px;left:0;right:0;z-index:110;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);transition:box-shadow .3s ease}
header.sc{box-shadow:0 4px 20px rgba(0,0,0,.09)}
.hwrap{max-width:1080px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:14px 20px;transition:padding .3s ease}
header.sc .hwrap{padding:7px 20px}
.logo{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:700;color:var(--pd);text-decoration:none}
.logo small{display:block;font-size:10px;font-weight:400;color:var(--dim);letter-spacing:.2em}
.logo img{height:44px;width:auto;max-width:160px;object-fit:contain;transition:height .3s ease}
header.sc .logo img{height:34px}
footer .flogo{height:40px;width:auto;max-width:160px;object-fit:contain;margin-bottom:10px}
nav a{margin-left:16px;font-size:14px;color:var(--txt);text-decoration:none;position:relative;padding-bottom:4px}
nav a::after{content:"";position:absolute;left:0;bottom:0;width:0;height:2px;background:var(--p);transition:width .25s ease}
nav a:hover::after,nav a.on::after{width:100%}
nav a.on{color:var(--p);font-weight:700}
a.nav-cta{background:var(--p);color:#fff !important;padding:8px 14px;border-radius:9px;font-weight:700}
a.nav-cta::after{display:none}
a.nav-cta:hover{opacity:.9}
.hd-r{display:flex;align-items:center;gap:10px}
.tel-head{background:var(--p);color:#fff;text-decoration:none;padding:8px 16px;border-radius:8px;font-weight:700;font-size:15px}
.menu-btn{display:none;width:42px;height:42px;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:pointer;flex-direction:column;align-items:center;justify-content:center;gap:5px}
.menu-btn span{display:block;width:18px;height:2px;background:var(--pd);transition:transform .3s ease,opacity .3s ease}
.menu-btn.op span:nth-child(1){transform:translateY(7px) rotate(45deg)}
.menu-btn.op span:nth-child(2){opacity:0}
.menu-btn.op span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
/* モバイルドロワー */
.drawer{position:fixed;inset:0;z-index:105;background:rgba(255,255,255,.98);padding:130px 32px 40px;transform:translateX(100%);transition:transform .35s cubic-bezier(.22,.8,.3,1);overflow:auto}
.drawer.open{transform:none}
.drawer nav{display:flex;flex-direction:column}
.drawer nav a{margin:0;padding:15px 4px;font-size:17px;border-bottom:1px solid var(--line)}
/* ページ切替 */
main{min-height:60vh;padding-top:74px}
.page{display:none}
.page.act{display:block;animation:pgIn .45s ease both}
@keyframes pgIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
/* 下層ページのヒーロー帯 */
.phero{background:linear-gradient(120deg,var(--pd),var(--p));color:#fff;text-align:center;padding:52px 20px 44px}
.phero h1{font-size:28px;letter-spacing:.06em}
.phero p{opacity:.75;font-size:12px;letter-spacing:.35em;text-transform:uppercase;margin-top:4px}
/* トップヒーロー */
.hero{position:relative;overflow:hidden;background:linear-gradient(135deg,var(--soft) 0%,#fff 55%,var(--soft) 100%)}
.hero.img{background:#0f172a}
.hero.img::before{content:"";position:absolute;inset:0;background-image:url("${heroUrl}");background-size:cover;background-position:center;transform:scale(1.02)}
.hero.img .hero-in{position:relative;z-index:2;padding:104px 20px 112px}
.hero.ov::after{content:"";position:absolute;inset:0;background:linear-gradient(95deg,rgba(9,14,26,.82) 0%,rgba(9,14,26,.66) 38%,rgba(9,14,26,.3) 72%,rgba(9,14,26,.12) 100%),linear-gradient(180deg,rgba(9,14,26,.35),rgba(9,14,26,.15) 40%,rgba(9,14,26,.45))}
.hero.ov h1{color:#fff;text-shadow:0 3px 26px rgba(0,0,0,.5)}
.hero.ov p{color:rgba(255,255,255,.94);text-shadow:0 2px 14px rgba(0,0,0,.5)}
.hero.ov .btn-sub{background:rgba(255,255,255,.14);color:#fff;border-color:rgba(255,255,255,.85);backdrop-filter:blur(6px)}
.hero.card::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(9,14,26,.12),rgba(9,14,26,.28))}
.hero.card .hbox{background:rgba(255,255,255,.94);backdrop-filter:blur(10px);border-radius:22px;padding:40px 40px 36px;box-shadow:0 24px 60px rgba(9,14,26,.25)}
.hero.lt::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,rgba(255,255,255,.96) 0%,rgba(255,255,255,.9) 46%,rgba(255,255,255,.5) 76%,rgba(255,255,255,.2) 100%)}
.hero-in{max-width:1080px;margin:0 auto;padding:72px 20px 64px}
.hbox{max-width:640px;position:relative;z-index:3}
.hero h1{font-size:34px;line-height:1.5;color:var(--pd);margin-bottom:16px;animation:heroTx .8s ease both}
.hero p{max-width:560px;color:var(--dim);margin-bottom:28px;animation:heroTx .8s ease .15s both}
.hero .cta{animation:heroTx .8s ease .3s both}
@keyframes heroTx{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.cta{display:flex;gap:12px;flex-wrap:wrap}
.btn{display:inline-block;padding:15px 30px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;transition:transform .15s ease,box-shadow .15s ease;border:none;cursor:pointer;font-family:inherit}
.btn:hover{transform:translateY(-2px)}
.btn-tel{background:var(--p);color:#fff;box-shadow:0 10px 26px color-mix(in srgb,var(--p) 45%,transparent)}
.btn-sub{background:#fff;color:var(--p);border:2px solid var(--p);box-shadow:0 8px 22px rgba(9,14,26,.12)}
.btn-line{background:#fff;color:var(--p);border:2px solid var(--p);padding:11px 22px;font-size:14px;border-radius:10px}
.btn-w{background:#fff;color:var(--pd)}
.btn-ghost{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.85)}
/* お知らせ */
.newsbar{max-width:1080px;margin:-24px auto 0;padding:0 20px;position:relative;z-index:5}
.newsbar .in{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 20px;box-shadow:0 6px 20px rgba(0,0,0,.06)}
.newsbar .nhead{font-size:12px;font-weight:700;color:var(--p);letter-spacing:.2em;margin-bottom:4px}
.newsbar .row{display:flex;gap:14px;font-size:14px;padding:4px 0}
.newsbar .date{color:var(--p);font-weight:700;white-space:nowrap}
/* セクション共通 */
section{max-width:1080px;margin:0 auto;padding:64px 20px}
section.wide{max-width:none;padding-left:0;padding-right:0}
section.wide .inn{max-width:1080px;margin:0 auto;padding:0 20px}
section.soft{background:var(--soft)}
h2{font-size:24px;color:var(--pd);text-align:center;margin-bottom:8px}
.h2sub{display:block;text-align:center;font-size:11px;letter-spacing:.3em;color:var(--ac);margin-bottom:32px;text-transform:uppercase}
.lead{max-width:720px;margin:0 auto 40px;text-align:center;color:var(--dim);font-size:15px}
.more{text-align:center;margin-top:30px}
/* スクロール連動リビール */
.rv{opacity:0;transform:translateY(26px);transition:opacity .7s ease,transform .7s ease}
.rv.in{opacity:1;transform:none}
/* カード */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.card{background:var(--soft);border-radius:14px;padding:26px;transition:transform .25s ease,box-shadow .25s ease,opacity .7s ease}
.card.wt{background:#fff}
.card:hover{transform:translateY(-6px);box-shadow:0 16px 34px rgba(9,14,26,.1)}
.card .ic{width:52px;height:52px;border-radius:14px;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:14px}
.card h3{color:var(--pd);font-size:17px;margin-bottom:8px}
.card p{font-size:14px;color:var(--dim)}
.strengths{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.strengths .s{background:#fff;border:1px solid var(--line);border-left:5px solid var(--p);border-radius:10px;padding:18px 20px;font-weight:600;font-size:15px}
/* 診療案内 詳細 */
.svc-list{display:grid;gap:18px}
.svc{display:grid;grid-template-columns:auto auto 1fr;gap:18px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px 26px;transition:transform .25s ease,box-shadow .25s ease,opacity .7s ease}
.svc:hover{transform:translateX(6px);box-shadow:0 12px 28px rgba(9,14,26,.08)}
.svc-no{font-size:26px;font-weight:800;color:var(--ac);opacity:.6;font-family:Georgia,serif}
.svc-ic{width:56px;height:56px;border-radius:50%;background:var(--soft);display:flex;align-items:center;justify-content:center;font-size:26px}
.svc h3{color:var(--pd);font-size:17px;margin-bottom:4px}
.svc p{font-size:14px;color:var(--dim)}
.sym{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:16px}
.sym .s{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 18px;font-weight:600;font-size:14px;color:var(--pd)}
/* 診療時間 */
.hours-wrap{overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px}
table.hours{width:100%;border-collapse:collapse;font-size:14px;min-width:560px}
.hours th,.hours td{border:1px solid var(--line);padding:10px 8px;text-align:center}
.hours th{background:var(--soft);color:var(--pd)}
.note{font-size:13px;color:var(--dim);margin-top:12px}
/* 流れ */
ol.flow{counter-reset:n;list-style:none;max-width:800px;margin:0 auto}
ol.flow li{position:relative;padding:14px 16px 14px 56px;background:#fff;border:1px solid var(--line);border-radius:10px;margin-bottom:10px;font-size:15px}
ol.flow li::before{counter-increment:n;content:counter(n);position:absolute;left:14px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;background:var(--p);color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;font-size:14px}
/* FAQ */
.faq{max-width:800px;margin:0 auto}
.faq details{background:#fff;border:1px solid var(--line);border-radius:12px;margin-bottom:12px;overflow:hidden}
.faq summary{display:flex;align-items:center;gap:12px;padding:16px 18px;cursor:pointer;font-weight:700;color:var(--pd);list-style:none;font-size:15px}
.faq summary::-webkit-details-marker{display:none}
.faq .q{flex:none;width:28px;height:28px;border-radius:50%;background:var(--p);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px}
.faq .a-q{background:var(--ac)}
.faq .ar{margin-left:auto;color:var(--ac);transition:transform .3s ease}
.faq details[open] .ar{transform:rotate(180deg)}
.faq .a{display:flex;gap:12px;padding:0 18px 16px;font-size:14px;color:var(--dim);animation:pgIn .35s ease both}
/* 院長・ティーザー */
.director{display:grid;grid-template-columns:200px 1fr;gap:28px;align-items:start;background:var(--soft);border-radius:16px;padding:32px}
.d-photo{width:200px;height:200px;border-radius:14px;overflow:hidden}
.d-photo img{width:100%;height:100%;object-fit:cover}
.director h3{color:var(--pd);margin-bottom:10px}
.nm{font-size:14px;color:var(--dim);margin-bottom:12px}
.teaser{display:grid;grid-template-columns:180px 1fr;gap:28px;align-items:center}
.tsr-img{width:180px;height:180px;border-radius:16px;object-fit:cover}
.tsr-txt{font-size:14px;color:var(--dim);margin-bottom:16px}
/* ギャラリー */
.gal{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
.gal.three{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.gal figure{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;transition:transform .25s ease,box-shadow .25s ease,opacity .7s ease}
.gal figure:hover{transform:translateY(-5px);box-shadow:0 14px 30px rgba(9,14,26,.1)}
.gal img{display:block;width:100%;height:220px;object-fit:cover}
.gal figcaption{padding:10px 14px;font-size:13px;color:var(--dim)}
/* アクセス */
.access-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}
.map-img{width:100%;border-radius:14px;border:1px solid var(--line)}
.acc-teaser{display:grid;grid-template-columns:320px 1fr;gap:24px;align-items:center;margin-top:24px}
.acc-teaser img{width:100%;border-radius:14px;border:1px solid var(--line)}
dl.info div{display:grid;grid-template-columns:96px 1fr;gap:10px;padding:12px 0;border-bottom:1px solid var(--line);font-size:15px}
dl.info dt{color:var(--pd);font-weight:700}
.tel-link{color:var(--p);font-weight:700;text-decoration:none}
/* CTAバンド・採用 */
.ctaband{background:linear-gradient(135deg,var(--pd),var(--p));border-radius:16px;color:#fff;text-align:center;padding:44px 24px}
.ctaband h3{font-size:20px;margin-bottom:8px}
.ctaband p{opacity:.9;margin-bottom:22px;font-size:14px}
.ctaband .cta{justify-content:center}
.recruit{background:linear-gradient(135deg,var(--pd),var(--p));border-radius:16px;color:#fff;text-align:center;padding:44px 24px}
.recruit h2{color:#fff}
.recruit p{opacity:.9;margin:10px 0 22px;font-size:15px}
.recruit a{background:#fff;color:var(--pd);padding:12px 30px;border-radius:10px;text-decoration:none;font-weight:700}
/* Web予約デモ */
.demo-note{background:#fef3c7;border:1px solid #f59e0b;border-radius:12px;padding:14px 18px;font-size:13px;color:#92400e;margin-bottom:24px}
.steps{display:flex;gap:8px;margin-bottom:24px}
.st{flex:1;text-align:center;font-size:13px;color:var(--dim);background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 4px;transition:all .3s ease}
.st span{display:flex;width:26px;height:26px;border-radius:50%;background:var(--line);color:#fff;font-weight:700;align-items:center;justify-content:center;margin:0 auto 4px;font-size:13px;transition:all .3s ease}
.st.on{border-color:var(--p);color:var(--pd);font-weight:700}
.st.on span{background:var(--p)}
.st.dn span{background:var(--ac)}
.rbox{background:#fff;border:1px solid var(--line);border-radius:16px;padding:26px;margin-bottom:20px;animation:pgIn .4s ease both}
.rbox.hid{display:none}
.rb-head{font-size:15px;margin-bottom:18px;color:var(--pd)}
.cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.cal-title{font-weight:700;color:var(--pd);font-size:17px}
.cal-nav{width:38px;height:38px;border-radius:10px;border:1px solid var(--line);background:#fff;font-size:18px;cursor:pointer;color:var(--pd)}
.cal-nav:disabled{opacity:.3;cursor:default}
table.cal{width:100%;border-collapse:collapse;table-layout:fixed}
.cal th{font-size:12px;color:var(--dim);padding:6px 0;font-weight:400}
.cal td{text-align:center;padding:3px}
.cal .day{width:100%;aspect-ratio:1.15;border:none;border-radius:10px;background:var(--soft);cursor:pointer;font-size:14px;font-weight:600;color:var(--pd);transition:transform .15s ease,background .15s ease;font-family:inherit}
.cal .day:hover{background:var(--p);color:#fff;transform:scale(1.06)}
.cal .day.off{background:#f3f4f6;color:#c3c8d0;cursor:default;font-weight:400}
.cal .day.off:hover{transform:none;background:#f3f4f6;color:#c3c8d0}
.cal .day.today{outline:2px solid var(--ac)}
.cal .day .cl{display:block;font-size:9px;color:#d16a6a;font-weight:400;line-height:1.1}
.slot-band{margin-bottom:16px}
.slot-band .bl{font-size:13px;font-weight:700;color:var(--pd);margin-bottom:8px}
.slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:8px}
.slot{padding:9px 4px;border-radius:9px;border:1px solid var(--line);background:#fff;font-size:13px;font-weight:600;color:var(--p);cursor:pointer;transition:all .15s ease;font-family:inherit}
.slot:hover{background:var(--p);color:#fff;transform:translateY(-2px)}
.slot.na{color:#c3c8d0;background:#f8f9fa;cursor:default}
.slot.na:hover{background:#f8f9fa;color:#c3c8d0;transform:none}
.fld{margin-bottom:16px}
.fld label{display:block;font-size:13px;font-weight:700;color:var(--pd);margin-bottom:6px}
.req{background:var(--p);color:#fff;font-size:10px;padding:2px 7px;border-radius:6px;margin-left:6px;font-weight:400}
.fld input,.fld select,.fld textarea{width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 13px;font-size:15px;font-family:inherit;background:#fff}
.fld input:focus,.fld select:focus,.fld textarea:focus{outline:2px solid var(--p);border-color:transparent}
.ferr{color:#dc2626;font-size:13px;margin-bottom:12px}
.ferr.hid{display:none}
.rbox.done{text-align:center;padding:48px 26px}
.done-ic{width:72px;height:72px;border-radius:50%;background:var(--p);color:#fff;font-size:36px;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;animation:pop .5s cubic-bezier(.2,1.6,.4,1) both}
@keyframes pop{from{transform:scale(0)}to{transform:scale(1)}}
.rbox.done h3{color:var(--pd);margin-bottom:8px}
/* フッター */
footer{background:#1f2937;color:#9ca3af;text-align:center;font-size:12px;padding:32px 20px 96px;margin-top:40px}
footer .fn{color:#fff;font-size:15px;font-weight:700;margin-bottom:6px}
.fnav{margin-top:14px;display:flex;justify-content:center;flex-wrap:wrap;gap:4px 0}
.fnav a{color:#9ca3af;font-size:12px}
.fnav a::after{background:#9ca3af}
/* モバイル固定バー */
.mobile-bar{display:none;position:fixed;bottom:0;left:0;right:0;z-index:100;background:#fff;border-top:1px solid var(--line);box-shadow:0 -4px 16px rgba(0,0,0,.08)}
.mobile-bar a{flex:1;text-align:center;padding:12px 4px 14px;font-size:12px;text-decoration:none;color:var(--pd);font-weight:700}
.mobile-bar a span{display:block;font-size:20px}
.mobile-bar a.tel{background:var(--p);color:#fff}
@media(max-width:760px){
  body{padding-top:32px}
  .demo-ribbon{font-size:10px;padding:7px 4px}
  header{top:32px}
  main{padding-top:66px}
  header nav{display:none}
  .tel-head{display:none}
  .menu-btn{display:flex}
  .hero.img .hero-in{padding:72px 20px 84px}
  .hero.ov::after{background:linear-gradient(180deg,rgba(9,14,26,.45) 0%,rgba(9,14,26,.62) 55%,rgba(9,14,26,.78) 100%)}
  .hero.lt::after{background:linear-gradient(180deg,rgba(255,255,255,.93) 0%,rgba(255,255,255,.9) 60%,rgba(255,255,255,.86) 100%)}
  .hero.card .hbox{padding:28px 24px 24px;border-radius:18px}
  .hero h1{font-size:25px}
  .hero-in{padding:48px 20px 56px}
  .phero{padding:38px 16px 32px}
  .phero h1{font-size:22px}
  section{padding:48px 16px}
  .logo{font-size:16px;gap:8px}
  .logo img{height:34px;max-width:110px}
  .gal img{height:180px}
  .director,.teaser{grid-template-columns:1fr;text-align:center}
  .d-photo,.tsr-img{margin:0 auto}
  .access-grid,.acc-teaser{grid-template-columns:1fr}
  .mobile-bar{display:flex}
  .steps{gap:5px}
  .st{font-size:11px}
}
@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none !important;transition:none !important}
  .rv{opacity:1;transform:none}
}
`;
}

function buildJs(): string {
  // 注意: この関数の返り値は <script> にそのまま埋め込まれる。バッククォート・テンプレートリテラル禁止
  return `
(function(){
  "use strict";
  var PAGES=["home","services","first","about","access","reserve"];
  var pageEls={};
  PAGES.forEach(function(k){pageEls[k]=document.querySelector('.page[data-pg="'+k+'"]');});

  // ---- スクロール連動リビール（IntersectionObserver非対応環境では即時表示） ----
  if(typeof IntersectionObserver==="function"){
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}});
    },{threshold:0.12,rootMargin:"0px 0px -40px 0px"});
    document.querySelectorAll(".rv").forEach(function(el){io.observe(el);});
  }else{
    document.querySelectorAll(".rv").forEach(function(el){el.classList.add("in");});
  }

  // ---- ルーター ----
  var drawer=document.getElementById("drawer");
  var menuBtn=document.getElementById("menu-btn");
  function route(){
    var h=(location.hash||"#/home").replace(/^#\\/?/,"");
    if(PAGES.indexOf(h)<0)h="home";
    PAGES.forEach(function(k){pageEls[k].classList.toggle("act",k===h);});
    document.querySelectorAll("[data-nav]").forEach(function(a){
      a.classList.toggle("on",a.getAttribute("data-nav")===h);
    });
    drawer.classList.remove("open");
    menuBtn.classList.remove("op");
    window.scrollTo(0,0);
    // 表示直後に見えているリビール要素はIntersectionObserverの再計算で自動発火する
  }
  window.addEventListener("hashchange",route);
  route();

  // ---- ヘッダー縮小 ----
  var hd=document.getElementById("hd");
  window.addEventListener("scroll",function(){
    hd.classList.toggle("sc",window.scrollY>10);
  },{passive:true});

  // ---- ドロワー ----
  menuBtn.addEventListener("click",function(){
    drawer.classList.toggle("open");
    menuBtn.classList.toggle("op");
  });

  // ==== Web予約デモ ====
  var HOURS=[];
  try{HOURS=JSON.parse(document.getElementById("hours-data").textContent);}catch(e){}
  var bands=[];
  for(var i=1;i<HOURS.length;i++){
    var row=HOURS[i];
    var m=String(row[0]).match(/(\\d{1,2}):(\\d{2})[^0-9]+(\\d{1,2}):(\\d{2})/);
    if(!m)continue;
    bands.push({label:row[0],s:(+m[1])*60+(+m[2]),e:(+m[3])*60+(+m[4]),marks:row.slice(1)});
  }
  function col(dt){var w=dt.getDay();return w===0?6:w-1;} // 月=0..土=5, 日祝=6
  function isClosed(dt){
    if(!bands.length)return false;
    var c=col(dt);
    return bands.every(function(b){return b.marks[c]!=="\\u25cf";});
  }
  function fmtMin(min){var h=Math.floor(min/60);var mm=min%60;return h+":"+(mm<10?"0":"")+mm;}
  function hsh(s){var h=7;for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))%997;}return h;}
  function ymd(dt){return dt.getFullYear()+"-"+(dt.getMonth()+1)+"-"+dt.getDate();}
  function jdate(dt){
    var W=["日","月","火","水","木","金","土"];
    return (dt.getMonth()+1)+"月"+dt.getDate()+"日（"+W[dt.getDay()]+"）";
  }

  var state={ym:null,date:null,time:null};
  var today=new Date();today.setHours(0,0,0,0);
  var minYm=new Date(today.getFullYear(),today.getMonth(),1);
  var maxYm=new Date(today.getFullYear(),today.getMonth()+2,1);
  state.ym=new Date(minYm);

  var calTitle=document.getElementById("cal-title");
  var calTable=document.getElementById("cal-table");
  var prevBtn=document.getElementById("cal-prev");
  var nextBtn=document.getElementById("cal-next");

  function renderCal(){
    var y=state.ym.getFullYear(),mo=state.ym.getMonth();
    calTitle.textContent=y+"年"+(mo+1)+"月";
    prevBtn.disabled=state.ym<=minYm;
    nextBtn.disabled=state.ym>=maxYm;
    var first=new Date(y,mo,1);
    var days=new Date(y,mo+1,0).getDate();
    var html="<tr>";
    ["日","月","火","水","木","金","土"].forEach(function(w){html+="<th>"+w+"</th>";});
    html+="</tr><tr>";
    for(var b=0;b<first.getDay();b++)html+="<td></td>";
    for(var dd=1;dd<=days;dd++){
      var dt=new Date(y,mo,dd);
      var closed=isClosed(dt);
      var past=dt<today;
      var cls="day"+((closed||past)?" off":"")+(dt.getTime()===today.getTime()?" today":"");
      html+='<td><button type="button" class="'+cls+'" data-d="'+ymd(dt)+'"'+((closed||past)?" disabled":"")+'>'+dd+(closed&&!past?'<span class="cl">休</span>':"")+"</button></td>";
      if(dt.getDay()===6&&dd<days)html+="</tr><tr>";
    }
    html+="</tr>";
    calTable.innerHTML=html;
    calTable.querySelectorAll(".day:not(.off)").forEach(function(btn){
      btn.addEventListener("click",function(){pickDate(btn.getAttribute("data-d"));});
    });
  }
  prevBtn.addEventListener("click",function(){state.ym=new Date(state.ym.getFullYear(),state.ym.getMonth()-1,1);renderCal();});
  nextBtn.addEventListener("click",function(){state.ym=new Date(state.ym.getFullYear(),state.ym.getMonth()+1,1);renderCal();});

  var steps=document.querySelectorAll(".st");
  function setStep(n){
    steps.forEach(function(s){
      var v=+s.getAttribute("data-st");
      s.classList.toggle("on",v===n);
      s.classList.toggle("dn",v<n);
    });
  }
  function show(id){
    ["r-step1","r-step2","r-step3","r-step4","r-done"].forEach(function(k){
      document.getElementById(k).classList.toggle("hid",k!==id);
    });
    var pg=document.querySelector('.page[data-pg="reserve"]');
    if(pg&&typeof pg.scrollIntoView==="function")pg.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function pickDate(dstr){
    var pp=dstr.split("-");
    state.date=new Date(+pp[0],+pp[1]-1,+pp[2]);
    state.time=null;
    document.getElementById("slot-date").textContent=jdate(state.date);
    var c=col(state.date);
    var html="";
    bands.forEach(function(b){
      if(b.marks[c]!=="\\u25cf")return;
      html+='<div class="slot-band"><div class="bl">'+b.label+"</div><div class=\\"slots\\">";
      for(var m=b.s;m+30<=b.e;m+=30){
        var tstr=fmtMin(m);
        var na=hsh(dstr+tstr)%4===0;
        html+='<button type="button" class="slot'+(na?" na":"")+'" data-t="'+tstr+'"'+(na?" disabled":"")+">"+(na?"× ":"○ ")+tstr+"</button>";
      }
      html+="</div></div>";
    });
    if(!html)html='<p class="note">この日は予約枠がありません（※仮）</p>';
    document.getElementById("slot-list").innerHTML=html;
    document.querySelectorAll("#slot-list .slot:not(.na)").forEach(function(btn){
      btn.addEventListener("click",function(){pickTime(btn.getAttribute("data-t"));});
    });
    setStep(2);show("r-step2");
  }

  function pickTime(tt){
    state.time=tt;
    document.getElementById("form-when").textContent=jdate(state.date)+" "+tt;
    setStep(3);show("r-step3");
  }

  document.getElementById("back1").addEventListener("click",function(){setStep(1);show("r-step1");});
  document.getElementById("back2").addEventListener("click",function(){setStep(2);show("r-step2");});
  document.getElementById("back3").addEventListener("click",function(){setStep(3);show("r-step3");});

  document.getElementById("to-confirm").addEventListener("click",function(){
    var nm=document.getElementById("f-name").value.trim();
    var tel=document.getElementById("f-tel").value.trim();
    var err=document.getElementById("f-err");
    if(!nm||!tel){err.classList.remove("hid");return;}
    err.classList.add("hid");
    var kind=document.getElementById("f-kind").value;
    var note=document.getElementById("f-note").value.trim();
    function esch(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
    var html="";
    html+="<div><dt>日時</dt><dd>"+jdate(state.date)+" "+state.time+"</dd></div>";
    html+="<div><dt>お名前</dt><dd>"+esch(nm)+"</dd></div>";
    html+="<div><dt>電話番号</dt><dd>"+esch(tel)+"</dd></div>";
    html+="<div><dt>区分</dt><dd>"+esch(kind)+"</dd></div>";
    if(note)html+="<div><dt>ご相談内容</dt><dd>"+esch(note)+"</dd></div>";
    document.getElementById("confirm-list").innerHTML=html;
    setStep(4);show("r-step4");
  });

  document.getElementById("do-reserve").addEventListener("click",function(){
    document.getElementById("done-when").textContent=jdate(state.date)+" "+state.time;
    setStep(4);show("r-done");
  });

  document.getElementById("r-reset").addEventListener("click",function(){
    state.date=null;state.time=null;
    document.getElementById("f-name").value="";
    document.getElementById("f-tel").value="";
    document.getElementById("f-note").value="";
    setStep(1);show("r-step1");
  });

  renderCal();
})();
`;
}
