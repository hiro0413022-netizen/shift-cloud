# -*- coding: utf-8 -*-
"""
FRANK GOLF 公式サイト ビルドスクリプト
------------------------------------------------------------
共通のヘッダー／フッター／告知バーを1か所で管理し、
静的HTML（12ページ）を出力します。

  実行:  python _build.py

※ 出力される .html は普通の静的HTMLです。
   軽微な文言修正は .html を直接編集しても構いませんが、
   ヘッダー等の共通部分を直すときは本ファイルを編集して再実行してください。
※ 料金・住所などの可変データは assets/site-data.js を編集してください（再実行不要）。
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

BRAND = "FRANK GOLF"
PREOPEN = "2026年9月2日"

# ★公開ドメインが決まったらここに入れて再ビルドしてください（例: "https://frank-golf.jp"）。
#   空のままだと og:image が相対パスになり、**公式LINE・SNSで共有しても画像が出ません**。
#   （LINE/X/Facebook のクローラは og:image に絶対URLを要求します）
SITE_URL = "https://frankgolf.jp"


def abs_url(path):
    return f"{SITE_URL.rstrip('/')}/{path}" if SITE_URL else path


PAGE_FILE = {
    "home": "index.html", "concept": "concept.html", "facility": "facility.html",
    "lesson": "lesson.html", "lounge": "lounge.html", "community": "community.html",
    "plan": "plan.html", "beginner": "beginner.html", "corporate": "corporate.html",
    "access": "access.html", "faq": "faq.html", "trial": "trial.html",
    "tokushoho": "tokushoho.html", "privacy": "privacy.html", "terms": "terms.html", "404": "404.html",
}


def page_file(page):
    return PAGE_FILE.get(page, "index.html")


PAGE_LABEL = {
    "concept": "コンセプト", "facility": "施設・設備", "lesson": "レッスン",
    "lounge": "バー・ラウンジ", "community": "コミュニティ", "plan": "料金・会員プラン",
    "beginner": "はじめての方へ", "corporate": "法人でのご利用", "access": "アクセス",
    "faq": "よくあるご質問", "trial": "体験のご予約",
    "tokushoho": "特定商取引法に基づく表記", "privacy": "プライバシーポリシー", "terms": "会員規約",
}


# ------------------------------------------------------------------
# 構造化データ（JSON-LD）
# ------------------------------------------------------------------
# 対応エリア（MEO: 近隣自治体を明示。土山は姫路市南東部）
AREA_SERVED = ["姫路市", "たつの市", "太子町", "揖保郡", "高砂市", "加古川市"]


def jsonld_business():
    """LocalBusiness（MEO）。住所・電話・営業時間・料金が未確定なので、確定した事実のみ載せる。
    嘘の構造化データはGoogleのペナルティ対象になるため、null項目は出力しない。
    site-data.js 確定後は、下の TODO 箇所に telephone / openingHours / geo / priceRange を追記。"""
    import json
    d = {
        "@context": "https://schema.org",
        "@type": "GolfCourse",
        "additionalType": "SportsActivityLocation",
        "name": "FRANK GOLF",
        "alternateName": ["フランクゴルフ", "FRANK GOLF 姫路"],
        "description": "姫路・土山の会員制インドアゴルフラウンジ。練習打席・プロによるレッスン・"
                       "シミュレーターでのデータ分析・バーラウンジでの交流がひとつになった大人のためのゴルフ基地。"
                       "2026年9月2日プレオープン。",
        "slogan": "打って、教わって、語れる。姫路・土山のフランクなゴルフ基地。",
        "knowsAbout": ["インドアゴルフ", "ゴルフレッスン", "ゴルフシミュレーター", "スイング分析", "ゴルフバー"],
        "address": {
            "@type": "PostalAddress",
            "streetAddress": "土山6-6-1",
            "addressRegion": "兵庫県",
            "addressLocality": "姫路市",
            "addressCountry": "JP",
        },
        "employee": {
            "@type": "Person",
            "name": "藤田 晃規",
            "jobTitle": "ゴルフコーチ / ツアープロ",
            "sameAs": "https://www.jgto.org/player/15674/profile",
        },
        "areaServed": [{"@type": "City", "name": n} for n in AREA_SERVED],
        "parentOrganization": {"@type": "Organization", "name": "株式会社YOZAN"},
        "openingHoursSpecification": [
            {"@type": "OpeningHoursSpecification",
             "dayOfWeek": ["Monday", "Wednesday", "Thursday", "Friday"],
             "opens": "11:00", "closes": "22:00"},
            {"@type": "OpeningHoursSpecification",
             "dayOfWeek": ["Saturday", "Sunday"],
             "opens": "09:00", "closes": "20:00"},
        ],
        "priceRange": "¥¥",
        "amenityFeature": [
            {"@type": "LocationFeatureSpecification", "name": "駐車場20台（無料）", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "バーカウンター併設", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "ゴルフシミュレーター（全4打席）", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "レフティ左右打席対応", "value": True},
        ],
        # TODO(確定後): "telephone", "geo"{lat,lng}, "sameAs"[SNS], "image"[実写]。定休日=毎週火曜。
    }
    if SITE_URL:
        d["url"] = SITE_URL
        d["image"] = abs_url("assets/ogp.png")
    return json.dumps(d, ensure_ascii=False, separators=(",", ":"))


def jsonld_breadcrumb(page, label):
    """パンくずリスト（SEO）。SITE_URL 未設定でも相対itemで出す。"""
    import json
    items = [{"@type": "ListItem", "position": 1, "name": "ホーム",
              "item": abs_url("index.html")}]
    if page != "home":
        items.append({"@type": "ListItem", "position": 2, "name": label,
                      "item": abs_url(page_file(page))})
    return json.dumps({"@context": "https://schema.org", "@type": "BreadcrumbList",
                       "itemListElement": items}, ensure_ascii=False, separators=(",", ":"))


def jsonld_faq(items):
    import json
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in items
        ],
    }, ensure_ascii=False, separators=(",", ":"))

# ------------------------------------------------------------------
# ナビゲーション定義
# ------------------------------------------------------------------
NAV = [
    ("concept.html", "コンセプト"),
    ("facility.html", "施設"),
    ("lesson.html", "レッスン"),
    ("lounge.html", "ラウンジ"),
    ("community.html", "コミュニティ"),
    ("plan.html", "料金"),
    ("access.html", "アクセス"),
    ("faq.html", "FAQ"),
]

FOOT_NAV = [
    ("FRANK GOLF", [
        ("concept.html", "ブランドコンセプト"),
        ("facility.html", "施設・設備"),
        ("lesson.html", "レッスン"),
        ("lounge.html", "バー・ラウンジ"),
        ("community.html", "会員コミュニティ"),
    ]),
    ("VISIT", [
        ("plan.html", "料金・会員プラン"),
        ("beginner.html", "はじめての方へ"),
        ("corporate.html", "法人でのご利用"),
        ("access.html", "アクセス"),
        ("faq.html", "よくあるご質問"),
        ("terms.html", "会員規約"),
    ]),
    ("MEMBER", [
        ("trial.html", "体験のご予約"),
        ("@links.memberLogin", "会員ログイン"),
        ("@links.memberBooking", "会員Web予約"),
        ("@links.memberRegister", "Web会員登録"),
    ]),
]


def head(title, desc, page, jsonld=""):
    """<head> と 告知バー・ヘッダー"""
    ogp = abs_url("assets/ogp.png")
    canonical = f'<link rel="canonical" href="{abs_url(page_file(page))}">\n' if SITE_URL else ""
    blocks = [jsonld_breadcrumb(page, PAGE_LABEL.get(page, ""))]
    if jsonld:
        blocks.append(jsonld)
    jsonld_tag = "".join(
        f'<script type="application/ld+json">{b}</script>\n' for b in blocks
    )
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="format-detection" content="telephone=no">
<meta property="og:site_name" content="{BRAND}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<meta name="keywords" content="姫路 インドアゴルフ,土山 ゴルフ,姫路 ゴルフレッスン,インドアゴルフ 会員制,ゴルフシミュレーター 姫路,ゴルフバー 姫路,FRANK GOLF">
<meta name="robots" content="index,follow">
<meta property="og:image" content="{ogp}">
<meta property="og:image:alt" content="FRANK GOLF｜打って、教わって、語れる。姫路・土山のフランクなゴルフ基地。">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{ogp}">
<meta name="theme-color" content="#101210">
{canonical}<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="assets/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=Zen+Old+Mincho:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
<script src="assets/site-data.js"></script>
{jsonld_tag}</head>
<body data-page="{page}">

<a class="skip" href="#main">本文へスキップ</a>

<!-- 1. プレオープン告知バー -->
<div class="notice-bar" role="status">
  <span class="notice-bar__tag">PRE-OPEN</span>
  <span><b data-preopen>{PREOPEN}</b>、姫路・土山にプレオープン。体験のご予約を受付中です。</span>
</div>

<!-- 2. ヘッダー -->
<header class="nav">
  <div class="nav__in">
    <a class="logo" href="index.html" aria-label="{BRAND} ホーム">
      <span class="logo__mark">FR<em>A</em>NK GOLF</span>
      <span class="logo__sub">HIMEJI</span>
    </a>
    <nav class="nav__menu" aria-label="メインメニュー">
""" + "\n".join(
        f'      <a href="{h}">{t}</a>' for h, t in NAV
    ) + """
      <div class="nav__m-cta">
        <a class="btn btn--brass btn--sm" href="#" data-cta="trial">体験予約</a>
        <a class="btn btn--line btn--sm" href="#" data-cta="line">公式LINEで相談</a>
        <a class="btn btn--ghost btn--sm" data-link="links.memberLogin">会員ログイン</a>
      </div>
    </nav>
    <div class="nav__cta">
      <a class="nav__member" data-link="links.memberLogin">MEMBER LOGIN</a>
      <a class="btn btn--brass btn--sm" href="#" data-cta="trial">体験予約</a>
    </div>
    <button class="burger" aria-label="メニュー" aria-expanded="false"><span></span></button>
  </div>
</header>

<main id="main">
"""


def cta_block():
    """16. 体験予約・公式LINE"""
    return f"""
<!-- 16. 体験予約・公式LINE -->
<section class="sec cta" id="contact">
  <div class="wrap center cta__box rv">
    <p class="eyebrow">Visit Us</p>
    <h2 class="h-en">COME AND SEE</h2>
    <p class="h-jp">まずは、一度打ちに来てください。</p>
    <p class="lead">
      {PREOPEN}、姫路・土山にプレオープンいたします。<br>
      施設を見て、打って、少し話して。合いそうだと思っていただけたら、それがいちばんです。<br>
      ご不明な点は公式LINEからお気軽にどうぞ。
    </p>
    <div class="cta__btns">
      <a class="btn btn--brass" href="#" data-cta="trial">体験のご予約</a>
      <a class="btn btn--line" href="#" data-cta="line">公式LINEで相談する</a>
    </div>
    <p class="cta__note">体験内容・体験料は <span data-frank="price.trialFee">近日公開</span> ／ ご予約はプレオープン日に向けて順次受付いたします</p>
  </div>
</section>
"""


def foot():
    """17. フッター"""
    cols = ""
    for title, items in FOOT_NAV:
        lis = ""
        for href, label in items:
            if href.startswith("@"):
                lis += f'        <li><a data-link="{href[1:]}">{label}</a></li>\n'
            else:
                lis += f'        <li><a href="{href}">{label}</a></li>\n'
        cols += f"""      <div>
        <p class="foot__h">{title}</p>
        <ul>
{lis}        </ul>
      </div>
"""
    return f"""
</main>

<!-- 17. フッター -->
<footer class="foot">
  <div class="wrap">
    <div class="foot__top">
      <div>
        <a class="logo" href="index.html">
          <span class="logo__mark">FR<em>A</em>NK GOLF</span>
          <span class="logo__sub">HIMEJI</span>
        </a>
        <p class="foot__about">
          打って、教わって、語れる。<br>
          姫路・土山のフランクなゴルフ基地。<br>
          練習・レッスン・交流がひとつになった、<br>
          大人のための会員制インドアゴルフラウンジです。
        </p>
        <p class="foot__about" style="margin-top:14px">
          <span data-frank="store.address">近日公開</span><br>
          TEL <a data-tel>近日公開</a>
        </p>
      </div>
      <div class="foot__nav">
{cols}      </div>
    </div>
    <div class="foot__bottom">
      <p>&copy; 2026 {BRAND} / 株式会社YOZAN. All Rights Reserved.</p>
      <nav>
        <a href="terms.html">会員規約</a>
        <a href="tokushoho.html">特定商取引法に基づく表記</a>
        <a href="privacy.html">プライバシーポリシー</a>
        <a href="faq.html">よくあるご質問</a>
        <a href="#" data-cta="line">お問い合わせ</a>
      </nav>
    </div>
  </div>
</footer>

<script src="assets/site.js"></script>
</body>
</html>
"""


def page_head(crumb, en, jp, lead=""):
    """下層ページの見出し"""
    lead_html = f'<p class="lead">{lead}</p>' if lead else ""
    return f"""
<section class="page-head">
  <div class="wrap rv">
    <p class="crumb"><a href="index.html">HOME</a><span>/</span>{crumb}</p>
    <h1 class="h-en">{en}</h1>
    <p class="h-jp">{jp}</p>
    {lead_html}
  </div>
</section>
"""



def media(key, src, alt, cap="", tall=False, cls=""):
    """写真の額装ブロック（サンプル差し替え対応）。
    src はJS無効時でも見えるよう初期値を入れ、data-img-src でJSが上書きする。"""
    tallcls = " media-tall" if tall else ""
    caphtml = f'<span class="media-cap">{cap}</span>' if cap else ""
    return (f'<div class="media-frame{tallcls} {cls} rv">'
            f'<img data-img-src="{key}" src="{src}" alt="{alt}" '
            f'loading="lazy" decoding="async" width="1280" height="853">'
            f'{caphtml}</div>')



