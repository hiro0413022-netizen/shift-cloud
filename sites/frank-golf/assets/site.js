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

  /* ---------- 税込価格の自動併記（data-tax） ----------
     site-data.js の金額はすべて【税抜】で登録します。
     data-tax を付けた要素では「9,800円」→「9,800円（税込 10,780円）」のように
     税込価格を小さく併記します。消費税率を変えるときは TAX_RATE だけ直せばOK。 */
  var TAX_RATE = 0.10;

  function yen(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function taxTag(v) {
    return '<small class="tax">（税込 ' + yen(Math.round(v * (1 + TAX_RATE))) + "円）</small>";
  }

  function withTax(text) {
    var html = esc(text);
    var re = /([0-9][0-9,]*)円/g;
    var nums = [], m;
    while ((m = re.exec(html))) {
      var v = parseInt(String(m[1]).replace(/,/g, ""), 10);
      if (v) nums.push(v);
    }
    if (nums.length === 0) return html;
    // 金額が1つだけなら文末にまとめて（例「9,800円 / 月（税込 10,780円）」）
    if (nums.length === 1) return html + taxTag(nums[0]);
    // 複数あるときは各金額の直後に
    return html.replace(/([0-9][0-9,]*)円/g, function (mm, num) {
      var n = parseInt(String(num).replace(/,/g, ""), 10);
      return n ? mm + taxTag(n) : mm;
    });
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
      } else if (el.hasAttribute("data-tax")) {
        el.innerHTML = withTax(v);
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
        // サイト内のページ（trial-booking.html）は同じタブで開く。
        // 別タブにすると戻る導線が無くなり、予約途中の離脱が増えるため。
        if (/^https?:/.test(trial)) {
          a.target = "_blank";
          a.rel = "noopener";
        } else {
          a.removeAttribute("target");
          a.removeAttribute("rel");
        }
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

    // フッターのLINE帯は、公式LINEが開設されるまで出さない
    document.querySelectorAll("[data-line-band]").forEach(function (el) {
      el.hidden = !line;
    });

    document.querySelectorAll("[data-cta='line']").forEach(function (a) {
      if (line) {
        a.href = line;
        a.target = "_blank";
        a.rel = "noopener";
        a.hidden = false;
      } else {
        // 公式LINE未開設のあいだは、押せないグレーのボタンを出さずに丸ごと隠す。
        // CTAを「体験予約」1本に絞って迷いをなくすため（2026-07-27）。
        a.hidden = true;
        a.setAttribute("aria-hidden", "true");
        a.tabIndex = -1;
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

    // ヘッダーの電話ブロックは、番号が決まるまで出さない（「近日公開」が並ぶと窮屈なため）
    document.querySelectorAll(".nav__tel").forEach(function (el) {
      el.hidden = !tel;
    });

    // 地図
    var embed = pick("store.mapEmbed");
    if (embed) {
      // ページ内に複数あっても全部に入れる（querySelector だと1つ目だけになる）
      document.querySelectorAll("[data-map]").forEach(function (frame) {
        var f = document.createElement("iframe");
        f.src = embed;
        f.loading = "lazy";
        f.title = "FRANK GOLF アクセスマップ";
        f.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
        f.setAttribute("allowfullscreen", "");
        frame.innerHTML = "";
        frame.appendChild(f);
        // プレースホルダ用の中央寄せを解除する（残すと iframe の高さが潰れる）
        frame.classList.add("is-live");
      });
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
      if (!url) return;
      // ★ CSS変数経由で url() を渡すと、相対パスが style.css(=assets/) 基準で
      //    解決されて assets/assets/... になり画像が出ない（既存バグ・2026-07-27修正）。
      //    インラインの background-image は文書基準で解決されるので、こちらで指定する。
      el.style.setProperty("--hero-img", 'url("' + url + '")');
      el.style.backgroundImage = 'url("' + url + '")';
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
  var revealIo = null;
  function reveal() {
    // init() が複数回呼ばれても、同じ要素を二度 observe しない（data-rv で印をつける）
    var items = Array.prototype.filter.call(
      document.querySelectorAll(".rv"),
      function (i) { return !i.hasAttribute("data-rv"); }
    );
    if (!items.length) return;
    items.forEach(function (i) { i.setAttribute("data-rv", "1"); });
    if (!("IntersectionObserver" in window)) {
      items.forEach(function (i) { i.classList.add("is-in"); });
      return;
    }
    var io = revealIo || (revealIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            revealIo.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    ));
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


  /* ---------- 8) スマホ固定CTAバー ----------
     ヒーローを少しスクロールしたら下から出す。
     体験予約は最短1タップで届く位置に常時置く（体験導線の主動線）。 */
  function stickyCta() {
    var bar = document.querySelector("[data-sticky-cta]");
    if (!bar) return;
    // 予約ページ自身では出さない（入力欄・確定ボタンを覆ってしまう）
    if (document.body.getAttribute("data-page") === "trial-booking") { bar.remove(); return; }

    // 中身の値（体験料・所要時間）を流し込む
    var fee = pick("trial.fee");
    var dur = pick("trial.duration");
    var sub = bar.querySelector("[data-sticky-sub]");
    if (sub) {
      var parts = [];
      if (pick("price.trialFee")) parts.push("通常 3,300円 税込");
      if (dur) parts.push(dur);
      sub.textContent = parts.join(" ／ ");
    }
    var main = bar.querySelector("[data-sticky-main]");
    if (main && fee) main.textContent = "体験レッスン " + fee;

    bar.hidden = false;

    var show = false;
    var onScroll = function () {
      var y = window.pageYOffset || document.documentElement.scrollTop;
      var next = y > 320;
      if (next !== show) {
        show = next;
        bar.classList.toggle("is-on", show);
        document.body.classList.toggle("has-sticky-cta", show);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }


  /* ---------- 9) 体験当日の流れ（trial.steps） ---------- */
  function trialSteps() {
    var box = document.querySelector("[data-trial-steps]");
    if (!box) return;
    var items = pick("trial.steps") || [];
    if (!items.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = items
      .map(function (st, i) {
        var no = "STEP " + ("0" + (i + 1)).slice(-2);
        var min = st.m ? ' <span style="color:var(--dim);font-size:12px">（' + esc(st.m) + "）</span>" : "";
        return (
          '<div class="flow__i">' +
          '<p class="flow__n">' + no + "</p>" +
          "<div>" +
          '<h3 class="flow__t">' + esc(st.t) + min + "</h3>" +
          '<p class="flow__b">' + esc(st.b || "") + "</p>" +
          "</div></div>"
        );
      })
      .join("");
  }

  /* init() は2回走る（DOMContentLoaded で1回 → cms.js が CMS を取得したあと
     FRANK_RENDER() でもう1回）。addEventListener を含む処理を毎回呼ぶと
     ハンドラが二重登録され、バーガーメニューが「開く→即閉じる」で無反応に見える。
     体験フォームも2回POSTされる。よってイベント登録は初回だけに限定する。 */
  var wired = false;

  function init() {
    fillValues();
    markSections();
    wireLinks();
    media();
    news();
    notice();
    trialSteps();
    reveal();         // 要素ごとに二重登録を防ぐ（後から増えた .rv も拾う）

    if (!wired) {
      wired = true;
      nav();          // burger の click / scroll
      trialForm();    // form の submit
      stickyCta();    // scroll
    }
  }

  window.FRANK_RENDER = init;  /* CMS(cms.js)がマージ後に再描画するため公開 (#85) */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();


/* ============================================================
   流入元（?src= / ?utm_source=）の記憶
   広告・SNS・チラシQRのURLに ?src=gads などを付けると、
   どのページに着地しても sessionStorage に保持され、
   体験予約の確定時に申込へ記録される（効果測定用）。
   ============================================================ */
(function () {
  try {
    var q = new URLSearchParams(location.search);
    var s = q.get("src") || q.get("utm_source");
    if (s && /^[A-Za-z0-9_-]{1,32}$/.test(s)) sessionStorage.setItem("frank_src", s);
  } catch (e) { /* プライベートモード等で storage 不可でも動作継続 */ }
})();
