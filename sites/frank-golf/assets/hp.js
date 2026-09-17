/* FRANK GOLF × HP管理（#249）
   ・HP管理（https://yozan-hp-admin.vercel.app）で入れた写真・ブログ・Instagram を公開RPCから取得して反映
   ・閲覧数の計測（Cookie なし・端末ごとの乱数ID）
   取得に失敗しても site-data.js の値のまま表示される（落ちない設計）。
   site.js より前に読み込む。反映は window.FRANK を書き換えて FRANK_RENDER() で再描画。 */
(function () {
  "use strict";
  var SB = "https://qrgpblnnhdudigarrtuz.supabase.co";
  var KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZ3BibG5uaGR1ZGlnYXJydHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjQ1MzMsImV4cCI6MjA5ODU0MDUzM30.rOSGad36v_RoeBAbzSwCoi0imIc4zRwZ7Ub88EAHSCw";
  var SITE = "frank-golf";
  var ORIGIN = "https://frankgolf.jp/";

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

  /* ---------- Instagram ---------- */
  function instagram(items) {
    var sec = document.querySelector("[data-hp-ig-section]");
    var box = document.querySelector("[data-hp-ig]");
    if (!sec || !box) return;
    if (!items || !items.length) { sec.hidden = true; return; }
    box.innerHTML = items.slice(0, 6).map(function (i) {
      return '<div class="hp-ig__item"><blockquote class="instagram-media" data-instgrm-permalink="' + esc(i.permalink) +
        '" data-instgrm-version="14"><a href="' + esc(i.permalink) + '" target="_blank" rel="noopener">Instagramで見る</a></blockquote></div>';
    }).join("");
    sec.hidden = false;
    if (window.instgrm) { window.instgrm.Embeds.process(); return; }
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.instagram.com/embed.js";
    document.body.appendChild(s);
  }

  /* ---------- ブログ（blog.html） ---------- */
  function blogList(posts) {
    var box = document.querySelector("[data-hp-blog-list]");
    if (!box) return;
    if (!posts || !posts.length) { box.innerHTML = '<p class="center" style="color:var(--txt-mute,#777)">まだ記事はありません。</p>'; return; }
    box.innerHTML = posts.map(function (p) {
      var d = jstDate(p.published_at);
      return '<a class="card column-card" href="blog.html?slug=' + encodeURIComponent(p.slug) + '">' +
        (p.cover_url ? '<img src="' + esc(p.cover_url) + '" alt="" width="800" height="450" loading="lazy">' : "") +
        '<p class="column-card__date"><time datetime="' + d + '">' + dot(d) + "</time>　" + esc(p.category) + "</p>" +
        '<h2 class="column-card__t">' + esc(p.title) + "</h2>" +
        (p.excerpt ? '<p class="card__b">' + esc(p.excerpt) + "</p>" : "") + "</a>";
    }).join("");
  }
  function setMeta(name, content) {
    var m = document.querySelector('meta[name="' + name + '"]');
    if (m) m.setAttribute("content", content);
  }
  function blogArticle(slug) {
    var art = document.querySelector("[data-hp-blog-article]");
    var list = document.querySelector("[data-hp-blog-index]");
    if (!art) return;
    if (list) list.hidden = true;
    art.hidden = false;
    art.innerHTML = '<p class="center" style="padding:40px 0">読み込み中…</p>';
    rpc("hp_public_post", { p_site: SITE, p_slug: slug }).then(function (p) {
      if (!p) {
        art.innerHTML = '<p class="center" style="padding:40px 0">記事が見つかりませんでした。<br><a href="blog.html">記事の一覧へ</a></p>';
        return;
      }
      var d = jstDate(p.published_at);
      document.title = p.title + "｜FRANK GOLF 姫路";
      if (p.excerpt) setMeta("description", p.excerpt);
      var can = document.querySelector('link[rel="canonical"]');
      if (can) can.setAttribute("href", ORIGIN + "blog.html?slug=" + encodeURIComponent(p.slug));
      art.innerHTML =
        '<p class="crumb"><a href="/">HOME</a><span>/</span><a href="blog.html">お知らせ・ブログ</a></p>' +
        '<h1 class="article__t">' + esc(p.title) + "</h1>" +
        '<p class="article__meta"><time datetime="' + d + '">' + dot(d) + "</time> ／ " + esc(p.category) +
        (p.author_name ? " ／ " + esc(p.author_name) : "") + "</p>" +
        (p.cover_url ? '<figure class="article__hero" style="margin-top:24px"><img src="' + esc(p.cover_url) + '" alt="" width="1600" height="900"></figure>' : "") +
        '<div class="hp-body">' + renderBody(p.body) + "</div>" +
        '<p style="margin-top:40px"><a class="btn btn--ghost" href="blog.html">記事の一覧へ</a></p>';
      var ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.textContent = JSON.stringify({
        "@context": "https://schema.org", "@type": "BlogPosting", headline: p.title,
        datePublished: p.published_at, dateModified: p.updated_at, image: p.cover_url || undefined,
        author: { "@type": "Organization", name: "FRANK GOLF" },
        mainEntityOfPage: ORIGIN + "blog.html?slug=" + encodeURIComponent(p.slug)
      });
      document.head.appendChild(ld);
    }).catch(function () {
      art.innerHTML = '<p class="center" style="padding:40px 0">読み込めませんでした。時間をおいて開き直してください。</p>';
    });
  }

  /* ---------- 本体 ---------- */
  var slug = qs("slug");
  var isBlog = !!document.querySelector("[data-hp-blog-article]");
  track(isBlog && slug ? "/blog/" + slug : (location.pathname || "/"));
  if (isBlog && slug) blogArticle(slug);

  rpc("hp_public_site", { p_site: SITE }).then(function (j) {
    if (!j) return;
    var F = window.FRANK;
    if (F) {
      var s = j.slots || {};
      F.images = F.images || {};
      Object.keys(s).forEach(function (k) {
        if (k.indexOf("img.") === 0 && s[k]) F.images[k.slice(4)] = rel(s[k]);
      });
      if (!F.__baseNews) F.__baseNews = (F.news || []).slice();
      var posts = (j.posts || []).map(function (p) {
        return { date: jstDate(p.published_at), tag: p.category, title: p.title, url: "blog.html?slug=" + encodeURIComponent(p.slug) };
      });
      F.news = posts.concat(F.__baseNews).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }).slice(0, 8);
    }
    var run = function () {
      instagram(j.instagram);
      blogList(j.posts);
      if (typeof window.FRANK_RENDER === "function") window.FRANK_RENDER();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
  }).catch(function () {});
})();