def floorplan():
    """フロア見取り図（実際の間取りに基づく簡略イメージ図・インラインSVG）。
    1F: スロープ入口→打席→中央のバーカウンター＆ラウンジ→打席。2Fは個室・スタッフルーム。"""
    bays_left = "".join(
        f'<rect x="{132 + i*70}" y="96" width="58" height="120" rx="7" fill="url(#fpbay)" stroke="rgba(62,142,99,.42)"/>'
        f'<circle cx="{161 + i*70}" cy="180" r="4.5" fill="#E8E2D4"/>'
        f'<text x="{161 + i*70}" y="150" text-anchor="middle" class="fp-jp">打席{i+1}</text>'
        for i in range(2)
    )
    bays_right = "".join(
        f'<rect x="{628 + i*70}" y="96" width="58" height="120" rx="7" fill="url(#fpbay)" stroke="rgba(62,142,99,.42)"/>'
        f'<circle cx="{657 + i*70}" cy="180" r="4.5" fill="#E8E2D4"/>'
        f'<text x="{657 + i*70}" y="150" text-anchor="middle" class="fp-jp">打席{i+3}</text>'
        for i in range(2)
    )
    return '''<div class="floorplan rv">
  <div class="floorplan__badge">イメージ図</div>
  <svg viewBox="0 0 900 470" role="img" aria-label="FRANK GOLF 姫路・土山のフロア見取り図（イメージ）。スロープ入口、全4打席、中央にバーカウンターとラウンジ、2階に個室とスタッフルーム。">
    <defs>
      <linearGradient id="fpbay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#242924"/><stop offset="1" stop-color="#1b1f1b"/></linearGradient>
      <linearGradient id="fplounge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#241d12"/><stop offset="1" stop-color="#1a1710"/></linearGradient>
    </defs>
    <rect x="8" y="8" width="884" height="454" rx="16" fill="#141714" stroke="rgba(232,226,212,.14)"/>
    <text x="450" y="40" text-anchor="middle" class="fp-h">1F FLOOR</text>

    <!-- スロープ入口（左下） -->
    <path d="M60 300 L120 270 L120 360 L60 360 Z" fill="#1b1f1b" stroke="rgba(232,226,212,.18)"/>
    <text x="92" y="322" text-anchor="middle" class="fp-t">SLOPE</text>
    <text x="92" y="340" text-anchor="middle" class="fp-jp">スロープ入口</text>

    <!-- 左の打席（個室B） -->
    <rect x="120" y="80" width="152" height="152" rx="10" fill="rgba(62,142,99,.05)" stroke="rgba(62,142,99,.3)"/>
    <text x="196" y="72" text-anchor="middle" class="fp-t">PLAY / 打席エリア</text>''' + bays_left + '''

    <!-- 中央：バーカウンター＆ラウンジ -->
    <rect x="300" y="80" width="290" height="300" rx="12" fill="url(#fplounge)" stroke="rgba(201,162,76,.45)"/>
    <text x="445" y="118" text-anchor="middle" class="fp-h" fill="#E3C177">BAR &amp; LOUNGE</text>
    <text x="445" y="140" text-anchor="middle" class="fp-jp">バーカウンター＆ラウンジ</text>
    <rect x="330" y="168" width="230" height="26" rx="13" fill="none" stroke="#C9A24C" stroke-width="2"/>
    <text x="445" y="186" text-anchor="middle" class="fp-t">COUNTER / キッチン</text>
    <rect x="356" y="236" width="78" height="52" rx="6" fill="none" stroke="rgba(232,226,212,.3)"/>
    <rect x="456" y="236" width="78" height="52" rx="6" fill="none" stroke="rgba(232,226,212,.3)"/>
    <text x="445" y="322" text-anchor="middle" class="fp-jp">語らいのラウンジ席</text>

    <!-- 右の打席（個室・レフティ対応） -->
    <rect x="616" y="80" width="152" height="152" rx="10" fill="rgba(62,142,99,.05)" stroke="rgba(62,142,99,.3)"/>
    <text x="692" y="72" text-anchor="middle" class="fp-t">PLAY / 打席エリア</text>''' + bays_right + '''
    <text x="692" y="250" text-anchor="middle" class="fp-flow">打席4はレフティ左右対応</text>

    <!-- 階段→2F -->
    <rect x="616" y="286" width="152" height="90" rx="10" fill="#1b1f1b" stroke="rgba(232,226,212,.16)"/>
    <text x="692" y="322" text-anchor="middle" class="fp-t">STAIRS ↑ 2F</text>
    <text x="692" y="344" text-anchor="middle" class="fp-jp">2階も練習フロア（個室）</text>

    <!-- 動線 -->
    <path d="M120 330 Q 300 400 445 360" fill="none" stroke="#C9A24C" stroke-width="2" stroke-dasharray="6 6"/>
    <text x="250" y="412" text-anchor="middle" class="fp-flow">打って、そのままラウンジへ →</text>
  </svg>
  <p class="floorplan__note">※ 実際の間取りをもとにした簡略イメージ図です（1F・2Fの2フロア／全4打席・バーカウンター併設）。詳細な配置は変更になる場合があります。</p>
</div>'''


def write(name, body):
    path = os.path.join(HERE, name)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    print("  wrote", name, "(%d bytes)" % len(body.encode("utf-8")))


# ==================================================================
# 各ページの本文
# ==================================================================

