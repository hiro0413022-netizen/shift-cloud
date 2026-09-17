/* KALLINOS × HP管理（#249）
   ・HP管理（https://yozan-hp-admin.vercel.app）で入れた写真・ブログ・Instagram を公開RPCから取得して反映
   ・閲覧数の計測（Cookie なし・端末ごとの乱数ID）
   取得に失敗しても HTML に書いてある写真のまま表示される（落ちない設計）。
   枠: <img data-hp-img="key"> / <div data-hp-bg="key">（背景画像）
   Instagram: [data-hp-ig]（0件なら仮の写真グリッドを隠す）
   お知らせ: [data-hp-news-section] [data-hp-news]（トップ）・news.html（一覧と ?slug= の記事） */
(function () {
  "use strict";
  var SB = "https://qrgpblnnhdudigarrtuz.supabase.co";
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZ3BibG5uaGR1ZGlnYXJydHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjQ1MzMsImV4cCI6MjA5ODU0MDUzM30.rOSGad36v_RoeBAbzSwCoi0imIc4zRwZ7Ub88EAHSCw";
  var SITE = "kallinos";
  var ORIGIN = "https://www.kallinos.jp/";

  function rpc(name, args, keep) {
    return fetch(SB + "/rest/v1/rpc/" + name, {
      method: "POST",
      keepalive: !!keep,
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    }).then(function (r) { return r.ok ? r.json() : null; });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function rel(u) { return String(u || "").indexOf(ORIGIN) === 0 ? u.slice(ORIGIN.length) : u; }
  function qs(name) { try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } }
  function jstDate(iso) {
    try {
      var p = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
      var g = function (t) { for (var i = 0; i < p.length; i++) if (p[i].type === t) return p[i].value; return ""; };
      return g("year") + "-" + g("month") + "-" + g("day");
    } catch (e) { return String(iso || "").slice(0, 10); }
  }
  function dot(d) { return String(d || "").replace(/-/g, "."); }

  /* ---------- ブログ本文の書式（HP管理と同じ規則。apps/hp-admin/src/lib/body.ts と揃える） ---------- */
  function safeUrl(u) { u = String(u || "").trim(); return /^(https?:\/\/|\/|mailto:|tel:)/i.test(u) ? u : "#"; }
  function inline(s) {
    var out = esc(s);
    out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_m, text, url) {
      var href = safeUrl(url.replace(/&amp;/g, "&"));
      var ext = /^https?:/i.test(href);
      return '<a href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" + text + "</a>";
    });
    return out;
  }
  function renderBody(src) {
    var lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
    var html = [], para = [], list = [];
    function fp() { if (para.length) html.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; }
    function fl() { if (list.length) html.push("<ul>" + list.map(function (l) { return "<li>" + inline(l) + "</li>"; }).join("") + "</ul>"); list = []; }
    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, "");
      var img = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (!line.trim()) { fp(); fl(); }
      else if (line.indexOf("### ") === 0) { fp(); fl(); html.push("<h3>" + inline(line.slice(4)) + "</h3>"); }
      else if (line.indexOf("## ") === 0) { fp(); fl(); html.push("<h2>" + inline(line.slice(3)) + "</h2>"); }
      else if (/^[-・]\s?/.test(line) && line.indexOf("--") !== 0) { fp(); list.push(line.replace(/^[-・]\s?/, "")); }
      else if (img) {
        fp(); fl();
        html.push('<figure class="hp-fig"><img src="' + esc(safeUrl(img[2])) + '" alt="' + esc(img[1]) + '" loading="lazy">' +
          (img[1] ? "<figcaption>" + esc(img[1]) + "</figcaption>" : "") + "</figure>");
      }
      else { fl(); para.push(line); }
    });
    fp(); fl();
    return html.join("\n");
  }

  /* ---------- 計測 ---------- */
  function rid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function stored(kind, key) {
    try {
      var st = kind === "local" ? window.localStorage : window.sessionStorage;
      var v = st.getItem(key);
      if (!v) { v = rid(); st.setItem(key, v); }
      return v;
    } catch (e) { return rid(); }
  }
  function track(path) {
    try {
      if (navigator.webdriver || /^(localhost|127\.)/.test(location.hostname) || location.protocol === "file:") return;
      if (qs("preview") !== null) return;
      rpc("hp_track", {
        p_site: SITE,
        p_path: path,
        p_referrer: document.referrer || "",
        p_src: qs("src") || qs("utm_source"),
        p_visitor: stored("local", "hp_vid"),
        p_session: stored("session", "hp_sid"),
        p_title: document.title,
        p_device: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop"
      }, true).catch(function () {});
    } catch (e) { /* noop */ }
  }

  /* ---------- 写真の枠 ---------- */
  function applySlots(s) {
    document.querySelectorAll("img[data-hp-img]").forEach(function (el) {
      var v = s["img." + el.getAttribute("data-hp-img")];
      if (v && el.getAttribute("src") !== v) el.setAttribute("src", v);
    });
    document.querySelectorAll("[data-hp-bg]").forEach(function (el) {
      var v = s["img." + el.getAttribute("data-hp-bg")];
      if (v) el.style.backgroundImage = 'url("' + String(v).replace(/"/g, "%22") + '")';
    });
    var ig = s["site.instagram_url"];
    if (ig) document.querySelectorAll("[data-hp-ig-follow]").forEach(function (a) { a.setAttribute("href", ig); });
  }

  /* ---------- Instagram ---------- */
  function instagram(items) {
    var box = document.querySelector("[data-hp-ig]");
    if (!box) return;
    if (!items || !items.length) { box.style.display = "none"; return; }
    box.classList.add("hp-ig");
    box.innerHTML = items.slice(0, 6).map(function (i) {
      return '<div class="hp-ig__item"><blockquote class="instagram-media" data-instgrm-permalink="' + esc(i.permalink) +
        '" data-instgrm-version="14"><a href="' + esc(i.permalink) + '" target="_blank" rel="noopener">Instagramで見る</a></blockquote></div>';
    }).join("");
    box.style.display = "";
    if (window.instgrm) { window.instgrm.Embeds.process(); return; }
    var sc = document.createElement("script");
    sc.async = true;
    sc.src = "https://www.instagram.com/embed.js";
    document.body.appendChild(sc);
  }

  /* ---------- お知らせ ---------- */
  function card(p) {
    var d = jstDate(p.published_at);
    return '<a class="hp-card" href="news.html?slug=' + encodeURIComponent(p.slug) + '">' +
      '<div class="hp-card__img">' + (p.cover_url ? '<img src="' + esc(p.cover_url) + '" alt="" loading="lazy">' : "") + "</div>" +
      '<div class="hp-card__body"><p class="hp-card__meta"><time datetime="' + d + '">' + dot(d) + "</time><span>" + esc(p.category) + "</span></p>" +
      '<h3 class="hp-card__t">' + esc(p.title) + "</h3>" +
      (p.excerpt ? '<p class="hp-card__x">' + esc(p.excerpt) + "</p>" : "") + "</div></a>";
  }
  function news(posts) {
    var sec = document.querySelector("[data-hp-news-section]");
    var box = document.querySelector("[data-hp-news]");
    if (box && sec) {
      if (!posts || !posts.length) sec.hidden = true;
      else { box.innerHTML = posts.slice(0, 3).map(card).join(""); sec.hidden = false; }
    }
    var list = document.querySelector("[data-hp-news-list]");
    if (list) {
      list.innerHTML = posts && posts.length ? posts.map(card).join("")
        : '<p style="text-align:center;color:var(--color-grey-4);padding:3rem 0">まだお知らせはありません。</p>';
    }
  }
  function article(slug) {
    var art = document.querySelector("[data-hp-article]");
    var idx = document.querySelector("[data-hp-news-index]");
    if (!art) return;
    if (idx) idx.hidden = true;
    art.hidden = false;
    art.innerHTML = '<p style="text-align:center;padding:3rem 0">読み込み中…</p>';
    rpc("hp_public_post", { p_site: SITE, p_slug: slug }).then(function (p) {
      if (!p) { art.innerHTML = '<p style="text-align:center;padding:3rem 0">記事が見つかりませんでした。<br><a href="news.html">一覧へ</a></p>'; return; }
      var d = jstDate(p.published_at);
      document.title = p.title + " | KALLINOS";
      if (p.excerpt) setMeta("description", p.excerpt);
      art.innerHTML =
        '<p class="hp-article__crumb"><a href="index.html">HOME</a> / <a href="news.html">NEWS</a></p>' +
        '<p class="hp-card__meta"><time datetime="' + d + '">' + dot(d) + "</time><span>" + esc(p.category) + "</span></p>" +
        '<h1 class="hp-article__t">' + esc(p.title) + "</h1>" +
        (p.cover_url ? '<img class="hp-article__cover" src="' + esc(p.cover_url) + '" alt="">' : "") +
        '<div class="hp-body">' + renderBody(p.body) + "</div>" +
        '<p style="margin-top:3rem"><a class="btn btn-secondary" href="news.html">← 一覧へ戻る</a></p>';
    }).catch(function () {
      art.innerHTML = '<p style="text-align:center;padding:3rem 0">読み込めませんでした。時間をおいて開き直してください。</p>';
    });
  }
  function setMeta(name, content) {
    var m = document.querySelector('meta[name="' + name + '"]');
    if (m) m.setAttribute("content", content);
  }

  /* ---------- 本体 ---------- */
  var slug = qs("slug");
  var isNews = !!document.querySelector("[data-hp-article]");
  track(isNews && slug ? "/blog/" + slug : (location.pathname || "/"));
  if (isNews && slug) article(slug);

  rpc("hp_public_site", { p_site: SITE }).then(function (j) {
    if (!j) return;
    var run = function () {
      applySlots(j.slots || {});
      instagram(j.instagram);
      news(j.posts || []);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
  }).catch(function () {});
})();
