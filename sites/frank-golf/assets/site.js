/* ============================================================
   FRANK GOLF — 共通スクリプト
   ・site-data.js の値を画面に流し込む（null → 「近日公開」）
   ・お知らせ／ナビ／スクロール演出／CTAのフォールバック
   ============================================================ */
(function () {
  "use strict";

  var D = window.FRANK || {};

  /* ---------- 値の取り出し（"store.address" / "price.plans.0.price"） ---------- */
  function pick(path) {
    return path.split(".").reduce(function (o, k) {
      return o && o[k] !== undefined ? o[k] : null;
    }, D);
  }

  function esc(t) {
    var d = document.createElement("div");
    d.textContent = String(t == null ? "" : t);
    return d.innerHTML;
  }

  /* ---------- 1) data-frank="キー" → 値を差し込む ----------
     値が null / "" の場合は「近日公開」を表示する。
     data-frank-fallback="文言" … 「近日公開」の代わりの文言
     data-frank-hide          … 未設定なら何も表示しない（重複表示の防止）   */
  function fillValues() {
    document.querySelectorAll("[data-frank]").forEach(function (el) {
      var v = pick(el.getAttribute("data-frank"));
      if (v === null || v === undefined || v === "") {
        if (el.hasAttribute("data-frank-hide")) {
          el.textContent = "";
          el.setAttribute("data-tbd", "true");
          return;
        }
        var fb = el.getAttribute("data-frank-fallback");
        el.innerHTML = fb
          ? '<span class="tbd">' + esc(fb) + "</span>"
          : '<span class="tbd">近日公開</span>';
        el.setAttribute("data-tbd", "true");
      } else if (Array.isArray(v)) {
        el.innerHTML = v
          .map(function (i) {
            return "<li>" + esc(i) + "</li>";
          })
          .join("");
        el.removeAttribute("data-tbd");
      } else {
        el.textContent = v;
        el.removeAttribute("data-tbd");
      }
    });
  }

  /* ---------- 2) 未確定セクションに「近日公開」バッジ ---------- */
  function markSections() {
    document.querySelectorAll("[data-frank-badge]").forEach(function (el) {
      var v = pick(el.getAttribute("data-frank-badge"));
      if (v === null || v === undefined || v === "") {
        var b = document.createElement("span");
        b.className = "tbd-badge";
        b.textContent = "近日公開";
        el.appendChild(document.createTextNode(" "));
        el.appendChild(b);
      }
    });
  }

  /* ---------- 3) リンク（未設定ならボタンを無効化 or 代替先へ） ---------- */
  function wireLinks() {
    var trial = pick("links.trialBooking");
    var line = pick("links.line");

    // 体験予約: trialBooking が未設定なら 公式LINE にフォールバック
    document.querySelectorAll("[data-cta='trial']").forEach(function (a) {
      if (trial) {
        a.href = trial;
        a.target = "_blank";
        a.rel = "noopener";
      } else if (line) {
        a.href = line;
        a.target = "_blank";
        a.rel = "noopener";
        a.setAttribute("title", "公式LINEから体験のご予約を承ります");
      } else {
        a.removeAttribute("href");
        a.classList.add("is-disabled");
        a.setAttribute("aria-disabled", "true");
        a.textContent = "体験予約（近日公開）";
      }
    });

    document.querySelectorAll("[data-cta='line']").forEach(function (a) {
      if (line) {
        a.href = line;
        a.target = "_blank";
        a.rel = "noopener";
      } else {
        a.removeAttribute("href");
        a.classList.add("is-disabled");
        a.setAttribute("aria-disabled", "true");
        a.textContent = "公式LINE（近日公開）";
      }
    });

    // 任意リンク: data-link="links.instagram"
    document.querySelectorAll("[data-link]").forEach(function (a) {
      var v = pick(a.getAttribute("data-link"));
      if (v) {
        a.href = v;
        if (/^https?:/.test(v)) {
          a.target = "_blank";
          a.rel = "noopener";
        }
      } else {
        a.removeAttribute("href");
        a.classList.add("is-disabled");
        a.setAttribute("aria-disabled", "true");
      }
    });

    // 電話
    var tel = pick("store.tel");
    document.querySelectorAll("[data-tel]").forEach(function (a) {
      if (tel) {
        a.href = "tel:" + tel.replace(/[^0-9+]/g, "");
        a.textContent = tel;
      } else {
        a.removeAttribute("href");
        a.innerHTML = '<span class="tbd">近日公開</span>';
      }
    });

    // 地図
    var embed = pick("store.mapEmbed");
    var frame = document.querySelector("[data-map]");
    if (frame && embed) {
      var f = document.createElement("iframe");
      f.src = embed;
      f.loading = "lazy";
      f.title = "FRANK GOLF アクセスマップ";
      f.style.cssText =
        "width:100%;height:100%;border:0;filter:grayscale(.5) contrast(1.1) brightness(.85);";
      f.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
      frame.innerHTML = "";
      frame.appendChild(f);
    }
  }

  /* ---------- 4) ナビ ---------- */
  function nav() {
    var el = document.querySelector(".nav");
    var burger = document.querySelector(".burger");
    var menu = document.querySelector(".nav__menu");

    if (el) {
      var onScroll = function () {
        el.classList.toggle("is-stuck", window.scrollY > 24);
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    if (burger && menu) {
      burger.addEventListener("click", function () {
        var open = burger.getAttribute("aria-expanded") === "true";
        burger.setAttribute("aria-expanded", String(!open));
        menu.classList.toggle("is-open", !open);
      });
      menu.addEventListener("click", function (e) {
        if (e.target.closest("a")) {
          burger.setAttribute("aria-expanded", "false");
          menu.classList.remove("is-open");
        }
      });
    }

    // 現在ページをハイライト
    var here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav__menu a[href]").forEach(function (a) {
      if (a.getAttribute("href") === here) a.setAttribute("aria-current", "page");
    });
  }

  /* ---------- 4.5) 画像（サンプル差し替え対応） ----------
     data-img="hero"       … その要素の background-image を images.hero に
     <img data-img-src="lounge"> … src を images.lounge に（未設定ならHTMLの初期srcを維持） */
  function media() {
    var imgs = pick("images") || {};
    document.querySelectorAll("[data-img]").forEach(function (el) {
      var key = el.getAttribute("data-img");
      var url = imgs[key];
      if (url) el.style.setProperty("--hero-img", 'url("' + url + '")');
    });
    document.querySelectorAll("img[data-img-src]").forEach(function (el) {
      var key = el.getAttribute("data-img-src");
      var url = imgs[key];
      if (url) el.setAttribute("src", url);
    });
  }

  /* ---------- 4.6) 体験申込フォーム ----------
     links.trialForm があれば fetch POST（Formspree互換）。
     無ければフォームを隠し、公式LINE案内（form-fallback）を表示する。 */
  function trialForm() {
    var form = document.querySelector("[data-trial-form]");
    if (!form) return;
    var fallback = document.querySelector("[data-form-fallback]");
    var endpoint = pick("links.trialForm");

    if (!endpoint) {
      form.setAttribute("hidden", "");
      if (fallback) fallback.removeAttribute("hidden");
      return;
    }

    form.setAttribute("action", endpoint);
    form.setAttribute("method", "POST");
    var status = form.querySelector("[data-form-status]");
    var btn = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", function (e) {
      // ネイティブ検証
      if (!form.checkValidity()) return;  // ブラウザ標準のエラー表示に任せる
      e.preventDefault();
      if (status) { status.textContent = "送信中..."; status.className = "form__status"; }
      if (btn) btn.disabled = true;

      fetch(endpoint, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      })
        .then(function (r) {
          if (r.ok) {
            form.reset();
            if (status) { status.textContent = "送信しました。折り返しご連絡いたします。"; status.className = "form__status is-ok"; }
          } else {
            throw new Error("bad status");
          }
        })
        .catch(function () {
          var line = pick("links.line");
          if (status) {
            status.className = "form__status is-err";
            status.textContent = line
              ? "送信に失敗しました。お手数ですが公式LINEからご連絡ください。"
              : "送信に失敗しました。時間をおいて再度お試しください。";
          }
        })
        .then(function () { if (btn) btn.disabled = false; });
    });
  }

    /* ---------- 5) お知らせ ----------
     news が0件なら、セクションごと非表示（空の見出しを出さない） */
  function news() {
    var list = document.querySelector("[data-news]");
    var sec = document.querySelector("[data-news-section]");
    if (!list) return;

    var items = pick("news") || [];
    if (!items.length) {
      if (sec) sec.hidden = true;
      return;
    }
    if (sec) sec.hidden = false;

    var fmt = function (s) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
      return m ? m[1] + "." + m[2] + "." + m[3] : esc(s);
    };

    list.innerHTML = items
      .map(function (n) {
        var inner =
          '<span class="news__d">' + fmt(n.date) + "</span>" +
          '<span class="news__tag">' + esc(n.tag || "\u304a\u77e5\u3089\u305b") + "</span>" +
          '<span class="news__t">' + esc(n.title) + "</span>";
        return n.url
          ? '<li><a href="' + esc(n.url) + '">' + inner + "</a></li>"
          : '<li><div class="news__row">' + inner + "</div></li>";
      })
      .join("");
  }

  /* ---------- 6) スクロール演出 ---------- */
  function reveal() {
    var items = document.querySelectorAll(".rv");
    if (!items.length) return;
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (i) { i.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    items.forEach(function (i, n) {
      i.style.transitionDelay = Math.min(n % 4, 3) * 90 + "ms";
      io.observe(i);
    });
  }

  /* ---------- 7) \u30d7\u30ec\u30aa\u30fc\u30d7\u30f3\u544a\u77e5 ---------- */
  function notice() {
    var d = pick("preopen.date");
    document.querySelectorAll("[data-preopen]").forEach(function (el) {
      el.textContent = d || "";
    });
  }

  function init() {
    fillValues();
    markSections();
    wireLinks();
    nav();
    media();
    trialForm();
    news();
    reveal();
    notice();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