def build_index():
    b = head(
        "FRANK GOLF｜打って、教わって、語れる。姫路・土山のフランクなゴルフ基地。",
        "練習・レッスン・交流がひとつになった、大人のための会員制インドアゴルフラウンジ。2026年9月2日、姫路・土山にプレオープン。",
        "home",
        jsonld=jsonld_business(),
    )

    # 3. メインビジュアル
    b += f"""
<!-- 3. メインビジュアル -->
<section class="hero">
  <div class="hero__bg" aria-hidden="true" data-img="hero" style="--hero-img:url(&quot;assets/img/hero.jpg&quot;)"></div>
  <div class="wrap hero__in">
    <p class="hero__tag"><span data-preopen>{PREOPEN}</span> PRE-OPEN ／ 姫路・土山</p>
    <h1 class="hero__copy">
      <span class="l1">打って、教わって、語れる。</span>
      <span class="l2">姫路・土山のフランクなゴルフ基地。</span>
    </h1>
    <p class="hero__sub">
      ただボールを打つだけではない。ゴルフが上手くなり、会話が生まれ、仲間ができる。<br>
      FRANK GOLFは、練習・レッスン・交流がひとつになった、大人のための会員制インドアゴルフラウンジです。
    </p>
    <div class="hero__cta">
      <a class="btn btn--brass" href="#" data-cta="trial">体験予約</a>
      <a class="btn btn--line" href="#" data-cta="line">公式LINEで相談</a>
    </div>
    <dl class="hero__meta">
      <div><dt>PRE-OPEN</dt><dd data-preopen>{PREOPEN}</dd></div>
      <div><dt>AREA</dt><dd>姫路・土山</dd></div>
      <div><dt>OPEN HOURS</dt><dd data-frank="store.hours">近日公開</dd></div>
      <div><dt>BAYS</dt><dd data-frank="store.bays">近日公開</dd></div>
    </dl>
  </div>
  <p class="scroll-hint">SCROLL</p>
</section>

<!-- 3b. プレオープン告知バナー帯 -->
<section class="sec promo" style="padding:clamp(40px,6vw,72px) 0">
  <div class="wrap">
    <a class="promo__in rv" href="#" data-cta="trial" aria-label="2026年9月2日プレオープン｜体験予約はこちら">
      <img data-img-src="bannerWide" src="assets/banner-wide.jpg"
           alt="FRANK GOLF 姫路・土山 2026年9月2日プレオープン。打って、教わって、語れる。体験予約・公式LINE受付中"
           loading="lazy" width="1200" height="420">
    </a>
    <div class="cta__btns" style="justify-content:center;margin-top:20px">
      <a class="btn btn--brass" href="#" data-cta="trial">体験予約</a>
      <a class="btn btn--line" href="#" data-cta="line">公式LINEで相談</a>
    </div>
  </div>
</section>

<!-- 4. ブランドコンセプト -->
<section class="sec sec--alt" id="concept">
  <div class="wrap">
    <div class="rv" style="max-width:52ch">
      <p class="eyebrow">Concept</p>
      <h2 class="h-en">MORE THAN<br>A DRIVING RANGE</h2>
      <p class="h-jp">ただの練習場ではなく、<br>ゴルフが上手くなり、仲間ができる場所。</p>
    </div>
    <div class="rv" style="margin-top:56px">
      <p class="quote">
        いい球が出た日に、<em>それを話せる相手がいる</em>。<br>
        うまくいかない日に、<em>笑い飛ばしてくれる誰かがいる</em>。<br>
        ゴルフが面白くなるのは、たぶん、そこからです。
      </p>
      <p class="lead" style="max-width:64ch">
        FRANK GOLFは、練習打席・プロによるレッスン・データ分析・バーラウンジでの交流を、
        ひとつの空間で提供する会員制インドアゴルフラウンジです。<br><br>
        打席で黙々とスイングを固める時間も、ラウンジでその日の一球について語り合う時間も、
        どちらもゴルフの一部だと考えています。上達と、その先にある人とのつながり。
        その両方が自然に生まれる場所を、姫路・土山につくります。
      </p>
      <div style="margin-top:34px">
        <a class="btn btn--ghost" href="concept.html">コンセプトを詳しく見る</a>
      </div>
    </div>
  </div>
</section>

<!-- 5. PLAY・LEARN・CONNECT -->
<section class="sec" id="experience">
  <div class="wrap">
    <div class="center rv">
      <p class="eyebrow">Three Experiences</p>
      <h2 class="h-en">PLAY / LEARN / CONNECT</h2>
      <p class="h-jp">3つの体験が、ひとつの空間で完結する。</p>
    </div>
    <div class="grid grid--3" style="margin-top:56px">
      <article class="card xp rv">
        <p class="card__no">01</p>
        <h3 class="card__t">PLAY</h3>
        <p class="card__t-jp">打つ</p>
        <p class="card__b">
          完全予約制の打席で、待ち時間なく練習に入れます。スマート入退室により、
          思い立ったその時間に。落ち着いた少人数制の環境で、
          自分の一球にじっくり向き合えます。
        </p>
      </article>
      <article class="card xp rv">
        <p class="card__no">02</p>
        <h3 class="card__t">LEARN</h3>
        <p class="card__t-jp">教わる</p>
        <p class="card__b">
          プロによるレッスンと、シミュレーターの弾道・スイングデータ。
          感覚だけに頼らず、数字で自分のスイングを知る。
          「なんとなく良くなった」で終わらせません。
        </p>
      </article>
      <article class="card xp rv">
        <p class="card__no">03</p>
        <h3 class="card__t">CONNECT</h3>
        <p class="card__t-jp">語る</p>
        <p class="card__b">
          打ち終わったら、そのままラウンジへ。同じ日に同じ場所で打った人と、
          自然に会話が生まれます。コンペやラウンドイベントを通じて、
          一緒に回る仲間が見つかる。
        </p>
      </article>
    </div>

    <div class="note-solo rv">
      <p class="note-solo__t">もちろん、一人で集中したい日も歓迎です。</p>
      <p class="note-solo__b">
        交流を目的にした施設ではありますが、交流を強制する施設ではありません。
        黙々と打ち込みたい日は、そのまま打って帰っていただいて構いません。
        ラウンジに寄るかどうかは、いつでもあなたのペースで決められます。
      </p>
    </div>
  </div>
</section>

<!-- 6. FRANKというブランド名に込めた意味 -->
<section class="sec sec--alt" id="name">
  <div class="wrap">
    <div class="grid grid--2" style="gap:56px;align-items:center">
      <div class="rv">
        <p class="eyebrow">The Name</p>
        <h2 class="h-en">WHY “FRANK”</h2>
        <p class="h-jp">FRANKに込めた意味。</p>
        <p class="lead">
          frank ── 率直な。飾らない。気取らない。<br><br>
          スコアを盛らない。知ったかぶりをしない。初心者だからと気後れしない。
          うまい人が偉いわけでもない。<br><br>
          「フランクに話せる」の、あのフランクです。
          ゴルフはときに堅苦しくなりがちですが、ここではその鎧を置いていってください。
          率直に教わり、率直に語れる。それがFRANK GOLFの名前の由来であり、
          この場所で守りたい唯一のルールです。
        </p>
      </div>
      <div class="rv">
        <div class="card" style="padding:44px 38px">
          <p class="quote" style="font-size:1.5rem">
            うまくなりたい。<br>
            でも、<em>気を張りたくはない</em>。<br><br>
            その両方を、<br>
            叶えられる場所にします。
          </p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- 7. 施設・設備紹介 -->
<section class="sec" id="facility">
  <div class="wrap">
    <div class="rv" style="max-width:56ch">
      <p class="eyebrow">Facility</p>
      <h2 class="h-en">A PLACE TO<br>STAY A WHILE</h2>
      <p class="h-jp">打って、終わりじゃない。</p>
      <p class="lead">
        FRANK GOLFの施設は、「打席」と「ラウンジ」がひと続きになっています。
        設備の一覧ではなく、ここでの過ごし方でご紹介します。
      </p>
    </div>

    <div style="margin-top:44px">"""+ media("play", "assets/img/play.jpg", "FRANK GOLF 姫路・土山のインドアゴルフ練習打席とシミュレーターのイメージ", "PLAY / 打席") +"""</div>

    <div style="margin-top:24px">"""+ floorplan() +"""</div>

    <div class="flow rv" style="margin-top:52px">
      <div class="flow__i">
        <p class="flow__n">STEP 01</p>
        <div>
          <h3 class="flow__t">スマート入退室で、そのまま打席へ</h3>
          <p class="flow__b">
            完全予約制なので、順番待ちはありません。予約した時間にお越しいただき、
            そのまま打席へ。受付での手続きに時間を取られることなく、
            club in hand の状態まで最短で。
          </p>
        </div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 02</p>
        <div>
          <h3 class="flow__t">落ち着いた少人数制の打席で、集中して打つ</h3>
          <p class="flow__b">
            打席数：<span data-frank="store.bays">近日公開</span>／
            シミュレーター：<span data-frank="store.simulator">近日公開</span><br>
            隣を気にせず、自分のリズムで。弾道とスイングのデータは、その場で確認できます。
          </p>
        </div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 03</p>
        <div>
          <h3 class="flow__t">プロに、その場で一言もらう</h3>
          <p class="flow__b">
            気になったことを、打ったその場で聞ける。
            レッスンの内容は <span data-frank="lesson.style">近日公開</span> です。
          </p>
        </div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 04</p>
        <div>
          <h3 class="flow__t">ラウンジで、その一球について語る</h3>
          <p class="flow__b">
            打ち終わったら、クラブを置いてラウンジへ。今日の当たり、次のラウンド、
            新しいドライバーの話。ゴルフの話が、いちばん面白くなる時間です。
            一杯だけ飲んで帰る人も、そのまま打席に戻る人もいます。
          </p>
        </div>
      </div>
    </div>

    <div style="margin-top:40px" class="rv">
      <a class="btn btn--ghost" href="facility.html">施設について詳しく見る</a>
    </div>
  </div>
</section>

<!-- 8. レッスン紹介 -->
<section class="sec sec--alt" id="lesson">
  <div class="wrap">
    <div class="grid grid--2" style="gap:56px">
      <div class="rv">
        <p class="eyebrow">Lesson</p>
        <h2 class="h-en">LEARN</h2>
        <p class="h-jp" data-frank-badge="lesson.style">プロに教わる。データで確かめる。</p>
        <p class="lead">
          自己流の限界は、たいてい「何が悪いか分からない」ところから来ます。
          FRANK GOLFでは、プロによるレッスンとシミュレーターの計測データを組み合わせ、
          いま直すべき一点をはっきりさせます。<br><br>
          そして、教わったことをラウンジで話してみる。
          言葉にすると、自分でも分かっていなかったことが整理されます。
          それも上達の一部だと考えています。
        </p>
      </div>
      <div class="rv">
        <div class="spec">
          <div class="spec__row"><p class="spec__k">レッスン形式</p><p class="spec__v" data-frank="lesson.style">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">レッスンメニュー</p><p class="spec__v" data-frank="lesson.menu">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">コーチ</p><p class="spec__v" data-frank="lesson.coaches">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">初心者プログラム</p><p class="spec__v" data-frank="lesson.beginnerProgram">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">使用シミュレーター</p><p class="spec__v" data-frank="store.simulator">近日公開</p></div>
        </div>
        <p style="margin-top:22px"><a class="btn btn--ghost btn--sm" href="lesson.html">レッスンを詳しく見る</a></p>
      </div>
    </div>
  </div>
</section>

<!-- 9. バー・ラウンジ紹介 -->
<section class="sec" id="lounge" style="background:radial-gradient(90% 70% at 80% 30%, rgba(201,162,76,.09), transparent 60%), var(--ink)">
  <div class="wrap">
    <div class="rv" style="max-width:56ch">
      <p class="eyebrow">Bar &amp; Lounge</p>
      <h2 class="h-en">THE 19TH HOLE</h2>
      <p class="h-jp">ここが、FRANK GOLFの中心です。</p>
      <p class="lead">
        バー・ラウンジは、打席のついでにある休憩スペースではありません。
        FRANK GOLFがつくりたかったものの、ほとんど本体です。<br><br>
        ゴルフの上達は打席で起きますが、ゴルフが「好きで仕方なくなる」のは、
        たいていラウンドの後の一杯や、誰かとのくだらない話の中です。
        その時間を、練習場の中に持ち込みました。
      </p>
    </div>
    <div style="margin-top:44px">"""+ media("lounge", "assets/img/lounge.jpg", "FRANK GOLF 姫路のバー・ラウンジの間接照明のイメージ。打席とひと続きの大人の社交場", "BAR & LOUNGE") +"""</div>
    <div class="grid grid--3 rv" style="margin-top:52px">
      <article class="card">
        <p class="card__no">01</p>
        <h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">打ってすぐ、語れる距離に</h3>
        <p class="card__b">打席とラウンジが同じフロアにあります。着替えて移動する必要も、店を変える必要もありません。今の一球の話が、熱いうちにできます。</p>
      </article>
      <article class="card">
        <p class="card__no">02</p>
        <h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">一人でも、入りやすい</h3>
        <p class="card__b">カウンター中心の設計です。一人で来て、静かに一杯やって帰ってもいい。誰かと話したい気分の日は、隣の会員と自然に話が始まります。</p>
      </article>
      <article class="card">
        <p class="card__no">03</p>
        <h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">気取らない大人の社交場</h3>
        <p class="card__b">ドレスコードはありません。練習着のままで結構です。スコアの上手い下手で席が決まることもありません。</p>
      </article>
    </div>
    <div class="spec rv" style="margin-top:44px">
      <div class="spec__row"><p class="spec__k">ドリンク</p><p class="spec__v" data-frank="lounge.drink">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">フード</p><p class="spec__v" data-frank="lounge.food">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">席数</p><p class="spec__v" data-frank="lounge.seats">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">ご利用時間</p><p class="spec__v" data-frank="lounge.hours">近日公開</p></div>
    </div>
    <p style="margin-top:28px" class="rv"><a class="btn btn--ghost" href="lounge.html">ラウンジを詳しく見る</a></p>
  </div>
</section>

<!-- 10. 会員コミュニティー・イベント -->
<section class="sec sec--alt" id="community">
  <div class="wrap">
    <div class="center rv">
      <p class="eyebrow">Community</p>
      <h2 class="h-en">GOLF FRIENDS</h2>
      <p class="h-jp">練習仲間ができると、ゴルフはもっと面白い。</p>
      <p class="lead">
        「一緒に回る人がいない」。インドア練習場に通う方から、いちばんよく聞く言葉です。
        FRANK GOLFでは、その一言が出ないように、会員同士がつながるきっかけを用意します。
      </p>
    </div>
    <div style="margin-top:44px">"""+ media("community", "assets/img/community.jpg", "FRANK GOLF 姫路の会員コンペ・ラウンドイベントで一緒に回るゴルフ仲間のイメージ", "COMMUNITY") +"""</div>
    <div class="grid grid--3 rv" style="margin-top:52px">
      <article class="card"><p class="card__no">01</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">会員限定コンペ</h3><p class="card__b">腕前で気後れしないよう、ハンデ戦を基本に。まずは「出てみる」ところから。</p></article>
      <article class="card"><p class="card__no">02</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">ラウンドイベント</h3><p class="card__b">一人参加が前提のラウンド会。当日その場で組み合わせが決まるので、誘う相手を探す必要がありません。</p></article>
      <article class="card"><p class="card__no">03</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">初心者向け交流会</h3><p class="card__b">まだコースに出たことがない方だけの会。同じ立場の人と一緒なら、最初の一歩は軽くなります。</p></article>
      <article class="card"><p class="card__no">04</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">ゴルフ観戦イベント</h3><p class="card__b">ラウンジのモニターでツアー中継を。誰かの応援に文句を言いながら見るのが、いちばん面白い。</p></article>
      <article class="card"><p class="card__no">05</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">法人交流</h3><p class="card__b">姫路の経営者・ビジネスパーソンが集まります。ゴルフを介した、自然なつながりの場として。</p></article>
      <article class="card"><p class="card__no">06</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">ゴルフ仲間との出会い</h3><p class="card__b">イベントに出なくても大丈夫。ラウンジで隣に座った人と話が合えば、それがいちばん自然な出会いです。</p></article>
    </div>

    <div class="note-solo rv">
      <p class="note-solo__t">交流は、あくまで「あってもいいもの」です。</p>
      <p class="note-solo__b">
        イベントへの参加は自由です。声をかけられたくない日は、そのまま打席で集中していただいて構いませんし、
        ラウンジを素通りして帰っていただいても構いません。
        一人で黙々と打ち込みたい人にとっても、快適に使える施設であることを大切にしています。
      </p>
    </div>
    <p style="margin-top:30px" class="rv"><a class="btn btn--ghost" href="community.html">コミュニティを詳しく見る</a></p>
  </div>
</section>

<!-- 11. 料金・会員プラン -->
<section class="sec" id="plan">
  <div class="wrap">
    <div class="center rv">
      <p class="eyebrow">Plan &amp; Price</p>
      <h2 class="h-en">MEMBERSHIP</h2>
      <p class="h-jp" data-frank-badge="price.plans.0.price">会員プラン</p>
      <p class="lead">
        料金・プラン内容は現在準備中です。決まり次第、本ページと公式LINEでお知らせいたします。
      </p>
    </div>
    <div class="grid grid--3 rv" style="margin-top:52px">
      <div class="plan">
        <p class="plan__n">LIGHT</p>
        <p class="plan__n-jp">ライト会員</p>
        <p class="plan__p"><span data-frank="price.plans.0.price">近日公開</span></p>
        <ul class="plan__f" data-frank="price.plans.0.features"><li>平日昼間の利用中心（月8回まで）</li><li>日中ゆったり練習したい方に</li></ul>
      </div>
      <div class="plan plan--feat">
        <span class="plan__badge">一番人気</span>
        <p class="plan__n">REGULAR</p>
        <p class="plan__n-jp">レギュラー会員</p>
        <p class="plan__p"><span data-frank="price.plans.1.price">近日公開</span></p>
        <ul class="plan__f" data-frank="price.plans.1.features"><li>全営業日ご利用可能</li><li>1日1時間 通い放題</li><li>毎日練習して上達したい方に</li></ul>
      </div>
      <div class="plan">
        <p class="plan__n">MASTER</p>
        <p class="plan__n-jp">マスター会員</p>
        <p class="plan__p"><span data-frank="price.plans.2.price">近日公開</span></p>
        <ul class="plan__f" data-frank="price.plans.2.features"><li>全営業日ご利用可能</li><li>1日最大2時間まで</li><li>たっぷり練習したい方に</li></ul>
      </div>
    </div>
    <div class="spec rv" style="margin-top:44px">
      <div class="spec__row"><p class="spec__k">法人ライトプラン</p><p class="spec__v" data-frank="price.corporate.0.price">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">法人プレミアムプラン</p><p class="spec__v" data-frank="price.corporate.1.price">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">レッスン料金</p><p class="spec__v" data-frank="price.lessonPrice">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">入会金</p><p class="spec__v" data-frank="price.joinFee">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">体験利用</p><p class="spec__v" data-frank="price.trialFee">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">ビジター利用</p><p class="spec__v" data-frank="price.visitorFee">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">プレオープン特典</p><p class="spec__v" data-frank="preopen.benefits">近日公開</p></div>
    </div>
    <p style="margin-top:30px" class="rv"><a class="btn btn--ghost" href="plan.html">料金・入会の流れを見る</a></p>
  </div>
</section>

<!-- 12. 初心者向け案内 -->
<section class="sec sec--alt" id="beginner">
  <div class="wrap">
    <div class="grid grid--2" style="gap:56px;align-items:center">
      <div class="rv">
        <p class="eyebrow">For Beginners</p>
        <h2 class="h-en">START HERE</h2>
        <p class="h-jp">はじめての方こそ、フランクに。</p>
        <p class="lead">
          クラブを持ったことがなくても大丈夫です。むしろ、いちばん歓迎したいのは、
          これから始める方です。<br><br>
          インドアなので、周りの視線も天候も気になりません。
          プロが最初の握り方から教えます。そして何より、
          ラウンジには「1年前は同じところにいた」会員がいます。
          分からないことを、分からないまま聞ける空気が、ここにはあります。
        </p>
        <p style="margin-top:30px"><a class="btn btn--ghost" href="beginner.html">はじめての方へ</a></p>
      </div>
      <div class="rv">
        <div class="card" style="padding:38px 34px">
          <ul class="plan__f" style="font-size:14.5px">
            <li>クラブをお持ちでなくても始められます</li>
            <li>屋内なので、天候・季節・人目を気にせず練習できます</li>
            <li>プロが基本の握り方・構え方からお伝えします</li>
            <li>初心者向けの交流会・ラウンド会があります</li>
            <li>「上手い人ばかりで気まずい」を作らないのが、FRANKの方針です</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- 13. 法人利用 -->
<section class="sec" id="corporate">
  <div class="wrap">
    <div class="rv" style="max-width:56ch">
      <p class="eyebrow">For Business</p>
      <h2 class="h-en">CORPORATE USE</h2>
      <p class="h-jp">接待の前に、まずここで一度。</p>
      <p class="lead">
        打席とラウンジがひと続きになっているという構造は、法人利用と相性がよいと考えています。
        一緒に打って、そのまま座って話す。ゴルフ場に出る前の関係づくりが、姫路市内で完結します。
      </p>
    </div>
    <div class="grid grid--3 rv" style="margin-top:44px">
      <article class="card"><p class="card__no">01</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">接待・商談で</h3><p class="card__b">ラウンジでそのままお話まで。ゴルフの話から入れるので、堅い空気になりません。</p></article>
      <article class="card"><p class="card__no">02</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">福利厚生として</h3><p class="card__b">社員の方が個々にご利用いただけます。ゴルフを始める社員の受け皿としても。</p></article>
      <article class="card"><p class="card__no">03</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">法人同士の交流</h3><p class="card__b">姫路の経営者・ビジネスパーソンが集まる場として、交流イベントを企画します。</p></article>
    </div>
    <div class="spec rv" style="margin-top:40px">
      <div class="spec__row"><p class="spec__k">法人ライトプラン</p><p class="spec__v" data-frank="price.corporate.0.price">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">法人プレミアムプラン</p><p class="spec__v" data-frank="price.corporate.1.price">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">貸切利用</p><p class="spec__v" data-frank="lounge.note">近日公開</p></div>
    </div>
    <p style="margin-top:30px" class="rv"><a class="btn btn--ghost" href="corporate.html">法人利用について</a></p>
  </div>
</section>

<!-- 14. アクセス -->
<section class="sec sec--alt" id="access">
  <div class="wrap">
    <div class="grid grid--2" style="gap:48px">
      <div class="rv">
        <p class="eyebrow">Access</p>
        <h2 class="h-en">HIMEJI<br>TSUCHIYAMA</h2>
        <p class="h-jp">姫路・土山</p>
        <div class="spec" style="margin-top:34px">
          <div class="spec__row"><p class="spec__k">所在地</p><p class="spec__v"><span data-frank="store.postal" data-frank-hide></span><span data-frank="store.address">近日公開</span></p></div>
          <div class="spec__row"><p class="spec__k">電話番号</p><p class="spec__v"><a data-tel>近日公開</a></p></div>
          <div class="spec__row"><p class="spec__k">営業時間</p><p class="spec__v" data-frank="store.hours">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">定休日</p><p class="spec__v" data-frank="store.holiday">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">駐車場</p><p class="spec__v" data-frank="store.parking">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">アクセス</p><p class="spec__v" data-frank="store.access">近日公開</p></div>
        </div>
      </div>
      <div class="rv">
        <div class="card" data-map style="padding:0;min-height:360px;display:flex;align-items:center;justify-content:center">
          <p class="tbd" style="padding:30px;text-align:center">地図は近日公開いたします<br><span style="font-size:12px;opacity:.7">2026年9月2日プレオープン／姫路・土山</span></p>
        </div>
      </div>
    </div>
    <p style="margin-top:30px" class="rv"><a class="btn btn--ghost" href="access.html">アクセスの詳細</a></p>
  </div>
</section>

<!-- 15b. お知らせ（site-data.js の news が0件なら自動で非表示） -->
<section class="sec sec--alt" id="news" data-news-section hidden>
  <div class="wrap" style="max-width:880px">
    <div class="rv">
      <p class="eyebrow">News</p>
      <h2 class="h-en">NEWS</h2>
      <p class="h-jp">お知らせ</p>
    </div>
    <ul class="news rv" data-news style="margin-top:36px"></ul>
  </div>
</section>

<!-- 15. よくある質問 -->
<section class="sec" id="faq">
  <div class="wrap" style="max-width:880px">
    <div class="center rv">
      <p class="eyebrow">FAQ</p>
      <h2 class="h-en">QUESTIONS</h2>
      <p class="h-jp">よくあるご質問</p>
    </div>
    <div class="faq rv" style="margin-top:44px">
""" + faq_items(HOME_FAQ) + """
    </div>
    <p style="margin-top:30px" class="center rv"><a class="btn btn--ghost" href="faq.html">すべてのご質問を見る</a></p>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("index.html", b)


# ------------------------------------------------------------------
# FAQ
# ------------------------------------------------------------------
def faq_items(items):
    out = ""
    for q, a in items:
        out += f"""      <details>
        <summary>{q}</summary>
        <div class="faq__a">{a}</div>
      </details>
"""
    return out


HOME_FAQ = [
    ("まったくの初心者ですが、大丈夫でしょうか。",
     "はい。むしろ、これから始める方をいちばん歓迎しています。クラブの握り方からプロがお伝えしますし、初心者向けの交流会・ラウンド会もご用意します。屋内なので人目も気になりません。"),
    ("一人で黙々と練習したいのですが、交流は必須ですか。",
     "いいえ。イベントへの参加もラウンジのご利用も、すべて任意です。打席で集中して打って、そのままお帰りいただいて構いません。交流は「あってもいいもの」であって、義務ではありません。"),
    ("会員でなくても利用できますか。",
     "体験利用をご用意しています。詳細・料金は近日公開いたします。ビジター利用の可否についても、決まり次第お知らせいたします。"),
    ("予約はどのように取りますか。",
     "会員の方は、Web予約（会員ログイン後）からお取りいただけます。体験のご予約は、本サイトの「体験予約」ボタン、または公式LINEから承ります。"),
    ("お酒が飲めなくてもラウンジは使えますか。",
     "もちろんです。ソフトドリンクもご用意します。ラウンジは、お酒を飲む場所というより、ゴルフの話をする場所だと考えています。"),
    ("プレオープンはいつですか。",
     f"{PREOPEN}に、姫路・土山でプレオープンいたします。料金・営業時間・設備の詳細は、決まり次第このサイトと公式LINEでお知らせいたします。"),
]

ALL_FAQ = HOME_FAQ + [
    ("駐車場はありますか。",
     "ご用意する予定です。台数については近日公開いたします。"),
    ("レッスンは毎回受けられますか。",
     "レッスンの形式・回数については現在検討中です。決まり次第お知らせいたします。"),
    ("クラブを持っていません。",
     "お持ちでなくても始められます。レンタルの有無や内容については近日公開いたします。"),
    ("法人での利用はできますか。",
     "はい。接待・商談でのご利用、福利厚生としての導入、法人同士の交流の場としてのご利用を想定しています。詳しくは「法人でのご利用」をご覧いただくか、公式LINEからお問い合わせください。"),
    ("女性一人でも利用しやすいですか。",
     "はい。完全予約制で落ち着いた少人数制の環境です。ラウンジもカウンター中心で、お一人でも過ごしやすい設計にしています。"),
    ("見学だけでもできますか。",
     "はい。公式LINEからお気軽にご連絡ください。プレオープン日に向けて、順次ご案内いたします。"),
]


# ------------------------------------------------------------------
# 下層ページ
# ------------------------------------------------------------------
def build_concept():
    b = head("ブランドコンセプト｜FRANK GOLF",
             "打って、教わって、語れる。姫路・土山のフランクなゴルフ基地。FRANK GOLFのブランドコンセプトと、名前に込めた意味。",
             "concept")
    b += page_head("コンセプト", "CONCEPT", "打って、教わって、語れる。",
                   "ただの練習場ではなく、ゴルフが上手くなり、仲間ができる場所。")
    b += '<section class="sec" style="padding-top:0"><div class="wrap">' + media("concept", "assets/img/concept.jpg", "FRANK GOLF 姫路・土山 会員制インドアゴルフラウンジのブランドイメージ", "CONCEPT") + '</div></section>'

    b += """
<section class="sec">
  <div class="wrap" style="max-width:820px">
    <div class="rv">
      <p class="quote">
        ゴルフが上達しても、<br>
        <em>一緒に回る人がいなければ</em>、<br>
        たぶん、続きません。
      </p>
      <p class="lead" style="max-width:none;margin-top:38px">
        インドアゴルフ練習場は、この10年でずいぶん増えました。24時間打てる。シミュレーターがある。
        便利になった一方で、多くの施設が「打って、帰る」だけの場所になっています。<br><br>
        私たちがつくりたいのは、そこではありません。<br><br>
        FRANK GOLFは、練習打席・プロによるレッスン・データ分析・バーラウンジでの交流を、
        ひとつの空間で提供する、大人向けの会員制インドアゴルフラウンジです。
        打席で上達し、ラウンジで語り、コンペで一緒に回る。
        その一連の流れが、ひとつの場所の中で完結します。
      </p>
    </div>
  </div>
</section>

<section class="sec sec--alt">
  <div class="wrap">
    <div class="center rv">
      <p class="eyebrow">Three Experiences</p>
      <h2 class="h-en">PLAY / LEARN / CONNECT</h2>
      <p class="h-jp">3つの体験が、ひとつの空間で完結する。</p>
    </div>
    <div class="grid grid--3" style="margin-top:52px">
      <article class="card xp rv">
        <p class="card__no">01</p><h3 class="card__t">PLAY</h3><p class="card__t-jp">打つ</p>
        <p class="card__b">完全予約制の打席。待ち時間はありません。スマート入退室で、思い立った時間にそのまま。落ち着いた少人数制の環境で、自分の一球に向き合えます。</p>
      </article>
      <article class="card xp rv">
        <p class="card__no">02</p><h3 class="card__t">LEARN</h3><p class="card__t-jp">教わる</p>
        <p class="card__b">プロによるレッスンと、シミュレーターの弾道・スイングデータ。感覚だけに頼らず、数字で自分のスイングを知る。直すべき一点をはっきりさせます。</p>
      </article>
      <article class="card xp rv">
        <p class="card__no">03</p><h3 class="card__t">CONNECT</h3><p class="card__t-jp">語る</p>
        <p class="card__b">打ち終わったら、そのままラウンジへ。同じ日に打った人と自然に会話が生まれ、コンペやラウンド会を通じて、一緒に回る仲間が見つかります。</p>
      </article>
    </div>
    <div class="note-solo rv">
      <p class="note-solo__t">ただし、一人で集中したい日も歓迎です。</p>
      <p class="note-solo__b">交流を目的にした施設ではありますが、交流を強制する施設ではありません。黙々と打ち込みたい日は、そのまま打って帰っていただいて構いません。ラウンジに寄るかどうかは、いつでもあなたのペースで決められます。</p>
    </div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="grid grid--2" style="gap:56px;align-items:center">
      <div class="rv">
        <p class="eyebrow">The Name</p>
        <h2 class="h-en">WHY “FRANK”</h2>
        <p class="h-jp">FRANKに込めた意味。</p>
        <p class="lead">
          frank ── 率直な。飾らない。気取らない。<br><br>
          ゴルフには、独特の堅苦しさがあります。スコアで値踏みされる感じ。
          初心者だと気後れする感じ。知ったかぶりをしないといけない感じ。<br><br>
          その全部を、ここでは置いていってください。<br><br>
          率直に教わり、率直に語れる。腕前で席が決まらない。
          「フランクに話せる」の、あのフランクです。
          それがFRANK GOLFという名前の由来であり、この場所で守りたい唯一のルールです。
        </p>
      </div>
      <div class="rv">
        <div class="card" style="padding:44px 38px">
          <p class="quote" style="font-size:1.4rem">
            うまくなりたい。<br>
            でも、<em>気を張りたくはない</em>。<br><br>
            その両方を、<br>
            叶えられる場所にします。
          </p>
        </div>
        <div class="card" style="padding:32px 30px;margin-top:20px">
          <p class="card__no">BASE</p>
          <h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">「ゴルフ基地」と呼ぶ理由</h3>
          <p class="card__b">基地は、通過する場所ではなく、戻ってくる場所です。準備をして、出かけて、また帰ってくる。姫路・土山で、そういう場所になれたらと思っています。</p>
        </div>
      </div>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("concept.html", b)


def build_facility():
    b = head("施設・設備｜FRANK GOLF",
             "打席とラウンジがひと続きに。FRANK GOLFでの過ごし方をご紹介します。姫路・土山、2026年9月2日プレオープン。",
             "facility")
    b += page_head("施設・設備", "FACILITY", "打って、終わりじゃない。",
                   "設備の一覧ではなく、ここでの過ごし方でご紹介します。")
    b += '<section class="sec" style="padding-top:0"><div class="wrap">' + media("play", "assets/img/play.jpg", "FRANK GOLF 姫路のインドアゴルフ打席・シミュレーターのイメージ", "FACILITY") + '</div></section>'
    # フロア見取り図
    b += '''
<section class="sec" style="padding-top:0">
  <div class="wrap">
    <div class="rv" style="max-width:56ch">
      <p class="eyebrow">Floor Map</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.6rem)">打って、そのまま語れる。</h2>
      <p class="lead">打席とバー・ラウンジがひと続き。着替えも移動もなく、打った熱が冷めないうちに語り合えます。</p>
    </div>
    <div style="margin-top:36px">''' + floorplan() + '''</div>
  </div>
</section>'''
    # 設備アイコン
    b += '''
<section class="sec sec--alt">
  <div class="wrap">
    <div class="center rv"><p class="eyebrow">Facilities</p><h2 class="h-en">EQUIPPED</h2><p class="h-jp">設備</p></div>
    <div class="feats rv" style="margin-top:44px">
      <div class="feat"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><p class="feat__t">スマート入退室</p><p class="feat__b">完全予約制・待ち時間なし</p></div>
      <div class="feat"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg><p class="feat__t">シミュレーター</p><p class="feat__b" data-frank="store.simulator" data-frank-fallback="近日公開">近日公開</p></div>
      <div class="feat"><svg viewBox="0 0 24 24"><path d="M6 3v7a6 6 0 0 0 12 0V3M6 21h12"/></svg><p class="feat__t">バー・ラウンジ</p><p class="feat__b">気取らない社交場</p></div>
      <div class="feat"><svg viewBox="0 0 24 24"><path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5L12 21l-5-2.9 1-5.5-4-3.9 5.5-.8z"/></svg><p class="feat__t">プロのレッスン</p><p class="feat__b">データで確かめる</p></div>
      <div class="feat"><svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="12" rx="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg><p class="feat__t">駐車場</p><p class="feat__b" data-frank="store.parking" data-frank-fallback="近日公開">近日公開</p></div>
    </div>
  </div>
</section>'''
    # ギャラリー（実写差し替え前提）
    b += '''
<section class="sec">
  <div class="wrap">
    <div class="rv" style="max-width:56ch"><p class="eyebrow">Gallery</p><h2 class="h-en">INSIDE</h2><p class="h-jp">館内のようす</p><p class="lead">オープンに向けて準備中です。実際の写真は随時公開いたします。</p></div>
    <div class="gallery rv" style="margin-top:36px">
      <div class="gallery__i"><img data-img-src="play" src="assets/img/play.jpg" alt="FRANK GOLF 姫路の打席イメージ" loading="lazy" width="1280" height="853"><span class="gallery__cap">打席</span></div>
      <div class="gallery__i"><img data-img-src="lounge" src="assets/img/lounge.jpg" alt="FRANK GOLF 姫路のバー・ラウンジイメージ" loading="lazy" width="1280" height="853"><span class="gallery__cap">ラウンジ</span></div>
      <div class="gallery__i"><img data-img-src="lesson" src="assets/img/lesson.jpg" alt="FRANK GOLF 姫路のレッスン・データ分析イメージ" loading="lazy" width="1280" height="853"><span class="gallery__cap">レッスン</span></div>
      <div class="gallery__i"><img data-img-src="community" src="assets/img/community.jpg" alt="FRANK GOLF 姫路の会員交流イメージ" loading="lazy" width="1280" height="853"><span class="gallery__cap">コミュニティ</span></div>
      <div class="gallery__i"><img data-img-src="concept" src="assets/img/concept.jpg" alt="FRANK GOLF 姫路のブランドイメージ" loading="lazy" width="1280" height="720"><span class="gallery__cap">エントランス（準備中）</span></div>
      <div class="gallery__i"><img data-img-src="hero" src="assets/img/hero.jpg" alt="FRANK GOLF 姫路の館内イメージ" loading="lazy" width="1920" height="1200"><span class="gallery__cap">館内（準備中）</span></div>
    </div>
    <p class="lead" style="font-size:12px;margin-top:14px">※ 掲載画像はイメージです。実際の館内写真はオープンに向けて公開いたします。</p>
  </div>
</section>'''

    b += """
<section class="sec">
  <div class="wrap">
    <div class="rv" style="max-width:56ch">
      <p class="eyebrow">A Day at FRANK</p>
      <h2 class="h-en">HOW YOU<br>SPEND HERE</h2>
      <p class="h-jp">ある日の、過ごし方。</p>
    </div>
    <div class="flow rv" style="margin-top:48px">
      <div class="flow__i">
        <p class="flow__n">STEP 01</p>
        <div>
          <h3 class="flow__t">スマート入退室で、そのまま打席へ</h3>
          <p class="flow__b">完全予約制です。順番待ちはありません。予約した時間にお越しいただき、受付での手続きに時間を取られることなく、そのまま打席へ。仕事帰りの1時間でも、無駄なく使えます。</p>
        </div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 02</p>
        <div>
          <h3 class="flow__t">落ち着いた少人数制の打席で、集中して打つ</h3>
          <p class="flow__b">隣を気にせず、自分のリズムで。弾道とスイングのデータはその場で確認できます。今日は当たっている、今日はダメだ ── その理由が数字で見えます。</p>
        </div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 03</p>
        <div>
          <h3 class="flow__t">気になったことを、その場でプロに聞く</h3>
          <p class="flow__b">「今の、なんで右に行きました？」が、打ったその場で聞ける距離にプロがいます。持ち帰らずに、その日のうちに直す。</p>
        </div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 04</p>
        <div>
          <h3 class="flow__t">ラウンジで、その一球について語る</h3>
          <p class="flow__b">クラブを置いて、そのままラウンジへ。今日の当たり、次のラウンド、新しいドライバーの話。ゴルフの話がいちばん面白くなる時間です。一杯だけ飲んで帰る人も、話し込んでから打席に戻る人もいます。</p>
        </div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 05</p>
        <div>
          <h3 class="flow__t">そして、コースで会う</h3>
          <p class="flow__b">ラウンジで話した人と、次はコースで。会員限定コンペやラウンドイベントが、その入口になります。</p>
        </div>
      </div>
    </div>
    <div class="note-solo rv">
      <p class="note-solo__t">STEP 04 は、飛ばしても構いません。</p>
      <p class="note-solo__b">打って、そのまま帰る。それも正しい使い方です。ラウンジに寄るかどうかは、その日の気分で決めてください。一人で集中したい方にとっても快適な施設であることを、同じくらい大切にしています。</p>
    </div>
  </div>
</section>

<section class="sec sec--alt">
  <div class="wrap">
    <div class="rv">
      <p class="eyebrow">Specification</p>
      <h2 class="h-en">FACILITY DATA</h2>
      <p class="h-jp">設備概要</p>
      <p class="lead">下記は現在準備中の項目です。決まり次第、このページと公式LINEでお知らせいたします。</p>
    </div>
    <div class="spec rv" style="margin-top:40px">
      <div class="spec__row"><p class="spec__k">打席数</p><p class="spec__v" data-frank="store.bays">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">シミュレーター</p><p class="spec__v" data-frank="store.simulator">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">バー・ラウンジ</p><p class="spec__v" data-frank="lounge.seats">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">営業時間</p><p class="spec__v" data-frank="store.hours">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">定休日</p><p class="spec__v" data-frank="store.holiday">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">駐車場</p><p class="spec__v" data-frank="store.parking">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">所在地</p><p class="spec__v" data-frank="store.address">近日公開</p></div>
    </div>
    <div class="grid grid--3 rv" style="margin-top:48px">
      <article class="card"><p class="card__no">01</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">完全予約制</h3><p class="card__b">打席が埋まっていて打てない、という日がありません。行く前に空きが分かります。</p></article>
      <article class="card"><p class="card__no">02</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">スマート入退室</h3><p class="card__b">受付での待ち時間なく、予約時間からすぐ練習に入れます。</p></article>
      <article class="card"><p class="card__no">03</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">少人数制</h3><p class="card__b">混み合わない環境。隣の視線を気にせず、自分のペースで打てます。</p></article>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("facility.html", b)


def build_lesson():
    b = head("レッスン｜FRANK GOLF",
             "プロによるレッスンと、シミュレーターのデータ分析。感覚ではなく、数字で自分のスイングを知る。姫路・土山のFRANK GOLF。",
             "lesson")
    b += page_head("レッスン", "LESSON", "プロに教わる。データで確かめる。",
                   "自己流の限界は、たいてい「何が悪いか分からない」ところから来ます。")
    b += '<section class="sec" style="padding-top:0"><div class="wrap">' + media("lesson", "assets/img/lesson.jpg", "FRANK GOLF 姫路のゴルフレッスン・スイングデータ分析のイメージ", "LESSON") + '</div></section>'

    b += """
<section class="sec">
  <div class="wrap">
    <div class="grid grid--2" style="gap:56px">
      <div class="rv">
        <h2 class="h-en" style="font-size:clamp(1.8rem,4vw,2.6rem)">TEACH,<br>THEN TALK</h2>
        <p class="lead">
          教わったことは、その日のうちに試して、誰かに話す。
          これが、いちばん身につく順番だと思っています。<br><br>
          FRANK GOLFでは、プロによるレッスンとシミュレーターの計測データを組み合わせ、
          いま直すべき一点をはっきりさせます。そして、教わったことをラウンジで話してみる。
          言葉にすると、自分でも分かっていなかったことが整理されます。
          ラウンジがあることは、実は上達にも効くと考えています。
        </p>
      </div>
      <div class="rv">
        <div class="grid" style="gap:16px">
          <article class="card"><p class="card__no">01</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">感覚ではなく、数字で</h3><p class="card__b">弾道・ヘッドスピード・入射角。「なんとなく良くなった」で終わらせません。</p></article>
          <article class="card"><p class="card__no">02</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">その場で、一言</h3><p class="card__b">打ったその瞬間に聞けることが、いちばん記憶に残ります。</p></article>
          <article class="card"><p class="card__no">03</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">初心者から、上級者まで</h3><p class="card__b">握り方から始める方も、スコアの壁で止まっている方も。</p></article>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="sec sec--alt">
  <div class="wrap">
    <div class="rv" style="max-width:56ch">
      <p class="eyebrow">Coach</p>
      <h2 class="h-en">YOUR PRO</h2>
      <p class="h-jp">常駐コーチのご紹介</p>
    </div>
    <div class="grid grid--2 rv" style="margin-top:40px;gap:40px;align-items:center">
      <div class="media-frame media-tall">
        <img data-img-src="lesson" src="assets/img/lesson.jpg" alt="FRANK GOLF 常駐コーチ 藤田晃規プロ（イメージ）" loading="lazy" width="1280" height="853">
        <span class="media-cap">COACH / 藤田 晃規</span>
      </div>
      <div>
        <p class="card__no">TOUR PRO</p>
        <h3 class="card__t" style="font-size:2rem">藤田 晃規</h3>
        <p class="card__t-jp" style="margin-bottom:20px">ふじた あきのり ／ Akinori FUJITA</p>
        <p class="card__b" style="margin-bottom:22px">
          日本ゴルフツアー機構（JGTO）ツアーメンバー。<strong style="color:var(--txt-str)">兵庫県出身</strong>・大阪学院大学卒。
          2009年にプロ転向、アマチュア時代は日本アマチュア選手権ベスト16。
          地元・姫路土山で、あなたの一球にフランクに向き合います。
        </p>
        <ul class="plan__f" style="font-size:13.5px">
          <li>出身地：兵庫県</li>
          <li>ゴルフ歴：15歳〜／2009年プロ転向</li>
          <li>JGTO ツアーメンバー</li>
        </ul>
        <p style="margin-top:20px"><a class="btn btn--ghost btn--sm" href="https://www.jgto.org/player/15674/profile" target="_blank" rel="noopener">JGTO 選手プロフィール ↗</a></p>
      </div>
    </div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="rv">
      <p class="eyebrow">Lesson Menu</p>
      <h2 class="h-en">DETAILS</h2>
      <p class="h-jp" data-frank-badge="lesson.style">レッスン内容</p>
      <p class="lead">レッスンの形式・メニュー・担当コーチは現在準備中です。決まり次第、このページと公式LINEでお知らせいたします。</p>
    </div>
    <div class="spec rv" style="margin-top:40px">
      <div class="spec__row"><p class="spec__k">レッスン形式</p><p class="spec__v" data-frank="lesson.style">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">レッスンメニュー</p><p class="spec__v" data-frank="lesson.menu">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">コーチ紹介</p><p class="spec__v" data-frank="lesson.coaches">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">初心者プログラム</p><p class="spec__v" data-frank="lesson.beginnerProgram">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">使用シミュレーター</p><p class="spec__v" data-frank="store.simulator">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">レッスン料金</p><p class="spec__v" data-frank="price.lessonPrice">近日公開</p></div>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("lesson.html", b)


def build_lounge():
    b = head("バー・ラウンジ｜FRANK GOLF",
             "打席とひと続きのバー・ラウンジ。FRANK GOLFの中心的な価値です。気取らずに集まれる、大人の社交場。",
             "lounge")
    b += page_head("バー・ラウンジ", "BAR &amp; LOUNGE", "ここが、FRANK GOLFの中心です。",
                   "ラウンジは、打席のついでにある休憩スペースではありません。")
    b += '<section class="sec" style="padding-top:0"><div class="wrap">' + media("lounge", "assets/img/lounge.jpg", "FRANK GOLF 姫路のバー・ラウンジ。気取らない大人の社交場のイメージ", "BAR & LOUNGE") + '</div></section>'

    b += """
<section class="sec">
  <div class="wrap" style="max-width:840px">
    <div class="rv">
      <p class="quote">
        ゴルフが上達するのは打席ですが、<br>
        ゴルフが<em>好きで仕方なくなる</em>のは、<br>
        たいてい、その後の一杯の中です。
      </p>
      <p class="lead" style="max-width:none;margin-top:36px">
        ラウンドの後、クラブハウスや車の中で交わす、あの取り留めのない会話。
        今日の3番ホールのあの一打。新しいドライバーの話。誰かのひどいOB。<br><br>
        あれが、ゴルフのいちばん楽しい部分だと私たちは思っています。
        だからFRANK GOLFは、その時間を練習場の中に持ち込みました。
        バー・ラウンジは補足設備ではなく、この施設をつくった理由そのものです。
      </p>
    </div>
  </div>
</section>

<section class="sec sec--alt">
  <div class="wrap">
    <div class="grid grid--3">
      <article class="card rv"><p class="card__no">01</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">打ってすぐ、語れる距離に</h3><p class="card__b">打席とラウンジは同じフロアにあります。着替える必要も、店を変える必要もありません。今の一球の話が、熱を持ったままできます。</p></article>
      <article class="card rv"><p class="card__no">02</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">一人でも、入りやすい</h3><p class="card__b">カウンター中心の設計です。一人で来て、静かに一杯やって帰ってもいい。話したい気分の日は、隣の会員と自然に話が始まります。</p></article>
      <article class="card rv"><p class="card__no">03</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">気取らない社交場</h3><p class="card__b">ドレスコードはありません。練習着のままで結構です。スコアの上手い下手で席が決まることもありません。</p></article>
      <article class="card rv"><p class="card__no">04</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">お酒が飲めなくても</h3><p class="card__b">ソフトドリンクもご用意します。ラウンジは、お酒を飲む場所というより、ゴルフの話をする場所です。</p></article>
      <article class="card rv"><p class="card__no">05</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">ツアー中継を、みんなで</h3><p class="card__b">モニターでゴルフ中継を。誰かの応援に文句を言いながら見るのが、いちばん面白い。</p></article>
      <article class="card rv"><p class="card__no">06</p><h3 class="card__t-jp" style="font-size:16px;color:var(--txt-str)">商談の、その前に</h3><p class="card__b">一緒に打って、そのまま座って話す。法人でのご利用にも適した空間です。</p></article>
    </div>
    <div class="note-solo rv">
      <p class="note-solo__t">寄らずに帰る日があっても、まったく問題ありません。</p>
      <p class="note-solo__b">ラウンジのご利用は任意です。今日は打つだけ、という日はそのままお帰りください。声をかけられたくない日もあります。それを察せる空気であることも、FRANKらしさだと考えています。</p>
    </div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="rv">
      <p class="eyebrow">Lounge Data</p>
      <h2 class="h-en">DETAILS</h2>
      <p class="h-jp" data-frank-badge="lounge.drink">ラウンジ概要</p>
      <p class="lead">ドリンク・フードの内容、席数、ご利用時間は現在準備中です。決まり次第お知らせいたします。</p>
    </div>
    <div class="spec rv" style="margin-top:40px">
      <div class="spec__row"><p class="spec__k">ドリンク</p><p class="spec__v" data-frank="lounge.drink">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">フード</p><p class="spec__v" data-frank="lounge.food">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">席数</p><p class="spec__v" data-frank="lounge.seats">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">ご利用時間</p><p class="spec__v" data-frank="lounge.hours">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">貸切利用</p><p class="spec__v" data-frank="lounge.note">近日公開</p></div>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("lounge.html", b)


def build_community():
    b = head("会員コミュニティ・イベント｜FRANK GOLF",
             "会員限定コンペ、ラウンドイベント、初心者向け交流会、ゴルフ観戦、法人交流。一緒に回る仲間が見つかる場所。",
             "community")
    b += page_head("コミュニティ", "COMMUNITY", "練習仲間ができると、ゴルフはもっと面白い。",
                   "「一緒に回る人がいない」。その一言が出ないように。")
    b += '<section class="sec" style="padding-top:0"><div class="wrap">' + media("community", "assets/img/community.jpg", "FRANK GOLF 姫路の会員コンペ・ゴルフ仲間との交流イメージ", "COMMUNITY") + '</div></section>'

    b += """
<section class="sec">
  <div class="wrap" style="max-width:820px">
    <div class="rv">
      <p class="lead" style="max-width:none">
        インドア練習場に通う方から、いちばんよく聞く言葉があります。<br><br>
        「練習はしてるんですけど、一緒に回る人がいなくて」<br><br>
        上達しても、行く場所がなければ意味がありません。逆に、一緒に行く相手がいれば、
        練習にも身が入ります。FRANK GOLFが交流にこだわるのは、それが親睦のためだけでなく、
        ゴルフを続けるための現実的な条件だと考えているからです。
      </p>
    </div>
  </div>
</section>

<section class="sec sec--alt">
  <div class="wrap">
    <div class="center rv">
      <p class="eyebrow">Events</p>
      <h2 class="h-en">GET TOGETHER</h2>
      <p class="h-jp">つながるきっかけを、用意します。</p>
    </div>
    <div class="grid grid--2 rv" style="margin-top:52px">
      <article class="card"><p class="card__no">01</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">会員限定コンペ</h3><p class="card__b">腕前で気後れしないよう、ハンデ戦を基本にします。上手い人が勝つだけの会にはしません。まずは「出てみる」ところから。</p></article>
      <article class="card"><p class="card__no">02</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">ラウンドイベント</h3><p class="card__b">一人参加が前提のラウンド会です。当日その場で組み合わせが決まるので、誘う相手を自分で探す必要がありません。</p></article>
      <article class="card"><p class="card__no">03</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">初心者向け交流会</h3><p class="card__b">まだコースに出たことがない方だけの会です。同じ立場の人と一緒なら、最初の一歩は軽くなります。「みんな初めて」の安心感を用意します。</p></article>
      <article class="card"><p class="card__no">04</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">ゴルフ観戦イベント</h3><p class="card__b">ラウンジのモニターでツアー中継を。誰かの応援に文句を言いながら見るのが、いちばん面白い。ゴルフ好き同士、それだけで話は尽きません。</p></article>
      <article class="card"><p class="card__no">05</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">法人交流</h3><p class="card__b">姫路の経営者・ビジネスパーソンが集まります。名刺交換の場ではなく、ゴルフを介した自然なつながりの場として。</p></article>
      <article class="card"><p class="card__no">06</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">ゴルフ仲間との出会い</h3><p class="card__b">イベントに出なくても大丈夫です。ラウンジで隣に座った人と話が合えば、それがいちばん自然な出会いです。仕組みより、空気を大切にします。</p></article>
    </div>
    <p class="lead center rv" style="margin-top:40px">
      イベントの開催時期・内容の詳細は <span class="tbd">近日公開</span> です。
    </p>
  </div>
</section>

<section class="sec">
  <div class="wrap" style="max-width:820px">
    <div class="rv">
      <p class="eyebrow">Our Promise</p>
      <h2 class="h-en">NO PRESSURE</h2>
      <p class="h-jp">交流を、押しつけません。</p>
      <p class="lead" style="max-width:none">
        ここまで交流の話をしてきましたが、いちばん大事なことを書いておきます。<br><br>
        <strong style="color:var(--txt-str)">FRANK GOLFは、交流を強制する施設ではありません。</strong><br><br>
        イベントへの参加は自由です。ラウンジに寄るかどうかも自由です。
        今日は誰とも話したくない、という日は、打席で黙って打って、そのまま帰っていただいて構いません。
        それを引き止めたり、誘い続けたりすることはありません。<br><br>
        一人で集中して練習したい人が、自分のペースで快適に使えること。
        それができて初めて、交流は「楽しいもの」になります。順番を間違えないようにします。
      </p>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("community.html", b)


def build_plan():
    b = head("料金・会員プラン｜FRANK GOLF",
             "FRANK GOLFの会員プランと料金。2026年9月2日プレオープン、姫路・土山。",
             "plan")
    b += page_head("料金・会員プラン", "PLAN &amp; PRICE", "会員プラン",
                   "料金・プラン内容は現在準備中です。決まり次第、本ページと公式LINEでお知らせいたします。")
    b += """
<section class="sec">
  <div class="wrap">
    <div class="grid grid--3 rv">
      <div class="plan">
        <p class="plan__n">LIGHT</p>
        <p class="plan__n-jp">ライト会員</p>
        <p class="plan__p"><span data-frank="price.plans.0.price">近日公開</span></p>
        <ul class="plan__f" data-frank="price.plans.0.features"><li>平日昼間の利用中心（月8回まで）</li><li>日中ゆったり練習したい方に</li></ul>
      </div>
      <div class="plan plan--feat">
        <span class="plan__badge">一番人気</span>
        <p class="plan__n">REGULAR</p>
        <p class="plan__n-jp">レギュラー会員</p>
        <p class="plan__p"><span data-frank="price.plans.1.price">近日公開</span></p>
        <ul class="plan__f" data-frank="price.plans.1.features"><li>全営業日ご利用可能</li><li>1日1時間 通い放題</li><li>毎日練習して上達したい方に</li></ul>
      </div>
      <div class="plan">
        <p class="plan__n">MASTER</p>
        <p class="plan__n-jp">マスター会員</p>
        <p class="plan__p"><span data-frank="price.plans.2.price">近日公開</span></p>
        <ul class="plan__f" data-frank="price.plans.2.features"><li>全営業日ご利用可能</li><li>1日最大2時間まで</li><li>たっぷり練習したい方に</li></ul>
      </div>
    </div>
    <div class="spec rv" style="margin-top:44px">
      <div class="spec__row"><p class="spec__k">法人ライトプラン</p><p class="spec__v" data-frank="price.corporate.0.price">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">法人プレミアムプラン</p><p class="spec__v" data-frank="price.corporate.1.price">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">レッスン料金</p><p class="spec__v" data-frank="price.lessonPrice">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">入会金</p><p class="spec__v" data-frank="price.joinFee">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">体験利用</p><p class="spec__v" data-frank="price.trialFee">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">ビジター利用</p><p class="spec__v" data-frank="price.visitorFee">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">プレオープン特典</p><p class="spec__v" data-frank="preopen.benefits">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">備考</p><p class="spec__v" data-frank="price.note">近日公開</p></div>
    </div>
    <div class="center rv" style="margin-top:40px">
      <div class="cta__btns" style="justify-content:center">
        <a class="btn btn--brass" data-link="links.joinWeb">Webで入会を申し込む</a>
        <a class="btn btn--ghost" href="#" data-cta="trial">まずは体験する</a>
      </div>
      <p class="cta__note" style="margin-top:14px">Web入会はスタッフ確認後に確定します（オンライン決済はありません）。</p>
    </div>
  </div>
</section>

<section class="sec sec--alt">
  <div class="wrap">
    <div class="rv" style="max-width:56ch">
      <p class="eyebrow">How to Join</p>
      <h2 class="h-en">JOIN US</h2>
      <p class="h-jp">ご入会の流れ</p>
    </div>
    <div class="flow rv" style="margin-top:44px">
      <div class="flow__i">
        <p class="flow__n">STEP 01</p>
        <div><h3 class="flow__t">体験のご予約</h3><p class="flow__b">本サイトの「体験予約」ボタン、または公式LINEから。ご希望の日時をお知らせください。</p></div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 02</p>
        <div><h3 class="flow__t">ご来店・体験</h3><p class="flow__b">実際に打って、施設をご覧いただきます。ラウンジもぜひ覗いてみてください。合うかどうかは、来てみるのがいちばん早いです。</p></div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 03</p>
        <div><h3 class="flow__t">ご入会手続き</h3><p class="flow__b">プランをお選びいただき、お手続きを行います。ご来店時のほか、<a data-link="links.joinWeb" style="color:var(--brass-2)">Webでの入会申込 ↗</a>も可能です（スタッフ確認後に確定・オンライン決済はありません）。その場で決めていただく必要はありません。</p></div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 04</p>
        <div>
          <h3 class="flow__t">会員登録・Web予約の開始</h3>
          <p class="flow__b">
            ご入会後は、会員ページからWeb予約をご利用いただけます。<br>
            <a data-link="links.memberRegister" style="color:var(--brass-2)">Web会員登録 ↗</a>
            <a data-link="links.memberLogin" style="color:var(--brass-2)">会員ログイン ↗</a>
          </p>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="sec">
  <div class="wrap" style="max-width:880px">
    <div class="center rv">
      <p class="eyebrow">Member Site</p>
      <h2 class="h-en">FOR MEMBERS</h2>
      <p class="h-jp">会員の方へ</p>
      <p class="lead">ご入会後は、こちらから打席のご予約・ご確認いただけます。</p>
    </div>
    <div class="grid grid--3 rv" style="margin-top:40px">
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">LOGIN</h3><p class="card__b" style="margin:12px 0 20px">会員番号と生年月日でログイン</p><a class="btn btn--ghost btn--sm" data-link="links.memberLogin">会員ログイン</a></article>
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">BOOKING</h3><p class="card__b" style="margin:12px 0 20px">打席のWeb予約・キャンセル</p><a class="btn btn--ghost btn--sm" data-link="links.memberBooking">Web予約</a></article>
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">REGISTER</h3><p class="card__b" style="margin:12px 0 20px">はじめての方の会員登録</p><a class="btn btn--ghost btn--sm" data-link="links.memberRegister">Web会員登録</a></article>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("plan.html", b)


def build_beginner():
    b = head("はじめての方へ｜FRANK GOLF",
             "クラブを持ったことがなくても大丈夫。屋内で人目を気にせず、プロが握り方から。初心者向けの交流会・ラウンド会もご用意します。",
             "beginner")
    b += page_head("はじめての方へ", "FOR BEGINNERS", "はじめての方こそ、フランクに。",
                   "いちばん歓迎したいのは、これから始める方です。")
    b += """
<section class="sec">
  <div class="wrap" style="max-width:820px">
    <div class="rv">
      <p class="quote">
        「上手くなってから行きます」<br>
        ── その順番だと、<br>
        <em>たぶん一生行けません</em>。
      </p>
      <p class="lead" style="max-width:none;margin-top:36px">
        ゴルフを始めるとき、いちばんの壁は技術ではありません。
        「下手なのに行っていいのか」という、あの気後れです。<br><br>
        FRANK GOLFは、その気後れを外すためにある場所です。
        屋内なので誰にも見られません。プロが最初の握り方から教えます。
        そしてラウンジには、「1年前は同じところにいた」会員がいます。
        分からないことを、分からないまま聞ける。それがFRANKという名前の意味です。
      </p>
    </div>
  </div>
</section>

<section class="sec sec--alt">
  <div class="wrap">
    <div class="grid grid--2">
      <article class="card rv"><p class="card__no">01</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">クラブがなくても始められます</h3><p class="card__b">まずは手ぶらでお越しください。レンタルの詳細は <span class="tbd">近日公開</span> です。</p></article>
      <article class="card rv"><p class="card__no">02</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">誰にも見られません</h3><p class="card__b">屋内・少人数制です。空振りしても、誰も見ていません。天候にも季節にも左右されません。</p></article>
      <article class="card rv"><p class="card__no">03</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">プロが、最初の一歩から</h3><p class="card__b">握り方、構え方、当て方。自己流の癖がつく前に、正しい形を。初心者プログラムの詳細は <span class="tbd">近日公開</span> です。</p></article>
      <article class="card rv"><p class="card__no">04</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">同じ立場の仲間がいます</h3><p class="card__b">初心者向けの交流会・ラウンド会をご用意します。「みんな初めて」なら、コースデビューも怖くありません。</p></article>
      <article class="card rv"><p class="card__no">05</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">数字が、上達を教えてくれます</h3><p class="card__b">シミュレーターのデータで、飛距離も方向も記録されます。先週より良くなっていることが、はっきり見えます。</p></article>
      <article class="card rv"><p class="card__no">06</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">気まずくならない空気</h3><p class="card__b">上手い人が偉い場所にはしません。スコアで値踏みされることも、知ったかぶりを求められることもありません。</p></article>
    </div>
  </div>
</section>

<section class="sec">
  <div class="wrap" style="max-width:880px">
    <div class="center rv">
      <p class="eyebrow">FAQ</p>
      <h2 class="h-en">BEFORE YOU COME</h2>
      <p class="h-jp">はじめての方からのご質問</p>
    </div>
    <div class="faq rv" style="margin-top:40px">
""" + faq_items([
        ("まったくの初心者ですが、大丈夫でしょうか。",
         "はい。むしろ、これから始める方をいちばん歓迎しています。クラブの握り方からプロがお伝えします。"),
        ("クラブを持っていません。",
         "お持ちでなくても始められます。レンタルの有無や内容については近日公開いたします。"),
        ("服装はどうすればいいですか。",
         "動きやすい服装でお越しください。ドレスコードはありません。ラウンジも練習着のままで結構です。"),
        ("周りが上手い人ばかりで気まずくないですか。",
         "「上手い人が偉い場所にしない」ことを、FRANK GOLFのいちばんの方針にしています。少人数制なので、そもそも隣が気になりません。"),
        ("一人で行っても大丈夫ですか。",
         "ほとんどの方が、お一人でいらっしゃいます。ラウンジもカウンター中心で、お一人で過ごしやすい設計です。もちろん、誰とも話さずに帰っていただいても構いません。"),
    ]) + """
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("beginner.html", b)


def build_corporate():
    b = head("法人でのご利用｜FRANK GOLF",
             "接待・商談、福利厚生、法人交流。打席とラウンジがひと続きのFRANK GOLFは、法人利用と相性のよい空間です。姫路・土山。",
             "corporate")
    b += page_head("法人でのご利用", "CORPORATE", "接待の前に、まずここで一度。",
                   "一緒に打って、そのまま座って話す。関係づくりが、姫路市内で完結します。")
    b += """
<section class="sec">
  <div class="wrap" style="max-width:820px">
    <div class="rv">
      <p class="lead" style="max-width:none">
        ゴルフが仕事に効くのは、18ホールを一緒に歩く間に、
        商談の席では出てこない話が出るからだと思います。<br><br>
        FRANK GOLFは、打席とバー・ラウンジがひと続きになっています。
        一緒に打って、そのまま座って話す。ゴルフ場に出る前の関係づくりが、
        姫路市内で、2時間で完結します。
      </p>
    </div>
  </div>
</section>

<section class="sec sec--alt">
  <div class="wrap">
    <div class="grid grid--3">
      <article class="card rv"><p class="card__no">01</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">接待・商談で</h3><p class="card__b">打ってから、ラウンジでそのままお話まで。ゴルフの話から入れるので、最初から堅い空気になりません。天候にも左右されません。</p></article>
      <article class="card rv"><p class="card__no">02</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">福利厚生として</h3><p class="card__b">社員の方が個々にご利用いただけます。ゴルフを始めたい社員の受け皿として、また部署を越えた交流のきっかけとして。</p></article>
      <article class="card rv"><p class="card__no">03</p><h3 class="card__t-jp" style="font-size:17px;color:var(--txt-str)">法人同士の交流</h3><p class="card__b">姫路の経営者・ビジネスパーソンが集まる場として、法人交流イベントを企画します。名刺交換の場ではなく、ゴルフを介した自然なつながりを。</p></article>
    </div>
    <div class="spec rv" style="margin-top:44px">
      <div class="spec__row"><p class="spec__k">法人ライトプラン</p><p class="spec__v" data-frank="price.corporate.0.price">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">法人プレミアムプラン</p><p class="spec__v" data-frank="price.corporate.1.price">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">ご利用人数</p><p class="spec__v" data-frank="store.bays">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">貸切利用</p><p class="spec__v" data-frank="lounge.note">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">ラウンジのご利用時間</p><p class="spec__v" data-frank="lounge.hours">近日公開</p></div>
    </div>
    <p class="lead rv" style="margin-top:28px">
      法人でのご利用に関するご相談は、公式LINEから承ります。
    </p>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("corporate.html", b)


def build_access():
    b = head("アクセス｜FRANK GOLF",
             "FRANK GOLF は姫路・土山に2026年9月2日プレオープン。所在地・営業時間・駐車場のご案内。",
             "access")
    b += page_head("アクセス", "ACCESS", "姫路・土山",
                   "2026年9月2日プレオープン。詳細は決まり次第お知らせいたします。")
    b += """
<section class="sec">
  <div class="wrap">
    <div class="grid grid--2" style="gap:48px">
      <div class="rv">
        <div class="spec">
          <div class="spec__row"><p class="spec__k">店舗名</p><p class="spec__v">FRANK GOLF</p></div>
          <div class="spec__row"><p class="spec__k">エリア</p><p class="spec__v">姫路・土山</p></div>
          <div class="spec__row"><p class="spec__k">所在地</p><p class="spec__v"><span data-frank="store.postal" data-frank-hide></span><span data-frank="store.address">近日公開</span></p></div>
          <div class="spec__row"><p class="spec__k">電話番号</p><p class="spec__v"><a data-tel>近日公開</a></p></div>
          <div class="spec__row"><p class="spec__k">営業時間</p><p class="spec__v" data-frank="store.hours">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">定休日</p><p class="spec__v" data-frank="store.holiday">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">駐車場</p><p class="spec__v" data-frank="store.parking">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">アクセス</p><p class="spec__v" data-frank="store.access">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">プレオープン</p><p class="spec__v"><span data-preopen>2026年9月2日</span></p></div>
          <div class="spec__row"><p class="spec__k">グランドオープン</p><p class="spec__v" data-frank="preopen.grandOpenDate">2026年9月5日</p></div>
          <div class="spec__row"><p class="spec__k">運営</p><p class="spec__v" data-frank="store.company">株式会社YOZAN</p></div>
        </div>
      </div>
      <div class="rv">
        <div class="card" data-map style="padding:0;min-height:420px;display:flex;align-items:center;justify-content:center">
          <p class="tbd" style="padding:30px;text-align:center">地図は近日公開いたします<br><span style="font-size:12px;opacity:.7">2026年9月2日プレオープン／姫路・土山</span></p>
        </div>
        <p class="lead" style="margin-top:18px;font-size:13px">
          正確な所在地・アクセス方法が決まり次第、こちらに掲載いたします。公式LINEでもお知らせいたします。
        </p>
      </div>
    </div>

    <div class="rv" style="margin-top:64px">
      <p class="eyebrow">Service Area</p>
      <h2 class="h-en" style="font-size:clamp(1.6rem,4vw,2.4rem)">対応エリア</h2>
      <p class="lead">
        姫路市・土山を中心に、周辺エリアからも通いやすい立地を予定しています。
        姫路市南部（土山・御着・別所）、たつの市、太子町、揖保郡、高砂市、加古川市方面からのご来店を想定しています。
      </p>
      <ul class="grid grid--4" style="margin-top:24px;gap:12px">
        <li class="card" style="padding:18px 20px;text-align:center"><span style="color:var(--brass-2)">姫路市</span></li>
        <li class="card" style="padding:18px 20px;text-align:center"><span style="color:var(--brass-2)">たつの市</span></li>
        <li class="card" style="padding:18px 20px;text-align:center"><span style="color:var(--brass-2)">太子町</span></li>
        <li class="card" style="padding:18px 20px;text-align:center"><span style="color:var(--brass-2)">揖保郡</span></li>
        <li class="card" style="padding:18px 20px;text-align:center"><span style="color:var(--brass-2)">高砂市</span></li>
        <li class="card" style="padding:18px 20px;text-align:center"><span style="color:var(--brass-2)">加古川市</span></li>
      </ul>
      <p class="lead" style="font-size:12.5px;margin-top:16px">
        ※ インドアゴルフ練習場・ゴルフレッスンをお探しの方は、まずは体験・公式LINEでご相談ください。
      </p>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("access.html", b)


def build_faq():
    b = head("よくあるご質問｜FRANK GOLF",
             "FRANK GOLF についてよくいただくご質問。初心者の方、一人での利用、予約方法、ラウンジについてなど。",
             "faq", jsonld=jsonld_faq(ALL_FAQ))
    b += page_head("よくあるご質問", "FAQ", "よくあるご質問",
                   "こちらにないご質問は、公式LINEからお気軽にどうぞ。")
    b += """
<section class="sec">
  <div class="wrap" style="max-width:880px">
    <div class="faq rv">
""" + faq_items(ALL_FAQ) + """
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("faq.html", b)


def build_trial():
    b = head("体験のご予約｜FRANK GOLF",
             "FRANK GOLF の体験のご予約。2026年9月2日、姫路・土山にプレオープン。公式LINEからのご相談も承ります。",
             "trial")
    b += page_head("体験のご予約", "TRIAL", "まずは、一度打ちに来てください。",
                   "合うかどうかは、来てみるのがいちばん早いと思います。")
    b += f"""
<section class="sec">
  <div class="wrap" style="max-width:820px">
    <div class="rv">
      <p class="lead" style="max-width:none">
        ホームページでどれだけ言葉を尽くしても、伝わらないものがあります。
        打席の広さ、ボールの音、ラウンジの照明の感じ、そこにいる人たちの空気。<br><br>
        {PREOPEN}、姫路・土山にプレオープンいたします。
        まずは一度、打ちに来てください。少し話して、合いそうだと思っていただけたら、それがいちばんです。
      </p>
    </div>

    <!-- ご予約の流れ -->
    <div class="rv" style="margin-top:56px">
      <p class="eyebrow">How to Book</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">ご予約の流れ</h2>
    </div>

    <div class="rv" style="margin-top:28px">
      <p class="card__t-jp" style="font-size:15px;color:var(--brass-2);margin-bottom:6px">はじめての方（体験）</p>
      <div class="flow">
        <div class="flow__i"><p class="flow__n">STEP 01</p><div><h3 class="flow__t">体験を予約する</h3><p class="flow__b">下の「体験予約」または「公式LINEで相談」から。ご希望の日時をお知らせください。プレオープン日に向けて順次受付いたします。</p></div></div>
        <div class="flow__i"><p class="flow__n">STEP 02</p><div><h3 class="flow__t">ご来店・受付</h3><p class="flow__b">姫路・土山の店舗へ。手ぶらでも大丈夫です（クラブレンタルの有無は近日公開）。</p></div></div>
        <div class="flow__i"><p class="flow__n">STEP 03</p><div><h3 class="flow__t">体験＆プロのワンポイント</h3><p class="flow__b">実際に打って、シミュレーターのデータを見ながら、常駐プロが5〜10分のワンポイント。上達の手ごたえをその場で。</p></div></div>
        <div class="flow__i"><p class="flow__n">STEP 04</p><div><h3 class="flow__t">フランクに入会のご案内</h3><p class="flow__b">強引な勧誘はしません。合いそうだと思っていただけたら、その場でご入会いただけます（持ち帰り検討も歓迎）。</p></div></div>
      </div>
    </div>

    <div class="rv" style="margin-top:44px">
      <p class="card__t-jp" style="font-size:15px;color:var(--brass-2);margin-bottom:6px">会員の方（入会後の打席予約）</p>
      <div class="flow">
        <div class="flow__i"><p class="flow__n">STEP 01</p><div><h3 class="flow__t">会員ログイン</h3><p class="flow__b">会員番号と生年月日でログイン。<a data-link="links.memberLogin" style="color:var(--brass-2)">会員ログイン ↗</a></p></div></div>
        <div class="flow__i"><p class="flow__n">STEP 02</p><div><h3 class="flow__t">Web予約で打席を確保</h3><p class="flow__b">スマホから空き時間を選んで予約完了。<a data-link="links.memberBooking" style="color:var(--brass-2)">Web予約 ↗</a></p></div></div>
        <div class="flow__i"><p class="flow__n">STEP 03</p><div><h3 class="flow__t">スマート入退室でそのまま打席へ</h3><p class="flow__b">完全予約制なので待ち時間なし。予約した時間に、そのまま練習に入れます。</p></div></div>
      </div>
      <p class="lead" style="font-size:12.5px;margin-top:14px">※ ご入会後、会員ページからWeb予約をご利用いただけます。<a data-link="links.memberRegister" style="color:var(--brass-2)">はじめての会員登録はこちら ↗</a></p>
    </div>

    <!-- 体験のお申し込み（member-os の体験フォームへ） -->
    <div class="rv" style="margin-top:56px">
      <p class="eyebrow">Trial Booking</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">体験のお申し込み</h2>
      <p class="lead">お申し込みフォームで、お名前・ご連絡先・ご希望日時（第1〜第3希望）をお送りください。折り返し担当より、日程確定のご連絡を差し上げます（プレオープン日に向けて順次対応）。</p>
    </div>

    <div class="grid grid--2 rv" style="margin-top:36px;gap:24px;align-items:stretch">
      <article class="card" style="padding:38px 34px;display:flex;flex-direction:column">
        <p class="card__no">01</p>
        <h3 class="card__t">BOOK</h3>
        <p class="card__t-jp">体験を申し込む</p>
        <p class="card__b" style="margin:12px 0 26px;flex:1">フォームからご希望日時をお送りください。当日は打席での練習＋常駐プロのワンポイント（5〜10分）をご体験いただけます。</p>
        <a class="btn btn--brass" href="#" data-cta="trial">体験を申し込む</a>
      </article>
      <article class="card" style="padding:38px 34px;display:flex;flex-direction:column">
        <p class="card__no">02</p>
        <h3 class="card__t">ASK</h3>
        <p class="card__t-jp">迷ったら、まず相談でも</p>
        <p class="card__b" style="margin:12px 0 26px;flex:1">料金は？　初心者でも大丈夫？　見学だけでも？　なんでもお気軽に。公式LINEでお答えします。</p>
        <a class="btn btn--line" href="#" data-cta="line">公式LINEで相談</a>
      </article>
    </div>

    <div class="spec rv" style="margin-top:44px">
      <div class="spec__row"><p class="spec__k">体験利用料</p><p class="spec__v" data-frank="price.trialFee">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">体験の内容</p><p class="spec__v" data-frank="trial.content" data-frank-fallback="打席での練習＋常駐プロのワンポイント（5〜10分）">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">持ち物</p><p class="spec__v" data-frank="trial.bring" data-frank-fallback="手ぶらでOK（クラブレンタルの有無は近日公開）">近日公開</p></div>
    </div>

    <div class="spec rv" style="margin-top:48px">
      <div class="spec__row"><p class="spec__k">所要時間</p><p class="spec__v" data-frank="trial.duration">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">プレオープン特典</p><p class="spec__v" data-frank="preopen.benefits">近日公開</p></div>
    </div>

    <div class="note-solo rv">
      <p class="note-solo__t">体験の日に、無理にラウンジへお通しすることはありません。</p>
      <p class="note-solo__b">
        打つだけ打って、お帰りいただいて構いません。ラウンジを覗いてみたい方には、もちろんご案内します。
        どちらでも、こちらから勧誘することはありません。
      </p>
    </div>
  </div>
</section>

<section class="sec sec--alt">
  <div class="wrap" style="max-width:880px">
    <div class="center rv">
      <p class="eyebrow">Member Site</p>
      <h2 class="h-en">ALREADY A MEMBER?</h2>
      <p class="h-jp">会員の方はこちら</p>
    </div>
    <div class="grid grid--3 rv" style="margin-top:40px">
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">LOGIN</h3><p class="card__b" style="margin:12px 0 20px">会員番号と生年月日でログイン</p><a class="btn btn--ghost btn--sm" data-link="links.memberLogin">会員ログイン</a></article>
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">BOOKING</h3><p class="card__b" style="margin:12px 0 20px">打席のWeb予約・キャンセル</p><a class="btn btn--ghost btn--sm" data-link="links.memberBooking">Web予約</a></article>
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">REGISTER</h3><p class="card__b" style="margin:12px 0 20px">はじめての方の会員登録</p><a class="btn btn--ghost btn--sm" data-link="links.memberRegister">Web会員登録</a></article>
    </div>
  </div>
</section>
"""
    b += foot()
    write("trial.html", b)



def build_tokushoho():
    b = head("特定商取引法に基づく表記｜FRANK GOLF",
             "FRANK GOLF の特定商取引法に基づく表記。",
             "tokushoho")
    b += page_head("特定商取引法に基づく表記", "LEGAL NOTICE", "特定商取引法に基づく表記")
    b += """
<section class="sec">
  <div class="wrap" style="max-width:880px">
    <div class="rv draft-note">
      <p class="draft-note__t">この表記は準備中の草案です</p>
      <p class="draft-note__b">
        記載内容が確定しておらず、法務確認も未了です。<strong>Web上での入会申込・決済を開始する前に、
        必ず内容を確定し、専門家の確認を受けてください。</strong>
      </p>
    </div>
    <div class="spec rv" style="margin-top:36px">
      <div class="spec__row"><p class="spec__k">販売事業者</p><p class="spec__v" data-frank="store.company">株式会社YOZAN</p></div>
      <div class="spec__row"><p class="spec__k">運営統括責任者</p><p class="spec__v"><span class="tbd">近日公開</span></p></div>
      <div class="spec__row"><p class="spec__k">所在地</p><p class="spec__v"><span data-frank="store.postal" data-frank-hide></span><span data-frank="store.address">近日公開</span></p></div>
      <div class="spec__row"><p class="spec__k">電話番号</p><p class="spec__v"><a data-tel>近日公開</a></p></div>
      <div class="spec__row"><p class="spec__k">メールアドレス</p><p class="spec__v" data-frank="store.email">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">販売価格</p><p class="spec__v">各会員プランの料金は<a href="plan.html" style="color:var(--brass-2)">料金ページ</a>に記載（<span class="tbd">近日公開</span>）</p></div>
      <div class="spec__row"><p class="spec__k">商品代金以外の必要料金</p><p class="spec__v"><span class="tbd">近日公開</span></p></div>
      <div class="spec__row"><p class="spec__k">支払方法</p><p class="spec__v"><span class="tbd">近日公開</span></p></div>
      <div class="spec__row"><p class="spec__k">支払時期</p><p class="spec__v"><span class="tbd">近日公開</span></p></div>
      <div class="spec__row"><p class="spec__k">サービスの提供時期</p><p class="spec__v"><span class="tbd">近日公開</span></p></div>
      <div class="spec__row"><p class="spec__k">返品・キャンセル</p><p class="spec__v"><span class="tbd">近日公開</span></p></div>
      <div class="spec__row"><p class="spec__k">退会について</p><p class="spec__v"><span class="tbd">近日公開</span></p></div>
    </div>
  </div>
</section>
"""
    b += foot()
    write("tokushoho.html", b)


def build_privacy():
    b = head("プライバシーポリシー｜FRANK GOLF",
             "FRANK GOLF における個人情報の取り扱いについて。",
             "privacy")
    b += page_head("プライバシーポリシー", "PRIVACY POLICY", "個人情報の取り扱いについて")
    b += """
<section class="sec">
  <div class="wrap" style="max-width:820px">
    <div class="rv draft-note">
      <p class="draft-note__t">この文書は準備中の草案です</p>
      <p class="draft-note__b">
        一般的な構成に沿った下書きであり、<strong>法務確認は未了です。</strong>
        実際の取得項目・利用目的・委託先（予約システム等）を確定のうえ、公開前に専門家の確認を受けてください。
      </p>
    </div>

    <div class="rv legal" style="margin-top:44px">
      <p class="legal__lead">
        <span data-frank="store.company">株式会社YOZAN</span>（以下「当社」）は、FRANK GOLF（以下「当施設」）の
        運営にあたり取得する個人情報について、以下のとおり取り扱います。
      </p>

      <h2 class="legal__h">1. 取得する情報</h2>
      <p class="legal__b">
        当施設では、体験のご予約、ご入会、打席のご予約、お問い合わせにあたり、お名前、フリガナ、生年月日、
        電話番号、メールアドレス、お支払いに関する情報などを取得する場合があります。
      </p>

      <h2 class="legal__h">2. 利用目的</h2>
      <p class="legal__b">取得した個人情報は、次の目的の範囲内で利用します。</p>
      <ul class="legal__ul">
        <li>ご予約の受付・確認・変更・キャンセルのご連絡</li>
        <li>会員資格の管理、会費のご請求</li>
        <li>レッスン・イベント等のサービス提供およびご案内</li>
        <li>お問い合わせへの回答</li>
        <li>サービス改善のための統計的分析（個人を特定しない形で行います）</li>
      </ul>

      <h2 class="legal__h">3. 第三者提供</h2>
      <p class="legal__b">
        法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供することはありません。
      </p>

      <h2 class="legal__h">4. 業務の委託</h2>
      <p class="legal__b">
        予約管理システム等の運用にあたり、必要な範囲で個人情報の取り扱いを外部に委託する場合があります。
        委託先に対しては、適切な監督を行います。
      </p>

      <h2 class="legal__h">5. 安全管理</h2>
      <p class="legal__b">
        個人情報の漏えい、滅失またはき損を防止するため、必要かつ適切な安全管理措置を講じます。
      </p>

      <h2 class="legal__h">6. 開示・訂正・削除のご請求</h2>
      <p class="legal__b">
        ご本人からの個人情報の開示、訂正、利用停止、削除のご請求については、
        下記のお問い合わせ先までご連絡ください。ご本人であることを確認のうえ、法令に従い対応いたします。
      </p>

      <h2 class="legal__h">7. 本ポリシーの変更</h2>
      <p class="legal__b">
        法令の改正やサービス内容の変更に伴い、本ポリシーを変更する場合があります。
        変更後の内容は本ページに掲載した時点から適用されます。
      </p>

      <h2 class="legal__h">8. お問い合わせ窓口</h2>
      <p class="legal__b">
        <span data-frank="store.company">株式会社YOZAN</span>　FRANK GOLF<br>
        <span data-frank="store.address">近日公開</span><br>
        TEL <a data-tel>近日公開</a>
      </p>

      <p class="legal__date">制定日: <span class="tbd">近日公開</span></p>
    </div>
  </div>
</section>
"""
    b += foot()
    write("privacy.html", b)



def build_terms():
    b = head("会員規約｜FRANK GOLF",
             "FRANK GOLF 会員規約。休会・退会の規定を含みます。",
             "terms")
    b += page_head("会員規約", "MEMBERSHIP TERMS", "会員規約")
    b += """
<section class="sec">
  <div class="wrap" style="max-width:820px">
    <div class="rv draft-note">
      <p class="draft-note__t">この規約は準備中の草案です</p>
      <p class="draft-note__b">
        一般的な会員制施設の構成に沿った下書きであり、<strong>内容の確定・法務確認は未了です。</strong>
        休会・退会の条件、会費、譲渡禁止などは、確定後に正式な条文へ差し替えます。実際の入会受付・課金の開始前に確定してください。
      </p>
    </div>

    <div class="rv legal" style="margin-top:44px">
      <p class="legal__lead">
        本規約は、<span data-frank="store.company">株式会社YOZAN</span>（以下「当社」）が運営する
        FRANK GOLF（以下「当施設」）の会員（以下「会員」）の利用条件を定めるものです。
        会員は、入会申込により本規約に同意したものとみなします。
      </p>

      <h2 class="legal__h">第1条（会員）</h2>
      <p class="legal__b">会員とは、本規約に同意し、所定の入会申込を行い、当社が入会を承認した個人または法人をいいます。当社は、当施設の運営上必要と判断した場合、入会をお断りすることがあります。</p>

      <h2 class="legal__h">第2条（会員種別・会費）</h2>
      <p class="legal__b">会員種別および月会費は、<a href="plan.html" style="color:var(--brass-2)">料金ページ</a>に定めるとおりです（表示金額は税抜）。会費は所定の方法により毎月お支払いいただきます。会費および各種料金は、経済情勢等により改定する場合があります。</p>

      <h2 class="legal__h">第3条（利用方法・予約）</h2>
      <p class="legal__b">会員は、会員種別ごとに定める範囲で当施設を利用できます。打席のご利用は、当社が定める予約システム（Web予約等）によりご予約ください。無断キャンセルが続く場合、当社は利用を制限することがあります。</p>

      <h2 class="legal__h">第4条（休会）</h2>
      <p class="legal__b">
        会員は、当社所定の方法により休会を申し出ることができます。休会・復会の条件、休会中の会費の取り扱い、申請の締切日等の詳細は
        <span class="tbd">近日公開（確定後に記載）</span> とします。
      </p>

      <h2 class="legal__h">第5条（退会）</h2>
      <p class="legal__b">
        会員は、当社所定の方法により退会を申し出ることができます。退会のお申し出の締切日、締切以降のお申し出における当月/翌月扱い、
        月会費の日割りの有無等の詳細は <span class="tbd">近日公開（確定後に記載）</span> とします。既にお支払いいただいた会費は、当社に責のある場合を除き返金いたしません。
      </p>

      <h2 class="legal__h">第6条（会員資格の停止・除名）</h2>
      <p class="legal__b">会員が本規約に違反した場合、会費の支払いを怠った場合、または当施設の秩序・信用を害する行為を行った場合、当社は事前の通知なく会員資格の停止または除名を行うことがあります。</p>

      <h2 class="legal__h">第7条（禁止事項）</h2>
      <p class="legal__b">会員は、会員資格の第三者への貸与・譲渡、他の会員・来店者への迷惑行為、設備の破損、営業妨害、その他当社が不適切と判断する行為を行ってはなりません。</p>

      <h2 class="legal__h">第8条（免責）</h2>
      <p class="legal__b">会員が当施設の利用に際して負傷し、または所持品の紛失・盗難等の損害を被った場合であっても、当社の故意または重大な過失による場合を除き、当社は責任を負いません。</p>

      <h2 class="legal__h">第9条（個人情報の取り扱い）</h2>
      <p class="legal__b">会員の個人情報は、<a href="privacy.html" style="color:var(--brass-2)">プライバシーポリシー</a>に従い適切に取り扱います。</p>

      <h2 class="legal__h">第10条（規約の変更）</h2>
      <p class="legal__b">当社は、必要に応じて本規約を変更することがあります。変更後の規約は、当施設内の掲示または本ページへの掲載をもって効力を生じるものとします。</p>

      <p class="legal__date">制定日: <span class="tbd">近日公開</span>　／　運営: <span data-frank="store.company">株式会社YOZAN</span></p>
    </div>
  </div>
</section>
"""
    b += foot()
    write("terms.html", b)


def build_404():
    b = head("ページが見つかりません｜FRANK GOLF",
             "お探しのページは見つかりませんでした。",
             "404")
    b += """
<section class="sec" style="padding-top:calc(var(--nav-h) + var(--bar-h) + 90px)">
  <div class="wrap center" style="max-width:640px">
    <p class="eyebrow">404</p>
    <h1 class="h-en">OB</h1>
    <p class="h-jp">お探しのページは見つかりませんでした。</p>
    <p class="lead">
      打ち直しましょう。下のボタンからトップへお戻りいただけます。
    </p>
    <div class="cta__btns" style="margin-top:34px">
      <a class="btn btn--ghost" href="index.html">トップへ戻る</a>
      <a class="btn btn--line" href="#" data-cta="line">公式LINEで相談</a>
    </div>
  </div>
</section>
"""
    b += foot()
    write("404.html", b)



def build_sitemap():
    """sitemap.xml / robots.txt。SITE_URL 未設定なら sitemap は出力しない
    （相対URLのsitemapは無効なため、嘘のURLを書くより出さない方が安全）"""
    if not SITE_URL:
        print("  skip sitemap.xml (SITE_URL 未設定 — ドメイン確定後に _build.py の SITE_URL を設定して再実行)")
        return
    urls = ["index.html", "concept.html", "facility.html", "lesson.html", "lounge.html",
            "community.html", "plan.html", "beginner.html", "corporate.html",
            "access.html", "faq.html", "trial.html", "tokushoho.html", "privacy.html", "terms.html"]
    body = "\n".join(
        f"  <url><loc>{abs_url(u)}</loc><priority>{'1.0' if u == 'index.html' else '0.7'}</priority></url>"
        for u in urls
    )
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{body}
</urlset>
'''
    write("sitemap.xml", xml)
    write("robots.txt", f"User-agent: *\nAllow: /\n\nSitemap: {abs_url('sitemap.xml')}\n")


# ==================================================================
if __name__ == "__main__":
    print("FRANK GOLF site build")
    build_index()
    build_concept()
    build_facility()
    build_lesson()
    build_lounge()
    build_community()
    build_plan()
    build_beginner()
    build_corporate()
    build_access()
    build_faq()
    build_trial()
    build_tokushoho()
    build_privacy()
    build_terms()
    build_404()
    build_sitemap()
    print("done.")
