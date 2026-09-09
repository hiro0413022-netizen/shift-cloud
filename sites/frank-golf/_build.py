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
    "trial-booking": "trial-booking.html",
    "lp-trial": "lp-trial.html", "lp-campaign": "lp-campaign.html",
    "tokushoho": "tokushoho.html", "privacy": "privacy.html", "terms": "terms.html", "404": "404.html",
}


def page_file(page):
    return PAGE_FILE.get(page, "index.html")


def page_url(page):
    """canonical / sitemap / パンくずに使う正規URL。ホームだけは index.html ではなく / （#229 SEO）。
    Google が https://frankgolf.jp/ と /index.html を別ページとして扱う二重化を防ぐ。"""
    if page == "home":
        return (SITE_URL.rstrip("/") + "/") if SITE_URL else "index.html"
    return abs_url(page_file(page))


PAGE_LABEL = {
    "concept": "コンセプト", "facility": "施設・設備", "lesson": "レッスン",
    "lounge": "バー・ラウンジ", "community": "コミュニティ", "plan": "料金・会員プラン",
    "beginner": "はじめての方へ", "corporate": "法人でのご利用", "access": "アクセス",
    "faq": "よくあるご質問", "trial": "体験のご予約", "trial-booking": "体験予約フォーム",
    "lp-trial": "無料体験レッスン", "lp-campaign": "年内入会キャンペーン",
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
        # #229: GolfCourse（＝屋外コース）は誤り。屋内練習施設＋スクールなので SportsActivityLocation。
        "@type": ["SportsActivityLocation", "LocalBusiness"],
        "@id": (SITE_URL.rstrip("/") + "/#business") if SITE_URL else "#business",
        "name": "FRANK GOLF",
        "alternateName": ["フランクゴルフ", "FRANK GOLF 姫路"],
        "description": "姫路・土山の会員制インドアゴルフラウンジ。練習打席・プロによるレッスン・"
                       "シミュレーターでのデータ分析・バーラウンジでの交流がひとつになった大人のためのゴルフ基地。"
                       "2026年9月オープン。",
        "slogan": "打って、教わって、語れる。姫路・土山のフランクなゴルフ基地。",
        "knowsAbout": ["インドアゴルフ", "ゴルフレッスン", "ゴルフシミュレーター", "スイング分析", "ゴルフバー"],
        "address": {
            "@type": "PostalAddress",
            "streetAddress": "土山6-6-1",
            "addressRegion": "兵庫県",
            "addressLocality": "姫路市",
            "postalCode": "670-0996",
            "addressCountry": "JP",
        },
        # Googleビジネスプロフィールのピンと同じ座標（2026-09-09 実測）
        "geo": {"@type": "GeoCoordinates", "latitude": 34.8327823, "longitude": 134.667118},
        "hasMap": "https://www.google.com/maps/search/?api=1&query=FRANK+GOLF+%E5%A7%AB%E8%B7%AF%E5%B8%82%E5%9C%9F%E5%B1%B16-6-1",
        "currenciesAccepted": "JPY",
        "paymentAccepted": "クレジットカード, 現金",
        "publicAccess": True,
        "makesOffer": [
            {"@type": "Offer", "name": "体験レッスン（約55分）", "price": "0", "priceCurrency": "JPY",
             "description": "通常3,300円（税込）のところ、プレオープン記念で無料。所属プロのマンツーマン。",
             "url": abs_url("trial.html")},
            {"@type": "Offer", "name": "ライト会員（月4回まで）", "price": "10780", "priceCurrency": "JPY",
             "priceSpecification": {"@type": "UnitPriceSpecification", "price": "10780", "priceCurrency": "JPY",
                                    "unitCode": "MON", "valueAddedTaxIncluded": True},
             "url": abs_url("plan.html")},
            {"@type": "Offer", "name": "レギュラー会員（1日1時間 通い放題）", "price": "15180", "priceCurrency": "JPY",
             "priceSpecification": {"@type": "UnitPriceSpecification", "price": "15180", "priceCurrency": "JPY",
                                    "unitCode": "MON", "valueAddedTaxIncluded": True},
             "url": abs_url("plan.html")},
            {"@type": "Offer", "name": "マスター会員（1日最大2時間）", "price": "21780", "priceCurrency": "JPY",
             "priceSpecification": {"@type": "UnitPriceSpecification", "price": "21780", "priceCurrency": "JPY",
                                    "unitCode": "MON", "valueAddedTaxIncluded": True},
             "url": abs_url("plan.html")},
            {"@type": "Offer", "name": "25分マンツーマンレッスン", "price": "2750", "priceCurrency": "JPY",
             "url": abs_url("lesson.html")},
        ],
        "employee": {
            "@type": "Person",
            "name": "小川 うらら",
            "alternateName": "らら",
            "jobTitle": "所属レッスンプロ / ゴルフコーチ",
            "hasCredential": [
                {"@type": "EducationalOccupationalCredential",
                 "credentialCategory": "USGTF レベルIII",
                 "recognizedBy": {"@type": "Organization", "name": "United States Golf Teachers Federation（USGTF）"}},
            ],
            "sameAs": "https://www.youtube.com/channel/UC4QTQjrDLsx4WF3fdYuLHZQ",
        },
        "areaServed": [{"@type": "City", "name": n} for n in AREA_SERVED],
        "parentOrganization": {"@type": "Organization", "name": "株式会社YOZAN"},
        "openingHoursSpecification": [
            {"@type": "OpeningHoursSpecification",
             "dayOfWeek": ["Monday", "Wednesday", "Thursday", "Friday"],
             "opens": "10:00", "closes": "22:00"},
            {"@type": "OpeningHoursSpecification",
             "dayOfWeek": ["Saturday", "Sunday"],
             "opens": "09:00", "closes": "20:00"},
        ],
        "priceRange": "¥¥",
        "amenityFeature": [
            {"@type": "LocationFeatureSpecification", "name": "駐車場20台（無料）", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "バーカウンター併設", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "ゴルフシミュレーター（全3打席／4打席目は増設予定）", "value": True},
            {"@type": "LocationFeatureSpecification", "name": "レフティ左右打席対応", "value": True},
        ],
        # 電話・SNSは2026-09-05に確定（site-data.js と同じ値をここにも置く＝検索結果に出る側）
        "telephone": "+81-79-260-6671",
        "sameAs": [
            "https://www.instagram.com/frank_golf_himeji",
            "https://lin.ee/yp2leQU",
        ],
        # 定休日=毎週火曜（openingHoursSpecification に火曜を含めないことで表現）
    }
    if SITE_URL:
        d["url"] = SITE_URL.rstrip("/") + "/"
        d["image"] = [abs_url("assets/ogp.png"), abs_url("assets/img/hero-1.jpg"), abs_url("assets/img/hero-2.jpg")]
    return json.dumps(d, ensure_ascii=False, separators=(",", ":"))


def jsonld_breadcrumb(page, label):
    """パンくずリスト（SEO）。SITE_URL 未設定でも相対itemで出す。"""
    import json
    items = [{"@type": "ListItem", "position": 1, "name": "ホーム",
              "item": page_url("home")}]
    if page != "home":
        items.append({"@type": "ListItem", "position": 2, "name": label,
                      "item": page_url(page)})
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
        ("column.html", "コラム・読みもの"),
    ]),
    ("VISIT", [
        ("plan.html", "料金・会員プラン"),
        ("beginner.html", "はじめての方へ"),
        ("corporate.html", "法人でのご利用"),
        ("access.html", "アクセス"),
        ("faq.html", "よくあるご質問"),
        ("terms.html", "会員規約"),
    ]),
    # 「入会のお申し込み」は導線の入口。以前は料金ページの本文にしか無く、
    # 見つけられなかった人が別系統の「Web会員登録」（仮会員）に流れて予約できない、
    # という事故になっていたため MEMBER の先頭に置く（2026-08-07）。
    ("MEMBER", [
        ("@links.joinWeb", "入会のお申し込み"),
        ("booking.html", "打席予約（会員様）"),
        ("@links.memberLogin", "会員ログイン"),
        ("trial-booking.html", "体験レッスンを予約"),
        ("trial.html", "体験の内容"),
    ]),
]


def head(title, desc, page, jsonld="", noindex=False, og_type="website"):
    """<head> と 告知バー・ヘッダー
    noindex=True … 検索結果に出したくないページ（会員専用の予約画面・広告LP・404）。
                   canonical も出さない（noindex と canonical の併用は矛盾シグナルになる）。"""
    ogp = abs_url("assets/ogp.png")
    canon_url = page_url(page)
    canonical = (f'<link rel="canonical" href="{canon_url}">\n' if (SITE_URL and not noindex) else "")
    og_url = f'<meta property="og:url" content="{canon_url}">\n' if SITE_URL else ""
    robots = "noindex,follow" if noindex else "index,follow,max-image-preview:large"
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
<meta name="google-site-verification" content="njgqkzKoh_eb6CZV84LxsT7y989O0Gr87etYLAPlWW4">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="format-detection" content="telephone=no">
<meta property="og:site_name" content="{BRAND}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="{og_type}">
{og_url}<meta name="robots" content="{robots}">
<meta name="geo.region" content="JP-28">
<meta name="geo.placename" content="姫路市">
<meta name="geo.position" content="34.8327823;134.667118">
<meta name="ICBM" content="34.8327823, 134.667118">
<meta property="og:image" content="{ogp}">
<meta property="og:image:alt" content="FRANK GOLF｜打って、教わって、語れる。姫路・土山のフランクなゴルフ基地。">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{ogp}">
<meta name="theme-color" content="#F7B32B">
{canonical}<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="assets/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
<script src="assets/site-data.js"></script>
{jsonld_tag}</head>
<body data-page="{page}">

<a class="skip" href="#main">本文へスキップ</a>

<!-- 1. プレオープン告知バー -->
<div class="notice-bar" role="status">
  <span class="notice-bar__tag">OPEN</span>
  <span>姫路・土山に<b>オープンしました</b>。いま<b>体験レッスン無料</b>（通常3,300円）</span>
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
        <a class="btn btn--ghost btn--sm" data-link="links.joinWeb">入会のお申し込み</a>
        <a class="btn btn--ghost btn--sm" href="booking.html">打席予約（会員様）</a>
        <a class="btn btn--ghost btn--sm" data-link="links.memberLogin">会員ログイン</a>
      </div>
    </nav>
    <div class="nav__tel">
      <a data-tel>近日公開</a>
      <small>受付 <span data-frank="store.hours" data-frank-fallback="営業時間内">営業時間内</span></small>
    </div>
    <div class="nav__cta">
      <a class="nav__member" data-link="links.memberLogin">MEMBER</a>
      <a class="btn btn--brass btn--sm" href="#" data-cta="trial">体験予約（無料）</a>
    </div>
    <button class="burger" aria-label="メニュー" aria-expanded="false"><span></span></button>
  </div>
</header>

<main id="main">
"""


def cta_block():
    """最終CTA（黄色い帯）。全ページ共通で最後に置く。"""
    return """
<!-- 最終CTA -->
<section class="band" id="contact">
  <div class="wrap rv">
    <p class="band__t">まずは、無料の体験レッスンから。</p>
    <p class="band__s">
      受付 → カウンセリング → 打席のご案内 → 体験レッスン → ご入会のご案内（約55分）<br>
      強引な勧誘はいたしません。手ぶらでお越しください。
    </p>
    <div class="cta__btns">
      <a class="btn btn--brass" href="#" data-cta="trial">体験レッスンを予約する</a>
      <a class="btn btn--line" href="#" data-cta="line">公式LINEで相談する</a>
    </div>
  </div>
</section>
"""


def offer_badge():
    """体験オファー（無料）の共通バッジ。値は site-data.js から流し込む。"""
    return """<div class="offer rv">
      <span class="offer__badge">TRIAL</span>
      <span class="offer__t">体験レッスン <b data-frank="trial.fee" data-frank-fallback="無料">無料</b></span>
      <span class="offer__s"><del>通常 3,300円 税込</del> ／ <span data-frank="trial.duration" data-frank-fallback="約55分">約55分</span>・手ぶらでOK</span>
    </div>"""


def sticky_cta():
    """スマホ下部の固定CTAバー（体験導線の主動線・全ページ共通）"""
    return """
<!-- 固定CTAバー（スマホ） -->
<div class="sticky-cta" data-sticky-cta hidden>
  <div class="sticky-cta__in">
    <p class="sticky-cta__txt">
      <span class="sticky-cta__main" data-sticky-main>体験レッスン 無料</span>
      <span class="sticky-cta__sub" data-sticky-sub>通常 3,300円 税込 ／ 約55分</span>
    </p>
    <a class="btn btn--brass" href="#" data-cta="trial">体験を予約</a>
    <a class="btn btn--line" href="#" data-cta="line" aria-label="公式LINEで相談">LINE</a>
  </div>
</div>
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
{sticky_cta()}
<!-- 17. フッター -->
<footer class="foot">
  <div class="wrap">
    <div class="line-band" data-line-band hidden>
      <div>
        <p class="line-band__t">LINEで、かんたんご相談</p>
        <p class="line-band__s">体験のご予約・持ち物・道順など、お気軽にどうぞ。</p>
      </div>
      <a class="btn" href="#" data-cta="line">公式LINEを友だち追加</a>
    </div>
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
        <!-- SNS導線（#218・2026-09-05）。お問い合わせがLINEしか無く、写真を見たい人の行き先が無かった -->
        <p class="foot__about" style="margin-top:10px">
          <a href="#" data-cta="line">公式LINE</a>
          ／
          <a data-link="links.instagram" target="_blank" rel="noopener">Instagram</a>
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



def floormap_fig(floor, title, w, h, caption, rooms):
    """フロアマップ1枚（webp＋pngフォールバック／クリックで原寸）。"""
    chips = "".join(f'<li>{r}</li>' for r in rooms)
    return f"""
    <figure class="fmap">
      <div class="fmap__head">
        <span class="fmap__floor">{floor}</span>
        <p class="fmap__t">{title}</p>
      </div>
      <a class="fmap__img" href="assets/img/floormap-{floor.lower()}.png" target="_blank" rel="noopener"
         aria-label="{floor}フロアマップを拡大表示">
        <picture>
          <source srcset="assets/img/floormap-{floor.lower()}.webp" type="image/webp">
          <img src="assets/img/floormap-{floor.lower()}.png" alt="{caption}"
               loading="lazy" width="{w}" height="{h}">
        </picture>
        <span class="fmap__zoom">タップで拡大</span>
      </a>
      <figcaption>
        <ul class="fmap__rooms">{chips}</ul>
      </figcaption>
    </figure>"""


def floorplan():
    """フロアマップ（実際の間取り図・1F/2Fの2枚）。"""
    f1 = floormap_fig(
        "1F", "受付・パッティング練習場・バーカウンター・A打席（DTECT）", 1600, 853,
        "FRANK GOLF 姫路・土山の1階フロアマップ。エントランス、受付、パッティング練習場、バーカウンター、ショップ、トイレ2室、スタッフルーム、A打席（シミュレーター付き）、2階へ上がる階段。",
        ["エントランス", "受付", "パッティング練習場", "バーカウンター",
         "ショップ", "A打席（DTECT）", "トイレ 2室", "2階へ上がる階段"])
    f2 = floormap_fig(
        "2F", "個室の打席（B・C・D）", 1600, 906,
        "FRANK GOLF 姫路・土山の2階フロアマップ。階段を挟んでB打席、C打席、D打席の3室。各室にシミュレータースクリーンとクラブスタンドを設置。",
        ["B打席（レフティ対応・TrackMan 4）", "C打席（OKONGOLF）", "D打席（増設予定）", "各室にシミュレーター"])
    return f"""<div class="floorplan rv">
  {f1}
  {f2}
  <p class="floorplan__note">※ オープン時は A・B・C の3打席で稼働します。<b>D打席はオープンから約3ヶ月後の増設を予定</b>しています。設営が完了しだい、このページと公式LINEでお知らせいたします。<br>※ 什器の配置は変更になる場合があります。</p>
</div>"""


# ------------------------------------------------------------------
# site-data.js の値を静的HTMLに焼き込む（#229 SEO）
# ------------------------------------------------------------------
# これまで住所・営業時間・料金は site.js が実行時に流し込んでいたため、
# HTMLソース上は「近日公開」のままだった。Googlebot は JS を後回しに描画するので、
# 地域名・料金といった検索に効く文字列が初回クロールに入らない。
# ここでビルド時に同じ値を差し込んでおく（site.js は従来どおり上書きするので表示は変わらない）。
_SITE_DATA = None


def site_data():
    global _SITE_DATA
    if _SITE_DATA is None:
        import subprocess, json
        js = "global.window={};require(process.argv[1]);process.stdout.write(JSON.stringify(window.FRANK||{}))"
        try:
            out = subprocess.run(["node", "-e", js, os.path.join(HERE, "assets", "site-data.js")],
                                 capture_output=True, text=True, check=True, encoding="utf-8").stdout
            _SITE_DATA = json.loads(out)
        except Exception as e:  # node が無い環境でもビルド自体は通す
            print("  !! site-data.js を読めませんでした（焼き込みをスキップ）:", e)
            _SITE_DATA = {}
    return _SITE_DATA


def _pick(path):
    cur = site_data()
    for k in path.split("."):
        if isinstance(cur, list) and k.isdigit():
            cur = cur[int(k)] if int(k) < len(cur) else None
        elif isinstance(cur, dict):
            cur = cur.get(k)
        else:
            return None
        if cur is None:
            return None
    return cur


def _esc(t):
    return str(t).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _with_tax(text):
    """site.js の withTax と同じ出力（税込を小さく併記）"""
    import re as _re
    h = _esc(text)
    nums = [int(n.replace(",", "")) for n in _re.findall(r"([0-9][0-9,]*)円", h)]
    nums = [n for n in nums if n]
    if not nums:
        return h
    tag = lambda v: '<small class="tax">（税込 %s円）</small>' % format(int(v * 1.10 + 0.5), ",")
    if len(nums) == 1:
        return h + tag(nums[0])
    return _re.sub(r"([0-9][0-9,]*)円",
                   lambda m: m.group(0) + (tag(int(m.group(1).replace(",", ""))) if int(m.group(1).replace(",", "") or 0) else ""),
                   h)


def bake_site_data(html):
    import re as _re

    def fill(m):
        tag, attrs, inner = m.group(1), m.group(2), m.group(3)
        key = _re.search(r'data-frank="([^"]+)"', attrs).group(1)
        v = _pick(key)
        if v is None or v == "":
            if "data-frank-hide" in attrs:
                return f"<{tag}{attrs}></{tag}>"
            return m.group(0)  # 未確定 → 作者が書いた「近日公開」等をそのまま
        if isinstance(v, list):
            inner = "".join("<li>%s</li>" % _esc(i) for i in v)
        elif isinstance(v, (dict, bool)):
            return m.group(0)
        elif "data-tax" in attrs:
            inner = _with_tax(v)
        else:
            inner = _esc(v)
        return f"<{tag}{attrs}>{inner}</{tag}>"

    html = _re.sub(r'<(\w+)((?:\s[^<>]*?)?\sdata-frank="[^"]+"[^<>]*)>(.*?)</\1>', fill, html, flags=_re.S)

    tel = _pick("store.tel")
    if tel:
        html = html.replace('<a data-tel>近日公開</a>', f'<a data-tel href="tel:{tel.replace("-", "")}">{tel}</a>')
    for key in ("links.instagram", "store.mapUrl", "links.line"):
        v = _pick(key)
        if v:
            html = html.replace(f'<a data-link="{key}"', f'<a data-link="{key}" href="{v}"')
    line = _pick("links.line")
    if line:
        html = html.replace('href="#" data-cta="line"', f'href="{line}" data-cta="line" target="_blank" rel="noopener"')
    trial = _pick("links.trialBooking")
    if trial:
        html = html.replace('href="#" data-cta="trial"', f'href="{trial}" data-cta="trial"')
    join = _pick("links.joinWeb")
    if join:
        html = html.replace('<a data-link="links.joinWeb"', f'<a data-link="links.joinWeb" href="{join}"')
    # ホームへのリンクは / に統一（canonical と揃える）
    html = html.replace('href="index.html"', 'href="/"')
    return html


def write(name, body):
    path = os.path.join(HERE, name)
    if name.endswith(".html"):
        body = bake_site_data(body)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(body)
    print("  wrote", name, "(%d bytes)" % len(body.encode("utf-8")))


# ==================================================================
# 各ページの本文
# ==================================================================

def build_index():
    """トップページ（ポップ版）

    方針: 初心者向けスクールのトップページに寄せた構成。
      ヒーロー → キャンペーン2枚 → リード → レッスン紹介 → 魅力3つ →
      料金 → 体験CTA帯 → 施設 → こんな方へ → 新着情報
    ★ 各ブロックの文章は2〜4行まで。詳しい話は下層ページに逃がすこと。
    """
    b = head(
        "姫路のインドアゴルフ・ゴルフスクール｜FRANK GOLF（土山）｜体験レッスン無料",
        "姫路市土山のインドアゴルフスクール FRANK GOLF（フランクゴルフ）。TrackMan 4など最新シミュレーター3打席、所属レッスンプロのマンツーマンレッスン、駐車場20台無料。月額9,800円〜。体験レッスン（約55分）は通常3,300円のところ無料。",
        "home",
        jsonld=jsonld_business(),
    )

    # ---------- 1. ヒーロー ----------
    b += f"""
<!-- 1. ヒーロー -->
<section class="phero">
  <div class="wrap phero__in">
    <div>
      <p class="pill pill--green">2026年9月 OPEN ／ 姫路・土山（駐車場20台無料）</p>
      <h1 class="phero__copy">
        <span class="s0">姫路・土山のインドアゴルフスクール</span>
        <span class="s1">ゴルフは、</span>
        <span class="s2">教わると<span class="hl">面白い</span>。</span>
      </h1>
      <p class="phero__lead">
        <span class="jb">クラブを握ったことが</span><wbr><span class="jb">なくても大丈夫。</span><br><wbr><span class="jb">所属プロが</span><wbr><span class="jb">マンツーマンで、</span><wbr><span class="jb">あなたの一球を見ます。</span>
      </p>
      <div class="phero__cta">
        <a class="btn btn--brass" href="#" data-cta="trial">体験レッスンを予約（無料）</a>
        <a class="btn btn--ghost" href="trial.html">体験の内容を見る</a>
      </div>
    </div>
    <div class="phero__pic">
      <div class="phero__stamp"><b>無料</b><span>TRIAL LESSON</span></div>
      <img data-img-src="hero" src="assets/img/hero-1.jpg" width="1600" height="900"
           alt="FRANK GOLF 姫路・土山の店舗外観。看板「ゴルフは、教わると面白い」・完全個室のインドアゴルフ練習場">
    </div>
  </div>
  <div class="wrap">
    <dl class="stats">
      <div><dt>体験レッスン</dt><dd>無料<small>／約55分</small></dd></div>
      <div><dt>打席</dt><dd>3<small>打席</small></dd></div>
      <div><dt>コーチ</dt><dd>所属プロ<small>常駐</small></dd></div>
      <div><dt>駐車場</dt><dd>20<small>台・無料</small></dd></div>
    </dl>
  </div>
</section>

<!-- 2. キャンペーン -->
<section class="sec" style="padding-top:clamp(36px,5vw,56px)">
  <div class="wrap">
    <div class="bnr2 rv">
      <a class="bnr bnr--y" href="#" data-cta="trial">
        <span class="bnr__lbl">FIRST TIME</span>
        <span class="bnr__big">体験レッスン<br>無料</span>
        <span class="bnr__note"><del>通常 3,300円（税込）</del> ／ 約55分・手ぶらでOK</span>
      </a>
      <a class="bnr bnr--g" href="plan.html">
        <span class="bnr__lbl">MEMBERSHIP</span>
        <span class="bnr__big">月額 9,800円〜<small class="tax">（税込 10,780円〜）</small></span>
        <span class="bnr__note">通い放題プランあり ／ 全営業日ご利用OK</span>
      </a>
    </div>
  </div>
</section>

<!-- 2.5 お悩みから探す（#229: 検索意図ごとの記事へ） -->
<section class="sec" style="padding-top:0">
  <div class="wrap rv">
    <p class="pill">FIND YOURS</p>
    <h2 class="ph" style="font-size:clamp(1.3rem,3.4vw,2rem)">あなたに近いものから、どうぞ。</h2>
    <ul class="intent-grid">
      <li><a href="himeji-golf-school-beginner.html"><b>初心者</b>なら<span>握り方から。手ぶらで体験</span></a></li>
      <li><a href="himeji-golf-lesson-women.html"><b>女性一人</b>でも<span>完全予約制・女性プロ在籍</span></a></li>
      <li><a href="himeji-golf-lesson-private.html"><b>マンツーマン</b>で直したい<span>所属プロ×TrackMan 4</span></a></li>
      <li><a href="himeji-golf-range-unlimited.html"><b>通い放題</b>で練習したい<span>月13,800円・1日1時間</span></a></li>
      <li><a href="indoor-golf-cost.html"><b>料金</b>を先に知りたい<span>初期費用と月額の内訳</span></a></li>
      <li><a href="himeji-golf-bar.html"><b>ゴルフバー</b>を探している<span>打席とバーがひと続き</span></a></li>
      <li><a href="corporate.html"><b>法人・接待</b>で使いたい<span>会社契約・同伴無料プラン</span></a></li>
      <li><a href="area.html"><b>たつの・太子・高砂・加古川</b>から<span>駐車場20台・平日22時まで</span></a></li>
    </ul>
  </div>
</section>

<!-- 3. リード -->
<section class="sec sec--alt">
  <div class="wrap center rv" style="max-width:760px">
    <p class="pill">CONCEPT</p>
    <h2 class="ph">上手くなるほど、<br>ゴルフは<span class="mk">楽しくなる</span>。</h2>
    <p class="ph-sub">
      <span class="jb">自己流だと</span><wbr><span class="jb">「何が悪いのか分からない」</span><wbr><span class="jb">ままになりがちです。</span><br><wbr><span class="jb">プロが見て、</span><wbr><span class="jb">データで確かめる。</span><wbr><span class="jb">だから、</span><wbr><span class="jb">変化がその日に分かります。</span>
    </p>
  </div>
</section>

<!-- 4. レッスン紹介 -->
<section class="sec">
  <div class="wrap">
    <div class="split rv">
      <div class="split__pic split__pic--sq">
        <img data-img-src="lessonPic" src="assets/img/lesson-rara.jpg" width="1200" height="1200"
             alt="FRANK GOLF 姫路のゴルフレッスン。所属プロ「らら」がボール位置から丁寧に指導">
      </div>
      <div>
        <p class="pill">LESSON</p>
        <h2 class="ph">所属レッスンプロが、<br>マンツーマンで。</h2>
        <p class="ph-sub">
          <span class="jb">USGTFレベルⅢ、</span><wbr><span class="jb">YouTube登録者6万人超の</span><wbr><span class="jb">「らら」プロが常駐。</span><br><wbr><span class="jb">握り方から、</span><wbr><span class="jb">スコアを縮める一点まで。</span><br><wbr><span class="jb">「今日はここだけ」に</span><wbr><span class="jb">絞って教えます。</span>
        </p>
        <p style="margin-top:26px"><a class="btn btn--ghost" href="lesson.html">レッスンの詳細</a></p>
      </div>
    </div>
  </div>
</section>

<!-- 5. FRANK GOLFの魅力 -->
<section class="sec sec--alt">
  <div class="wrap">
    <div class="center rv">
      <p class="pill">FEATURES</p>
      <h2 class="ph">FRANK GOLFの<span class="mk">3つの魅力</span></h2>
    </div>
    <div class="merits rv" style="margin-top:44px">
      <article class="merit">
        <div class="merit__pic">
          <span class="merit__no">01</span>
          <img data-img-src="bay" src="assets/img/play.jpg" width="760" height="500"
               alt="FRANK GOLF 姫路の完全予約制インドアゴルフ打席">
        </div>
        <div class="merit__body">
          <h3 class="merit__t">周りを気にせず打てる</h3>
          <p class="merit__b">完全予約制の3打席。順番待ちも人目もありません。左打ちの方専用の打席もあります。※4打席目はオープン約3ヶ月後に増設予定です。</p>
        </div>
      </article>
      <article class="merit">
        <div class="merit__pic">
          <span class="merit__no">02</span>
          <img data-img-src="sim" src="assets/img/hero-2.jpg" width="1600" height="900"
               alt="最新シミュレーターでコースデビュー対策ができるFRANK GOLF 姫路">
        </div>
        <div class="merit__body">
          <h3 class="merit__t">数字で上達が分かる</h3>
          <p class="merit__b">TrackManほか最新シミュレーターを完備。感覚ではなく弾道データで、直す一点がはっきりします。</p>
        </div>
      </article>
      <article class="merit">
        <div class="merit__pic">
          <span class="merit__no">03</span>
          <img data-img-src="lounge" src="assets/img/lounge.jpg" width="760" height="500"
               alt="打席とひと続きのバーラウンジ。ゴルフ仲間ができるFRANK GOLF 姫路">
        </div>
        <div class="merit__body">
          <h3 class="merit__t">ゴルフ仲間ができる</h3>
          <p class="merit__b">打ち終わったらそのままラウンジへ。一緒に回る仲間が自然に見つかります。一人で帰る日ももちろんOK。</p>
        </div>
      </article>
    </div>
    <p class="center rv" style="margin-top:36px"><a class="btn btn--ghost" href="concept.html">FRANK GOLFの魅力を詳しく</a></p>
  </div>
</section>

<!-- 6. 料金 -->
<section class="sec">
  <div class="wrap price-hero" style="max-width:900px">
    <div class="rv">
      <p class="pill">PRICE</p>
      <h2 class="ph">料金は、シンプルに<span class="mk">3プラン</span>。</h2>
    </div>
    <div class="rv" style="margin-top:32px">
      <div class="price-join">
        <span>入会金</span><b data-frank="price.joinFee" data-frank-fallback="近日公開">近日公開</b>
      </div>
      <p class="price-plus" style="color:var(--brass-2);font-weight:800">いまなら入会金無料＋入会月の月会費無料（2026年内のご入会）</p>
      <p class="price-plus">＋ お好きなプランの月額</p>
      <div class="price-list">
        <div class="price-card">
          <p class="price-card__n">LIGHT</p>
          <p class="price-card__jp">ライト</p>
          <p class="price-card__p">9,800<small>円／月</small></p>
          <p class="price-card__tax">税込 10,780円</p>
        </div>
        <div class="price-card price-card--feat">
          <span class="price-card__tag">いちばん人気</span>
          <p class="price-card__n">REGULAR</p>
          <p class="price-card__jp">レギュラー</p>
          <p class="price-card__p">13,800<small>円／月</small></p>
          <p class="price-card__tax">税込 15,180円</p>
        </div>
        <div class="price-card">
          <p class="price-card__n">MASTER</p>
          <p class="price-card__jp">マスター</p>
          <p class="price-card__p">19,800<small>円／月</small></p>
          <p class="price-card__tax">税込 21,780円</p>
        </div>
      </div>
      <p class="price-note">表示は月額・税抜です（カッコ内は税込／消費税10%）。法人プラン、レッスンチケットもご用意しています。</p>
      <p style="margin-top:26px"><a class="btn btn--ghost" href="plan.html">プラン・料金の詳細はこちら</a></p>
    </div>
  </div>
</section>

<!-- 7. 体験CTA帯 -->
<section class="band">
  <div class="wrap rv">
    <p class="band__t">まずは、無料の体験レッスンから。</p>
    <p class="band__s">日時を選ぶだけ、その場で予約が確定します（約55分・手ぶらでOK）</p>
    <div class="cta__btns">
      <a class="btn btn--brass" href="#" data-cta="trial">体験レッスンを予約する</a>
      <a class="btn btn--line" href="#" data-cta="line">公式LINEで相談</a>
    </div>
  </div>
</section>

<!-- 8. 施設 -->
<section class="sec">
  <div class="wrap">
    <div class="split split--rev rv">
      <div class="split__pic">
        <img data-img-src="sim" src="assets/img/hero-2.jpg" width="1600" height="900"
             alt="FRANK GOLF 姫路のシミュレーションゴルフ打席。コースラウンドも体験できる">
      </div>
      <div>
        <p class="pill">FACILITY</p>
        <h2 class="ph">コースデビューの<br>準備も、ここで。</h2>
        <p class="ph-sub">
          <span class="jb">シミュレーターで</span><wbr><span class="jb">実際のコースを回れます。</span><br><wbr><span class="jb">打席のとなりは</span><wbr><span class="jb">バーラウンジ。</span><br><wbr><span class="jb">練習のあとに、</span><wbr><span class="jb">その日の一球を語れる場所です。</span>
        </p>
        <p style="margin-top:26px"><a class="btn btn--ghost" href="facility.html">施設を詳しく見る</a></p>
      </div>
    </div>
  </div>
</section>

<!-- 9. こんな方へ -->
<section class="sec sec--alt">
  <div class="wrap" style="max-width:900px">
    <div class="center rv">
      <p class="pill">FOR YOU</p>
      <h2 class="ph">こんな方に、<br>来ていただきたい。</h2>
    </div>
    <div class="checks rv" style="margin-top:36px">
      <p class="check">クラブを握ったことがない、これから始める方</p>
      <p class="check">自己流で伸び悩んでいる方</p>
      <p class="check">練習ではできるのに、コースだと崩れる方</p>
      <p class="check">一緒にラウンドする仲間を見つけたい方</p>
      <p class="check">仕事帰りに、天気を気にせず打ちたい方</p>
    </div>
    <div class="note-solo rv">
      <p class="note-solo__t">一人で黙々と打ちたい日も、もちろん歓迎です。</p>
      <p class="note-solo__b">交流は「あってもいいもの」。ラウンジを素通りして帰っていただいて構いません。</p>
    </div>
  </div>
</section>

<!-- 基本情報（#229: 検索エンジン・AIが引用しやすい定義文＋一覧） -->
<section class="sec sec--alt">
  <div class="wrap rv" style="max-width:880px">
    <p class="pill">ABOUT</p>
    <h2 class="ph" style="font-size:clamp(1.3rem,3.4vw,2rem)">FRANK GOLF とは</h2>
    <p class="ph-sub" style="text-align:left">FRANK GOLF（フランクゴルフ）は、兵庫県姫路市土山にある会員制のインドアゴルフスクール・ラウンジです。TrackMan 4 など3台のシミュレーター打席、所属レッスンプロによるマンツーマンレッスン、バーカウンター併設のラウンジをひとつにし、株式会社YOZANが運営しています。2026年9月オープン。</p>
    <dl class="spec spec--wide">
      <div class="spec__row"><dt class="spec__k">所在地</dt><dd class="spec__v">〒670-0996 <span data-frank="store.address">兵庫県姫路市土山6-6-1</span></dd></div>
      <div class="spec__row"><dt class="spec__k">電話</dt><dd class="spec__v"><a data-tel>近日公開</a></dd></div>
      <div class="spec__row"><dt class="spec__k">営業時間</dt><dd class="spec__v" data-frank="store.hours">近日公開</dd></div>
      <div class="spec__row"><dt class="spec__k">定休日</dt><dd class="spec__v" data-frank="store.holiday">近日公開</dd></div>
      <div class="spec__row"><dt class="spec__k">駐車場</dt><dd class="spec__v" data-frank="store.parking">近日公開</dd></div>
      <div class="spec__row"><dt class="spec__k">打席・計測器</dt><dd class="spec__v" data-frank="store.simulator">近日公開</dd></div>
      <div class="spec__row"><dt class="spec__k">月会費（税抜）</dt><dd class="spec__v">ライト 9,800円（月4回）／ レギュラー 13,800円（1日1時間 通い放題）／ マスター 19,800円（1日最大2時間）</dd></div>
      <div class="spec__row"><dt class="spec__k">体験</dt><dd class="spec__v">無料（通常3,300円 税込）・約55分・手ぶらOK</dd></div>
      <div class="spec__row"><dt class="spec__k">運営</dt><dd class="spec__v" data-frank="store.company">株式会社YOZAN</dd></div>
    </dl>
  </div>
</section>

<!-- 10. 新着情報（0件なら自動で非表示） -->
<section class="sec" id="news" data-news-section hidden>
  <div class="wrap" style="max-width:880px">
    <div class="center rv">
      <p class="pill">NEWS</p>
      <h2 class="ph">新着情報</h2>
    </div>
    <ul class="news-pop rv" data-news style="margin-top:32px"></ul>
  </div>
</section>

<!-- 11. アクセス -->
<section class="sec sec--alt" id="access">
  <div class="wrap">
    <div class="split rv">
      <div class="split__pic" style="align-self:stretch">
        <div class="card map-frame map-frame--tall" data-map style="height:100%">
          <p class="tbd map-frame__tbd">地図は近日公開いたします</p>
        </div>
      </div>
      <div>
        <p class="pill">ACCESS</p>
        <h2 class="ph">姫路・土山。<br>駐車場20台。</h2>
        <div class="spec" style="margin-top:26px">
          <div class="spec__row"><p class="spec__k">所在地</p><p class="spec__v" data-frank="store.address">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">営業時間</p><p class="spec__v" data-frank="store.hours">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">定休日</p><p class="spec__v" data-frank="store.holiday">近日公開</p></div>
          <div class="spec__row"><p class="spec__k">駐車場</p><p class="spec__v" data-frank="store.parking">近日公開</p></div>
        </div>
        <p style="margin-top:26px"><a class="btn btn--ghost" href="access.html">アクセスの詳細</a></p>
      </div>
    </div>
  </div>
</section>

<!-- 12. よくあるご質問（3件だけ） -->
<section class="sec">
  <div class="wrap" style="max-width:820px">
    <div class="center rv">
      <p class="pill">FAQ</p>
      <h2 class="ph">よくあるご質問</h2>
    </div>
    <div class="faq rv" style="margin-top:32px">
      <details>
        <summary>まったくの初心者ですが、大丈夫でしょうか。</summary>
        <div class="faq__a">はい。クラブの握り方からプロがお伝えします。屋内なので人目も気になりません。</div>
      </details>
      <details>
        <summary>体験には何を持っていけばいいですか。</summary>
        <div class="faq__a">手ぶらで大丈夫です。動きやすい服装でお越しください。当日いただく費用もありません。</div>
      </details>
      <details>
        <summary>体験のあと、その場で入会しないといけませんか。</summary>
        <div class="faq__a">いいえ。強引な勧誘はいたしません。持ち帰ってご検討いただいて構いません。</div>
      </details>
    </div>
    <p class="center rv" style="margin-top:28px"><a class="btn btn--ghost" href="faq.html">すべてのご質問を見る</a></p>
  </div>
</section>
"""

    b += cta_block()
    b += foot()
    write("index.html", b)


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
     "はい。体験レッスン（約55分）をご用意しています。通常3,300円（税込）のところ、いまなら無料です。サイトのカレンダーからその場でご予約いただけます。ビジター利用の可否については、決まり次第お知らせいたします。"),
    ("予約はどのように取りますか。",
     "体験のご予約は、本サイトの「体験予約」ボタンから、カレンダーで日時を選ぶだけでその場で確定します（会員登録・ログイン不要）。会員の方の打席予約は、会員ログイン後のWeb予約からお取りいただけます。"),
    ("お酒が飲めなくてもラウンジは使えますか。",
     "もちろんです。ソフトドリンクもご用意します。ラウンジは、お酒を飲む場所というより、ゴルフの話をする場所だと考えています。"),
    ("場所はどこですか。駐車場はありますか。",
     "兵庫県姫路市土山6-6-1（〒670-0996）です。駐車場は20台・無料でご用意しています。営業時間は平日10:00〜22:00、土日祝9:00〜20:00、定休日は毎週火曜日です。"),
]

ALL_FAQ = HOME_FAQ + [
    ("姫路市外からでも通えますか。",
     "はい。お車でのご来店に便利な立地で、駐車場20台を無料でご用意しています。姫路市南部（土山・御着・別所）のほか、たつの市・太子町・高砂市・加古川市方面からのご来店も想定しています。"),
    ("レッスンは毎回受けられますか。",
     "会員の方は、所属プロによるワンポイントレッスン（約5分）を無料で受けられます。じっくり見てほしいときは25分のマンツーマンレッスン（2,500円・税抜）をチケット制でご利用いただけます。"),
    ("クラブを持っていません。",
     "お持ちでなくても始められます。体験レッスンは手ぶらでOKです。ご入会後のレンタルについては、受付でお気軽にお尋ねください。"),
    ("どんなシミュレーターがありますか。",
     "TrackMan 4・DTECT・OKONGOLF の3台を全3打席に備えています（うち1打席はレフティ左右打席対応）。飛距離やクラブ軌道などの数字を見ながら、感覚ではなくデータで練習できます。"),
    ("法人での利用はできますか。",
     "はい。接待・商談でのご利用、福利厚生としての導入、法人同士の交流の場としてのご利用を想定しています。詳しくは「法人でのご利用」をご覧いただくか、公式LINEからお問い合わせください。"),
    ("女性一人でも利用しやすいですか。",
     "はい。完全予約制で落ち着いた少人数制の環境です。ラウンジもカウンター中心で、お一人でも過ごしやすい設計にしています。"),
    ("見学だけでもできますか。",
     "はい。公式LINEまたはお電話（079-260-6671）でお気軽にご連絡ください。営業時間内であればご案内できます。"),
]


# ------------------------------------------------------------------
# 下層ページ
# ------------------------------------------------------------------
def build_concept():
    b = head("ブランドコンセプト｜姫路・土山のインドアゴルフ FRANK GOLF",
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
    b = head("施設・設備｜TrackMan 4 完備の姫路のインドアゴルフ練習場｜FRANK GOLF",
             "姫路・土山のインドアゴルフ FRANK GOLF の施設・設備。TrackMan 4・DTECT・OKONGOLF のシミュレーター3打席（レフティ対応打席あり）、バーカウンター併設のラウンジ、駐車場20台無料。",
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
      <p class="lead">1階は受付・パッティング練習場・バーカウンター・A打席。2階はB〜Dの個室打席。打席とバーがひと続きなので、打った熱が冷めないうちにそのまま語り合えます。</p>
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
      <div class="gallery__i"><img data-img-src="lesson" src="assets/img/lesson-rara-wide.jpg" alt="FRANK GOLF 姫路のレッスン。所属プロ「らら」がボール位置から指導する様子" loading="lazy" width="1200" height="800"><span class="gallery__cap">レッスン</span></div>
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
    b = head("姫路のゴルフレッスン｜所属プロのマンツーマン×データ分析｜FRANK GOLF（土山）",
             "姫路でゴルフレッスンなら FRANK GOLF（土山）。所属レッスンプロが常駐し、会員はワンポイントレッスンを無料で受けられます。25分マンツーマンは2,500円（税抜）。TrackMan 4 の数字でスイングを確かめる、初心者歓迎のゴルフスクールです。",
             "lesson")
    b += page_head("レッスン", "LESSON", "プロに教わる。データで確かめる。",
                   "自己流の限界は、たいてい「何が悪いか分からない」ところから来ます。")
    b += '<section class="sec" style="padding-top:0"><div class="wrap">' + media("lesson", "assets/img/lesson-rara-wide.jpg", "FRANK GOLF 姫路のゴルフレッスン。所属プロ「らら」がボール位置から指導する様子", "LESSON") + '</div></section>'

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
        <img src="assets/img/coach-rara.jpg" alt="FRANK GOLF 姫路の所属レッスンプロ 小川うらら（らら）" loading="lazy" width="1000" height="1250">
        <span class="media-cap">FRANK GOLF PRO / RARA</span>
      </div>
      <div>
        <p class="card__no">HEAD COACH</p>
        <h3 class="card__t" style="font-size:2rem">らら</h3>
        <p class="card__t-jp" style="margin-bottom:14px">小川 うらら ／ Urara OGAWA</p>
        <p class="coach__quals" style="margin-bottom:20px">
          <span class="qual qual--main">USGTF レベルⅢ</span><span class="qual">YouTube「RaRa LESSON」登録者6万人超</span>
        </p>
        <p class="card__b" style="margin-bottom:22px">
          <span class="jb">FRANK GOLFのメインコーチ。</span><wbr><span class="jb">チャンネル登録者数約6万人の</span><wbr><span class="jb">レッスン系YouTuber</span><wbr><span class="jb">「RaRa LESSON」として活動し、</span><wbr><span class="jb">ジュニア時代は全国大会に出場するなど</span><wbr><span class="jb">競技経験も豊富です。</span><wbr><strong style="color:var(--txt-str)">「何を直せばいいか分からない」から卒業。</strong><wbr><span class="jb">一人ひとりに寄り添って、</span><wbr><span class="jb">もっとゴルフが楽しくなるレッスンを</span><wbr><span class="jb">お届けします。</span>
        </p>
        <ul class="plan__f" style="font-size:13.5px">
          <li>USGTF（全米ゴルフ指導者連盟）レベルⅢ 認定</li>
          <li>YouTube「RaRa LESSON」チャンネル登録者6万人超</li>
          <li>ジュニア時代は全国大会に出場</li>
          <li>FRANK GOLF 姫路 メインコーチ</li>
        </ul>
        <p style="margin-top:20px"><a class="btn btn--ghost btn--sm" href="https://www.youtube.com/channel/UC4QTQjrDLsx4WF3fdYuLHZQ" target="_blank" rel="noopener">無料レッスン動画を見る（YouTube） ↗</a></p>
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
      <div class="spec__row"><p class="spec__k">レッスン料金</p><p class="spec__v" data-frank="price.lessonPrice" data-tax>近日公開</p></div>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("lesson.html", b)


def build_lounge():
    b = head("ゴルフバー・ラウンジ｜姫路でゴルフ談義ができるバー｜FRANK GOLF",
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
    b = head("会員コミュニティ・イベント｜姫路のゴルフ仲間づくり｜FRANK GOLF",
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
    b = head("料金・会員プラン｜姫路のインドアゴルフ 月額9,800円〜｜FRANK GOLF",
             "姫路・土山のインドアゴルフ FRANK GOLF の料金。ライト9,800円／レギュラー13,800円（1日1時間 通い放題）／マスター19,800円（税抜・月額）。法人プランあり。2026年内のご入会は入会金5,500円が無料。",
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
        <p class="plan__p"><span data-frank="price.plans.0.price" data-tax>近日公開</span></p>
        <ul class="plan__f" data-frank="price.plans.0.features"><li>月4回までのご利用（全営業日OK）</li><li>マイペースにゆったり練習したい方に</li></ul>
      </div>
      <div class="plan plan--feat">
        <span class="plan__badge">一番人気</span>
        <p class="plan__n">REGULAR</p>
        <p class="plan__n-jp">レギュラー会員</p>
        <p class="plan__p"><span data-frank="price.plans.1.price" data-tax>近日公開</span></p>
        <ul class="plan__f" data-frank="price.plans.1.features"><li>全営業日ご利用可能</li><li>1日1時間 通い放題</li><li>毎日練習して上達したい方に</li></ul>
      </div>
      <div class="plan">
        <p class="plan__n">MASTER</p>
        <p class="plan__n-jp">マスター会員</p>
        <p class="plan__p"><span data-frank="price.plans.2.price" data-tax>近日公開</span></p>
        <ul class="plan__f" data-frank="price.plans.2.features"><li>全営業日ご利用可能</li><li>1日最大2時間まで</li><li>たっぷり練習したい方に</li></ul>
      </div>
    </div>
    <div class="spec rv" style="margin-top:44px">
      <div class="spec__row"><p class="spec__k">法人ライトプラン</p><p class="spec__v"><span data-frank="price.corporate.0.price" data-tax>近日公開</span><br><span data-frank="price.corporate.0.desc"></span><br><a href="corporate.html" style="color:var(--brass-2)">法人でのご利用について ↗</a></p></div>
      <div class="spec__row"><p class="spec__k">法人プレミアムプラン</p><p class="spec__v"><span data-frank="price.corporate.1.price" data-tax>近日公開</span><br><span data-frank="price.corporate.1.desc"></span><br><a href="corporate.html" style="color:var(--brass-2)">法人でのご利用について ↗</a></p></div>
      <div class="spec__row"><p class="spec__k">レッスン料金</p><p class="spec__v" data-frank="price.lessonPrice" data-tax>近日公開</p></div>
      <div class="spec__row"><p class="spec__k">入会金</p><p class="spec__v" data-frank="price.joinFee" data-tax>近日公開</p></div>
      <div class="spec__row"><p class="spec__k">体験利用</p><p class="spec__v" data-frank="price.trialFee">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">ビジター利用</p><p class="spec__v" data-frank="price.visitorFee" data-tax>近日公開</p></div>
      <div class="spec__row"><p class="spec__k">プレオープン特典</p><p class="spec__v" data-frank="preopen.benefits">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">年内入会キャンペーン</p><p class="spec__v">入会金（税込5,500円）無料＋入会月の月会費無料。Web入会時に翌月・翌々月の2か月分の月会費をお支払いいただき、以後は毎月自動でのお支払いです。キャンペーンでのご入会は6か月間の継続をお願いしています。</p></div>
      <div class="spec__row"><p class="spec__k">備考</p><p class="spec__v" data-frank="price.note">近日公開</p></div>
    </div>
    <div class="center rv" style="margin-top:40px">
      <div class="cta__btns" style="justify-content:center">
        <a class="btn btn--brass" data-link="links.joinWeb">Webで入会を申し込む</a>
        <a class="btn btn--ghost" href="#" data-cta="trial">まずは体験する</a>
      </div>
      <p class="cta__note" style="margin-top:14px">Web入会は規約に同意・電子サインのうえ、その場でお支払いまで完了。会員番号が即時発行され、控え（PDF）をメールでお送りします。</p>
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
        <div><h3 class="flow__t">ご入会手続き</h3><p class="flow__b">プランをお選びいただき、お手続きを行います。ご来店時のほか、<a data-link="links.joinWeb" style="color:var(--brass-2)">Webでの入会申込 ↗</a>も可能です。Webなら規約同意・電子サイン・お支払いまでその場で完了し、会員番号が即時発行されます。</p></div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 04</p>
        <div>
          <h3 class="flow__t">会員登録・Web予約の開始</h3>
          <p class="flow__b">
            ご入会後は、会員ページからWeb予約をご利用いただけます。<br>
            <a data-link="links.joinWeb" style="color:var(--brass-2)">入会のお申し込み ↗</a>
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
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">LOGIN</h3><p class="card__b" style="margin:12px 0 20px">会員番号と電話番号下4桁でログイン</p><a class="btn btn--ghost btn--sm" data-link="links.memberLogin">会員ログイン</a></article>
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">BOOKING</h3><p class="card__b" style="margin:12px 0 20px">打席のWeb予約・キャンセル</p><a class="btn btn--ghost btn--sm" data-link="links.memberBooking">Web予約</a></article>
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">JOIN</h3><p class="card__b" style="margin:12px 0 20px">はじめての方のご入会</p><a class="btn btn--ghost btn--sm" data-link="links.joinWeb">入会のお申し込み</a></article>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("plan.html", b)


def build_beginner():
    b = head("ゴルフ初心者の方へ｜姫路で手ぶら・人目を気にせず始める｜FRANK GOLF",
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
    b = head("法人プラン・接待でのご利用｜姫路のインドアゴルフ FRANK GOLF",
             "法人ライト（月39,800円・ご利用者2名様）／法人プレミアム（月59,800円・ご利用者の人数制限なし・同伴無料）。ご利用者は入会後に会員ページからご登録いただけます。接待・商談、福利厚生、法人交流。姫路・土山。",
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
  </div>
</section>

<!-- ===== 法人プラン ===== -->
<section class="sec">
  <div class="wrap">
    <div class="rv" style="max-width:56ch">
      <p class="eyebrow">Corporate Plan</p>
      <h2 class="h-en">TWO PLANS</h2>
      <p class="h-jp">法人プランは2つです</p>
      <p class="lead">
        ご契約は会社名で1本。ご利用になる方をご登録いただき、社員証のように会員番号をお一人ずつお持ちいただきます。
      </p>
    </div>
    <div class="grid grid--2 rv" style="margin-top:44px">
      <div class="plan">
        <p class="plan__n">CORPORATE LIGHT</p>
        <p class="plan__n-jp">法人ライトプラン</p>
        <p class="plan__p"><span data-frank="price.corporate.0.price" data-tax>近日公開</span></p>
        <ul class="plan__f" data-frank="price.corporate.0.features"><li>ご利用者を2名様までご登録</li><li>打席のご予約は御社合計で4コマ（1コマ＝1時間）まで</li></ul>
      </div>
      <div class="plan plan--feat">
        <span class="plan__badge">同伴無料</span>
        <p class="plan__n">CORPORATE PREMIUM</p>
        <p class="plan__n-jp">法人プレミアムプラン</p>
        <p class="plan__p"><span data-frank="price.corporate.1.price" data-tax>近日公開</span></p>
        <ul class="plan__f" data-frank="price.corporate.1.features"><li>ご利用者は何名様でもご登録いただけます</li><li>打席のご予約は御社合計で8コマまで</li><li>同伴のビジター様は無料</li></ul>
      </div>
    </div>

    <div class="spec rv" style="margin-top:44px">
      <div class="spec__row"><p class="spec__k">ご登録できる人数</p><p class="spec__v">法人ライト 2名様まで ／ 法人プレミアム <strong>人数の制限はありません</strong>。<br>ご利用者のご登録・入れ替えは、ご担当者様が<strong>会員ページからいつでも</strong>行っていただけます（追加費用はいただきません。店頭へのご連絡も不要です）。</p></div>
      <div class="spec__row"><p class="spec__k">打席のご予約</p><p class="spec__v">先にお取りいただけるのは、御社合計で <strong>ライト4コマ・プレミアム8コマ</strong>（1コマ＝1時間）です。ご利用が済むと、また次のご予約をお取りいただけます。ご登録者どなたのご予約も、同じ枠から使います。</p></div>
      <div class="spec__row"><p class="spec__k">会員ページ</p><p class="spec__v">ご利用者お一人ずつに会員番号を発行します。ご自身の会員番号と電話番号の下4桁で会員ページにログインし、打席のご予約・会員証QR・レッスンカルテをご覧いただけます。<br>ご担当者様の会員ページには【ご利用者の管理】があり、ご登録の追加・入れ替えと、<strong>御社名義で今いくつご予約が入っているか</strong>をご確認いただけます。</p></div>
      <div class="spec__row"><p class="spec__k">同伴のビジター様</p><p class="spec__v">法人プレミアムは無料（回数の制限はありません）。法人ライトには同伴の無料枠はございません。</p></div>
      <div class="spec__row"><p class="spec__k">レッスン</p><p class="spec__v" data-frank="lesson.style">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">入会金</p><p class="spec__v" data-frank="price.joinFee" data-tax>近日公開</p></div>
      <div class="spec__row"><p class="spec__k">お支払い</p><p class="spec__v">クレジットカードでの毎月のお支払いです。ご請求は御社に1本で、ご利用者ごとの追加費用はいただきません。請求先のご住所・メールアドレスは、お申し込みのときにご担当者様と別に指定いただけます。</p></div>
      <div class="spec__row"><p class="spec__k">打席・設備</p><p class="spec__v" data-frank="store.bays">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">シミュレーター</p><p class="spec__v" data-frank="store.simulator">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">備考</p><p class="spec__v" data-frank="price.note">近日公開</p></div>
    </div>

    <div class="center rv" style="margin-top:40px">
      <div class="cta__btns" style="justify-content:center">
        <a class="btn btn--brass" data-link="links.joinWeb">法人プランで入会を申し込む</a>
        <a class="btn btn--ghost" href="#" data-cta="trial">まずは体験する</a>
      </div>
      <p class="cta__note" style="margin-top:14px">
        お申し込みフォームで「法人ライトプラン」「法人プレミアムプラン」をお選びください。
        ご入力いただくのは会社名・ご担当者様・請求先だけです。<strong>ご利用になる方は、まだ決まっていなくて構いません。</strong>
        ご入会後、ご担当者様の会員ページからいつでもご登録・入れ替えいただけます。
      </p>
    </div>
  </div>
</section>

<!-- ===== ご入会の流れ ===== -->
<section class="sec sec--alt">
  <div class="wrap">
    <div class="rv" style="max-width:56ch">
      <p class="eyebrow">How to Join</p>
      <h2 class="h-en">JOIN AS A COMPANY</h2>
      <p class="h-jp">法人でのご入会の流れ</p>
    </div>
    <div class="flow rv" style="margin-top:44px">
      <div class="flow__i">
        <p class="flow__n">STEP 01</p>
        <div><h3 class="flow__t">見学・体験（任意）</h3><p class="flow__b">まず一度、打って、ラウンジをご覧ください。接待でお使いいただけるかどうかは、来ていただくのがいちばん早いと思います。体験レッスン（約55分）は無料です。</p></div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 02</p>
        <div><h3 class="flow__t">お申し込み</h3><p class="flow__b"><a data-link="links.joinWeb" style="color:var(--brass-2)">Webでの入会申込 ↗</a>から、法人プランをお選びください。ご入力は会社名・ご担当者様・請求先だけです。ご利用になる方は、この時点では決まっていなくて構いません。</p></div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 03</p>
        <div><h3 class="flow__t">お支払い</h3><p class="flow__b">そのまま安全な決済ページでお支払いいただきます。ご請求は御社に1本です。規約のご確認と電子サインもこの画面で完了します。</p></div>
      </div>
      <div class="flow__i">
        <p class="flow__n">STEP 04</p>
        <div><h3 class="flow__t">ご利用者のご登録・ご利用開始</h3><p class="flow__b">ご担当者様の会員ページ【ご利用者の管理】から、ご利用になる方をご登録ください。その場で会員番号を発行し、メールアドレスをご入力いただければご本人あてにログイン方法もお送りします。ご登録後すぐに打席をご予約いただけます。</p></div>
      </div>
    </div>
  </div>
</section>

<!-- ===== よくあるご質問 ===== -->
<section class="sec">
  <div class="wrap" style="max-width:860px">
    <div class="center rv">
      <p class="eyebrow">FAQ</p>
      <h2 class="h-en">QUESTIONS</h2>
      <p class="h-jp">法人でのご利用について</p>
    </div>
    <div class="faq rv" style="margin-top:36px">
      <details><summary>登録した人以外は利用できませんか。</summary>
        <div class="faq__a">打席をご利用いただくには、ご利用者としてのご登録をお願いしています（どなたが来られたかを記録し、レッスンカルテを分けてお作りするためです）。ご登録・入れ替えは、ご担当者様の会員ページ【ご利用者の管理】からいつでも行っていただけます。追加費用はいただきません。法人プレミアムは、ご登録者に同伴されるビジター様が無料でご一緒いただけます。</div></details>
      <details><summary>「4コマ・8コマ」とはどういう意味ですか。</summary>
        <div class="faq__a">1コマ＝1時間の打席のご予約です。先にお取りいただける本数の上限で、法人ライトは御社合計4コマ、法人プレミアムは8コマまで。ご利用が済むと（その時間を過ぎるか、ご来店いただくと）、また次のご予約をお取りいただけます。<br>プレミアムはご登録人数に制限がありませんが、同時に押さえられるのは御社合計8コマまでです。どなたかが使い切っている間は他の方がお取りいただけませんので、会員ページに「御社名義のご予約 ○／8コマ」を常に表示しています。</div></details>
      <details><summary>社員それぞれのログインはどうなりますか。</summary>
        <div class="faq__a">ご利用者お一人ずつに会員番号を発行します。ログインはご自身の会員番号と電話番号の下4桁です。ご予約・会員証QR・レッスンカルテは、それぞれの方のものとして記録されます。ご登録の際は、おひとりずつ違う電話番号をご入力ください。<br>店内やご予約台帳では「会社名＋お名前」で表示いたします。</div></details>
      <details><summary>申し込んだ担当者本人も打席を使えますか。</summary>
        <div class="faq__a">はい。ご担当者様の会員ページ【ご利用者の管理】で「自分も利用する」をご登録ください。ご登録いただくと、ご担当者様の会員番号でも打席をご予約いただけます（法人ライトの場合、ご担当者様も2名様のうちの1名として数えます）。ご登録がない間は、ご担当者様の会員番号はお支払いのみのご契約者としてお預かりし、打席のご予約はお取りいただけません。</div></details>
      <details><summary>請求書でのお支払いはできますか。</summary>
        <div class="faq__a">恐れ入りますが、現在はクレジットカードでの毎月のお支払いのみとさせていただいております。請求先のご住所・メールアドレスは、ご担当者様と別に指定いただけますので、経理ご担当の方にお送りすることができます。</div></details>
      <details><summary>接待で使いたいのですが、貸切はできますか。</summary>
        <div class="faq__a">打席・ラウンジの貸切につきましては、日程と規模によりご相談を承ります。公式LINEまたは店頭でお声がけください。</div></details>
      <details><summary>途中でプランを変えられますか。</summary>
        <div class="faq__a">はい。ライトからプレミアムへの変更は店頭で承ります。当月分は週割りの差額をご請求し、翌月から新しいプランの月会費になります。</div></details>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("corporate.html", b)


def build_access():
    b = head("アクセス・駐車場20台｜兵庫県姫路市土山6-6-1｜FRANK GOLF",
             "FRANK GOLF（フランクゴルフ）は 〒670-0996 兵庫県姫路市土山6-6-1。TEL 079-260-6671。平日10:00〜22:00／土日祝9:00〜20:00、火曜定休。駐車場20台無料。姫路市南部・たつの市・太子町・高砂市・加古川市からもお車で。",
             "access")
    b += page_head("アクセス", "ACCESS", "兵庫県姫路市土山6-6-1（駐車場20台・無料）",
                   "姫路バイパス・国道2号方面からお車でお越しいただきやすい立地です。姫路市内はもちろん、たつの市・太子町・高砂市・加古川市からのご来店も多くお迎えする想定です。")
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
        <div class="card map-frame map-frame--tall" data-map>
          <p class="tbd map-frame__tbd">地図は近日公開いたします<br><span>2026年9月2日プレオープン／姫路・土山</span></p>
        </div>
        <p class="map-note">
          <a data-link="store.mapUrl" target="_blank" rel="noopener">Googleマップで開く ↗</a>
          <span data-frank="store.address">近日公開</span>
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
    b = head("よくあるご質問｜姫路のインドアゴルフ FRANK GOLF",
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
    b = head("無料体験レッスン（約55分）｜姫路のインドアゴルフ FRANK GOLF",
             "FRANK GOLF の体験レッスンは約55分・通常3,300円のところ無料。プロのマンツーマン指導つき。2026年9月2日、姫路・土山にプレオープン。",
             "trial")
    b += page_head("体験のご予約", "TRIAL", "まずは、一度打ちに来てください。",
                   "体験レッスンは約55分。通常3,300円（税込）のところ、いまなら無料です。")
    b += f"""
<section class="sec">
  <div class="wrap" style="max-width:820px">
    <div class="rv">
      {offer_badge()}
      <p class="lead" style="max-width:none;margin-top:26px">
        ホームページでどれだけ言葉を尽くしても、伝わらないものがあります。
        打席の広さ、ボールの音、ラウンジの照明の感じ、そこにいる人たちの空気。<br><br>
        {PREOPEN}、姫路・土山にプレオープンいたします。
        まずは一度、打ちに来てください。少し話して、合いそうだと思っていただけたら、それがいちばんです。
      </p>
      <div class="cta__btns" style="justify-content:flex-start;margin-top:26px">
        <a class="btn btn--brass" href="#" data-cta="trial">体験を予約する（無料）</a>
        <a class="btn btn--line" href="#" data-cta="line">公式LINEで相談</a>
      </div>
    </div>

    <!-- 体験当日の流れ（約55分） -->
    <div class="rv" style="margin-top:64px">
      <p class="eyebrow">Trial Program</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">体験当日の流れ</h2>
      <p class="h-jp">受付から入会のご案内まで、<span data-frank="trial.duration" data-frank-fallback="約55分">約55分</span>。</p>
      <div class="flow" style="margin-top:28px" data-trial-steps></div>
      <p class="lead" style="font-size:13.5px;margin-top:16px" data-frank="trial.note" data-frank-hide></p>
    </div>

    <!-- ご予約の流れ -->
    <div class="rv" style="margin-top:56px">
      <p class="eyebrow">How to Book</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">ご予約の流れ</h2>
    </div>

    <div class="rv" style="margin-top:28px">
      <p class="card__t-jp" style="font-size:15px;color:var(--brass-2);margin-bottom:6px">ご予約から体験までの3ステップ</p>
      <div class="flow">
        <div class="flow__i"><p class="flow__n">STEP 01</p><div><h3 class="flow__t">空いている日時を選ぶ（30秒）</h3><p class="flow__b">カレンダーから、ご都合の良い日と開始時間をタップするだけ。会員登録もログインも不要です。</p></div></div>
        <div class="flow__i"><p class="flow__n">STEP 02</p><div><h3 class="flow__t">その場で予約確定</h3><p class="flow__b">お名前とご連絡先をご入力いただくと、その場で確定します。折り返しのご連絡をお待ちいただく必要はありません。</p></div></div>
        <div class="flow__i"><p class="flow__n">STEP 03</p><div><h3 class="flow__t">当日、手ぶらでご来店</h3><p class="flow__b">当日いただく費用はありません。体験レッスンは<span data-frank="trial.duration" data-frank-fallback="約55分">約55分</span>です。ご都合が変わったら、確定画面のリンクからキャンセルできます。</p></div></div>
      </div>
    </div>

    <div class="rv" style="margin-top:44px">
      <p class="card__t-jp" style="font-size:15px;color:var(--brass-2);margin-bottom:6px">会員の方（入会後の打席予約）</p>
      <div class="flow">
        <div class="flow__i"><p class="flow__n">STEP 01</p><div><h3 class="flow__t">会員ログイン</h3><p class="flow__b">会員番号と電話番号下4桁でログイン。<a data-link="links.memberLogin" style="color:var(--brass-2)">会員ログイン ↗</a></p></div></div>
        <div class="flow__i"><p class="flow__n">STEP 02</p><div><h3 class="flow__t">Web予約で打席を確保</h3><p class="flow__b">スマホから空き時間を選んで予約完了。<a data-link="links.memberBooking" style="color:var(--brass-2)">Web予約 ↗</a></p></div></div>
        <div class="flow__i"><p class="flow__n">STEP 03</p><div><h3 class="flow__t">スマート入退室でそのまま打席へ</h3><p class="flow__b">完全予約制なので待ち時間なし。予約した時間に、そのまま練習に入れます。</p></div></div>
      </div>
      <p class="lead" style="font-size:12.5px;margin-top:14px">※ Web入会は決済完了と同時に会員番号が発行され、すぐにWeb予約をご利用いただけます。<a data-link="links.joinWeb" style="color:var(--brass-2)">入会のお申し込みはこちら ↗</a></p>
    </div>

    <!-- 体験のお申し込み（member-os の体験フォームへ） -->
    <div class="rv" style="margin-top:56px">
      <p class="eyebrow">Trial Booking</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">体験のお申し込み</h2>
      <p class="lead">カレンダーから空いている日時を選び、お名前とご連絡先をご入力ください。<strong>その場でご予約が確定します</strong>（折り返しのご連絡をお待たせしません）。打席は当日いちばん良い席をこちらでご用意します。</p>
    </div>

    <div class="grid grid--2 rv" style="margin-top:36px;gap:24px;align-items:stretch">
      <article class="card" style="padding:38px 34px;display:flex;flex-direction:column">
        <p class="card__no">01</p>
        <h3 class="card__t">BOOK</h3>
        <p class="card__t-jp">体験を申し込む</p>
        <p class="card__b" style="margin:12px 0 26px;flex:1">カレンダーから日時を選ぶだけ、その場で確定します。当日は約55分。カウンセリング → 打席のご案内 → プロのマンツーマン体験レッスンまで、無料でご体験いただけます。</p>
        <a class="btn btn--brass" href="#" data-cta="trial">体験を申し込む</a>
      </article>
      <article class="card" style="padding:38px 34px;display:flex;flex-direction:column">
        <p class="card__no">02</p>
        <h3 class="card__t">ASK</h3>
        <p class="card__t-jp">迷ったら、まず相談でも</p>
        <p class="card__b" style="margin:12px 0 26px;flex:1">料金は？　初心者でも大丈夫？　見学だけでも？　よくあるご質問にまとめています。公式LINEでもお答えします。</p>
        <div class="cta__btns" style="justify-content:flex-start;margin:0;gap:10px">
          <a class="btn btn--line" href="#" data-cta="line">公式LINEで相談</a>
          <a class="btn btn--ghost" href="faq.html">よくあるご質問</a>
        </div>
      </article>
    </div>

    <div class="spec rv" style="margin-top:44px">
      <div class="spec__row"><p class="spec__k">体験利用料</p><p class="spec__v" data-frank="price.trialFee">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">所要時間</p><p class="spec__v" data-frank="trial.duration">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">体験の内容</p><p class="spec__v" data-frank="trial.content" data-frank-fallback="打席での練習＋プロのマンツーマン指導">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">担当</p><p class="spec__v" data-frank="lesson.coaches">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">持ち物</p><p class="spec__v" data-frank="trial.bring" data-frank-fallback="手ぶらでOK（クラブレンタルの有無は近日公開）">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">場所</p><p class="spec__v" data-frank="store.address">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">プレオープン特典</p><p class="spec__v" data-frank="preopen.benefits">近日公開</p></div>
      <div class="spec__row"><p class="spec__k">年内入会キャンペーン</p><p class="spec__v">入会金（税込5,500円）無料＋入会月の月会費無料。Web入会時に翌月・翌々月の2か月分の月会費をお支払いいただき、以後は毎月自動でのお支払いです。キャンペーンでのご入会は6か月間の継続をお願いしています。</p></div>
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
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">LOGIN</h3><p class="card__b" style="margin:12px 0 20px">会員番号と電話番号下4桁でログイン</p><a class="btn btn--ghost btn--sm" data-link="links.memberLogin">会員ログイン</a></article>
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">BOOKING</h3><p class="card__b" style="margin:12px 0 20px">打席のWeb予約・キャンセル</p><a class="btn btn--ghost btn--sm" data-link="links.memberBooking">Web予約</a></article>
      <article class="card center"><h3 class="card__t" style="font-size:1.2rem">JOIN</h3><p class="card__b" style="margin:12px 0 20px">はじめての方のご入会</p><a class="btn btn--ghost btn--sm" data-link="links.joinWeb">入会のお申し込み</a></article>
    </div>
  </div>
</section>
"""
    b += foot()
    write("trial.html", b)



def build_trial_booking():
    """体験予約フォーム（セルフ予約・0083）
    日時を選ぶだけで即確定。打席はサーバー側で A→B→C の優先順に自動割当するので、
    お客様には打席を選ばせない（初めての方に打席の違いは判断できないため）。"""
    b = head("体験を予約する（無料・約55分）｜FRANK GOLF",
             "FRANK GOLF 姫路・土山の体験レッスン予約。ご希望の日時を選ぶだけでその場で確定します。通常3,300円（税込）が無料・約55分・手ぶらでOK。",
             "trial-booking")
    b += page_head("体験を予約する", "BOOK A TRIAL", "ご希望の日時を選ぶだけ。その場で確定します。",
                   "折り返しのご連絡をお待たせしません。空いている時間から選んでいただけます。")
    b += """
<section class="sec">
  <div class="wrap" style="max-width:780px">

    <div class="rv">""" + offer_badge() + """</div>

    <!-- 予約ウィザード -->
    <div class="tb rv" id="tb" style="margin-top:40px">

      <!-- STEP 1: 日付 -->
      <div class="tb__step" id="tb-step-date">
        <p class="tb__h"><span class="tb__n">1</span>ご希望の日を選ぶ</p>
        <div class="tb__dates" id="tb-dates"></div>
      </div>

      <!-- STEP 2: 時間 -->
      <div class="tb__step" id="tb-step-time" hidden>
        <p class="tb__h"><span class="tb__n">2</span>開始時間を選ぶ<small class="tb__hint">毎時00分スタート</small></p>
        <label class="tb__lefty">
          <input type="checkbox" id="tb-lefty">
          <span>左打ち（レフティ）です　<em>※ 左右打席のみのご案内になります</em></span>
        </label>
        <p class="tb__note" id="tb-time-note">読み込み中…</p>
        <div class="tb__times" id="tb-times"></div>
      </div>

      <!-- STEP 3: お客様情報 -->
      <div class="tb__step" id="tb-step-form" hidden>
        <p class="tb__h"><span class="tb__n">3</span>お客様情報をご入力</p>
        <p class="tb__pick" id="tb-pick"></p>
        <div class="form">
          <div class="form__grid">
            <div class="form__row">
              <label class="form__label" for="tb-sei">姓 <span class="req">必須</span></label>
              <input id="tb-sei" type="text" autocomplete="family-name" placeholder="山田">
            </div>
            <div class="form__row">
              <label class="form__label" for="tb-mei">名 <span class="req">必須</span></label>
              <input id="tb-mei" type="text" autocomplete="given-name" placeholder="太郎">
            </div>
            <div class="form__row">
              <label class="form__label" for="tb-sei-kana">セイ（フリガナ）</label>
              <input id="tb-sei-kana" type="text" placeholder="ヤマダ">
            </div>
            <div class="form__row">
              <label class="form__label" for="tb-mei-kana">メイ（フリガナ）</label>
              <input id="tb-mei-kana" type="text" placeholder="タロウ">
            </div>
            <div class="form__row form__row--full">
              <label class="form__label" for="tb-birth-y">生年月日 <span class="req">必須</span></label>
              <div style="display:flex;gap:8px;align-items:center">
                <select id="tb-birth-y" style="flex:1.2"><option value="">年</option></select>
                <span style="opacity:.7">年</span>
                <select id="tb-birth-m" style="flex:1"><option value="">月</option></select>
                <span style="opacity:.7">月</span>
                <select id="tb-birth-d" style="flex:1"><option value="">日</option></select>
                <span style="opacity:.7">日</span>
              </div>
            </div>
            <div class="form__row">
              <label class="form__label" for="tb-phone">電話番号 <span class="req">必須</span></label>
              <input id="tb-phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="090-1234-5678">
            </div>
            <div class="form__row">
              <label class="form__label" for="tb-email">メールアドレス</label>
              <input id="tb-email" type="email" autocomplete="email" inputmode="email" placeholder="example@mail.com">
            </div>
            <div class="form__row form__row--full">
              <label class="form__label" for="tb-exp">ゴルフ経験</label>
              <select id="tb-exp">
                <option value="">選択してください</option>
                <option>まったくの初心者（クラブを握ったことがない）</option>
                <option>打ちっぱなしの経験がある</option>
                <option>コースに出たことがある</option>
                <option>定期的にラウンドしている</option>
              </select>
            </div>
            <div class="form__row form__row--full">
              <label class="form__label" for="tb-msg">ご質問・ご要望</label>
              <textarea id="tb-msg" rows="3" placeholder="当日クラブを借りたい、見学だけ希望、駐車場について など"></textarea>
            </div>
          </div>
          <label class="form__consent">
            <input type="checkbox" id="tb-consent">
            <span><a href="privacy.html" target="_blank" rel="noopener">個人情報の取扱い</a>に同意します</span>
          </label>
          <div class="form__submit">
            <button class="btn btn--brass" type="button" id="tb-submit">この日時で予約を確定する</button>
            <span class="form__status" id="tb-status"></span>
          </div>
          <p class="form-note">当日いただく費用はありません（通常3,300円 税込が無料）。強引な勧誘はいたしません。</p>
        </div>
      </div>
    </div>

    <!-- 確定 -->
    <div class="tb-done rv" id="tb-done" hidden>
      <p class="tb-done__badge">ご予約が確定しました</p>
      <p class="tb-done__when" id="tb-done-when"></p>
      <div class="spec" style="margin-top:26px">
        <div class="spec__row"><p class="spec__k">体験レッスン</p><p class="spec__v">無料（通常 3,300円 税込）・約55分</p></div>
        <div class="spec__row"><p class="spec__k">打席</p><p class="spec__v" id="tb-done-bay"></p></div>
        <div class="spec__row"><p class="spec__k">場所</p><p class="spec__v"><span data-frank="store.address">近日公開</span><br><a data-link="store.mapUrl" style="color:var(--brass-2);text-decoration:underline">Googleマップで見る</a></p></div>
        <div class="spec__row"><p class="spec__k">持ち物</p><p class="spec__v" data-frank="trial.bring" data-frank-fallback="手ぶらでOK（クラブレンタルの有無は近日公開）">近日公開</p></div>
        <div class="spec__row"><p class="spec__k">当日の流れ</p><p class="spec__v" data-frank="trial.content">近日公開</p></div>
      </div>
      <div class="tb-done__line" id="tb-done-line" hidden>
        <p class="tb-done__line-t">公式LINEを友だち追加してください</p>
        <p class="tb-done__line-b">当日のご案内・道順のご連絡、日程変更のご相談をLINEで承ります。</p>
        <a class="btn btn--line" href="#" data-cta="line">公式LINEを友だち追加</a>
      </div>
      <p class="tb-done__cancel">
        ご都合が悪くなった場合は、こちらからキャンセルできます（このページをブックマークしてください）。<br>
        <a id="tb-done-cancel-url" href="#">キャンセル・日程変更はこちら</a>
        <span class="tb-done__url" id="tb-done-cancel-raw"></span>
      </p>
      <p class="tb-done__note">この画面をスクリーンショットで保存しておくと安心です。</p>
    </div>

    <!-- キャンセル画面（?cancel=トークン） -->
    <div class="tb-cancel rv" id="tb-cancel" hidden>
      <p class="eyebrow">Cancel</p>
      <h2 class="h-en" style="font-size:clamp(1.6rem,4vw,2.3rem)">ご予約のキャンセル</h2>
      <p class="lead" id="tb-cancel-info">読み込み中…</p>
      <div class="cta__btns" style="justify-content:flex-start;margin-top:20px">
        <button class="btn btn--ghost" type="button" id="tb-cancel-go">このご予約をキャンセルする</button>
        <a class="btn btn--brass" href="trial-booking.html">別の日時で予約し直す</a>
      </div>
      <p class="form__status" id="tb-cancel-status" style="margin-top:14px"></p>
    </div>

    <p class="lead" style="font-size:13.5px;margin-top:44px">
      会員の方の打席予約は <a href="booking.html" style="color:var(--brass-2);text-decoration:underline">打席予約ページ</a> から。
      体験の内容は <a href="trial.html" style="color:var(--brass-2);text-decoration:underline">体験のご案内</a> をご覧ください。
    </p>
  </div>
</section>

<script>
(function(){
  var API = "https://yozan-genesis.vercel.app/api/public/frank/trial";
  var $ = function(id){ return document.getElementById(id) };
  /* 曜日は日付文字列を UTC として読む（"YYYY-MM-DDT00:00:00Z" + getUTCDay）。
     ⚠ "+09:00" を付けるとUTCでは前日15時になり、getUTCDay() が前日の曜日を返す。
        9/2（水）が「火」と表示された実障害（#200）。ここは触らないこと。 */
  var WD = ["日","月","火","水","木","金","土"];
  var state = { date:null, start:null, lefty:false, slots:null };

  function jstNow(){ return new Date(Date.now() + 9*3600*1000) }
  function ymd(d){ return d.toISOString().slice(0,10) }

  /* ---------- 生年月日（年/月/日の3つのプルダウン） ----------
     iPhone/iPadの <input type="date"> はホイールで「日」が合わせにくく、
     入力を諦める方が出るため3分割にしている（member-os の BirthDateInput と同じ考え方）。
     日数は選んだ年月に合わせて出し直す（2月31日を選ばせない）。 */
  (function(){
    var y = $("tb-birth-y"), m = $("tb-birth-m"), d = $("tb-birth-d");
    if (!y || !m || !d) return;
    var thisYear = jstNow().getUTCFullYear();
    var h = '<option value="">年</option>';
    for (var i = thisYear; i >= thisYear - 100; i--) h += '<option value="' + i + '">' + i + '</option>';
    y.innerHTML = h;
    h = '<option value="">月</option>';
    for (var mm = 1; mm <= 12; mm++) h += '<option value="' + mm + '">' + mm + '</option>';
    m.innerHTML = h;
    function fillDays(){
      var yy = Number(y.value) || 2000; /* 未選択のあいだは閏年扱いで29日まで出す */
      var mo = Number(m.value);
      var last = mo ? new Date(yy, mo, 0).getDate() : 31;
      var keep = Number(d.value);
      var s2 = '<option value="">日</option>';
      for (var dd = 1; dd <= last; dd++) s2 += '<option value="' + dd + '">' + dd + '</option>';
      d.innerHTML = s2;
      if (keep && keep <= last) d.value = String(keep);
    }
    y.addEventListener("change", fillDays);
    m.addEventListener("change", fillDays);
    fillDays();
  })();

  /* 選ばれた生年月日を YYYY-MM-DD で返す。未選択は "" */
  function birthValue(){
    var y = $("tb-birth-y"), m = $("tb-birth-m"), d = $("tb-birth-d");
    if (!y || !m || !d || !y.value || !m.value || !d.value) return "";
    var p2 = function(n){ return ("0" + n).slice(-2) };
    return y.value + "-" + p2(m.value) + "-" + p2(d.value);
  }

  /* ---------- キャンセル画面 ---------- */
  var token = (location.search.match(/[?&]cancel=([0-9a-f]+)/) || [])[1];
  if (token) {
    $("tb").hidden = true;
    $("tb-cancel").hidden = false;
    fetch(API + "?token=" + token).then(function(r){ return r.json() }).then(function(j){
      if (j.error) { $("tb-cancel-info").textContent = j.error; $("tb-cancel-go").disabled = true; return }
      if (j.status === "canceled") {
        $("tb-cancel-info").textContent = "このご予約はキャンセル済みです。";
        $("tb-cancel-go").disabled = true; return;
      }
      var d = new Date(j.date + "T00:00:00Z");
      $("tb-cancel-info").textContent = j.name + " 様 ／ " + j.date.replace(/-/g,"/") + "（" + WD[d.getUTCDay()] + "）"
        + j.start + "〜" + j.end + " ／ " + j.bayName;
    });
    $("tb-cancel-go").addEventListener("click", function(){
      if (!confirm("このご予約をキャンセルしますか？")) return;
      $("tb-cancel-go").disabled = true;
      fetch(API, { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"cancel", token: token }) })
        .then(function(r){ return r.json() }).then(function(j){
          var el = $("tb-cancel-status");
          if (j.ok) { el.className = "form__status is-ok"; el.textContent = "キャンセルが完了しました。またのご利用をお待ちしております。"; $("tb-cancel-info").textContent = ""; }
          else { el.className = "form__status is-err"; el.textContent = j.error || "キャンセルできませんでした"; $("tb-cancel-go").disabled = false; }
        });
    });
    return;
  }

  /* ---------- STEP 1: 日付（オープン日 2026-09-02 以降・月ごとのカレンダーで最大60日先まで #131） ---------- */
  var dates = [];
  (function(){
    var OPEN = "2026-09-02"; // プレオープン日。これより前の日付は出さない
    var MAX_DAYS = 60;       // 予約設定 advance_days と後で同期される（少ない方に絞る）
    var base = jstNow();
    var todayV = ymd(base);
    if (todayV < OPEN) base = new Date(OPEN + "T00:00:00Z");
    for (var i = 0; i < MAX_DAYS; i++) {
      var d = new Date(base.getTime() + i*86400000);
      dates.push({ v: ymd(d), y: d.getUTCFullYear(), m: d.getUTCMonth()+1, d: d.getUTCDate(), w: WD[d.getUTCDay()], dow: d.getUTCDay(), i: i });
    }
    // 月ごとにカレンダー（週=7列）で描く。曜日ヘッダー＋月初の空きマスを詰める
    var h = "";
    var curKey = "";
    dates.forEach(function(x){
      var key = x.y + "-" + x.m;
      if (key !== curKey) {
        if (curKey) h += '</div>';
        curKey = key;
        h += '<p class="tb__month">' + x.m + '月</p>';
        h += '<div class="tb__cal">';
        h += '<span class="tb__wd is-sun">日</span><span class="tb__wd">月</span><span class="tb__wd">火</span><span class="tb__wd">水</span><span class="tb__wd">木</span><span class="tb__wd">金</span><span class="tb__wd is-sat">土</span>';
        for (var e = 0; e < x.dow; e++) h += '<span class="tb__pad"></span>';
      }
      var cls = "tb__date" + (x.dow===0 ? " is-sun" : x.dow===6 ? " is-sat" : "");
      h += '<button type="button" class="' + cls + '" data-date="' + x.v + '" data-i="' + x.i + '">'
         + '<span class="tb__date-d">' + x.d + '</span>'
         + (x.v===todayV ? '<span class="tb__date-m">今日</span>' : '')
         + '</button>';
    });
    if (curKey) h += '</div>';
    $("tb-dates").innerHTML = h;
    $("tb-dates").querySelectorAll("button[data-date]").forEach(function(btn){
      btn.addEventListener("click", function(){ selectDate(btn.getAttribute("data-date"), btn) });
    });
    // 定休日・予約範囲外は最初からグレーにする（選んでから「定休日です」と言われるのは体験が悪い）
    fetch(API + "?date=" + dates[0].v).then(function(r){ return r.json() }).then(function(cfg){
      var dows = cfg.closedDows || [], closed = cfg.closedDates || [];
      var n = Math.min(dates.length, (cfg.advanceDays || 14));
      $("tb-dates").querySelectorAll("button[data-date]").forEach(function(btn){
        var x = dates[Number(btn.getAttribute("data-i"))];
        var off = dows.indexOf(x.dow) >= 0 || closed.indexOf(x.v) >= 0 || x.i >= n;
        if (off) { btn.disabled = true; btn.classList.add("is-off"); btn.title = "この日はご予約いただけません"; }
      });
    }).catch(function(){ /* 取れなくても選んだ時点で判定されるので致命的ではない */ });
  })();

  function selectDate(date, btn){
    state.date = date; state.start = null;
    $("tb-dates").querySelectorAll("button").forEach(function(b){ b.classList.remove("is-on") });
    if (btn) btn.classList.add("is-on");
    $("tb-step-time").hidden = false;
    $("tb-step-form").hidden = true;
    $("tb-times").innerHTML = "";
    $("tb-time-note").textContent = "空き状況を読み込み中…";
    fetch(API + "?date=" + date).then(function(r){ return r.json() }).then(function(j){
      state.slots = j;
      renderTimes();
      $("tb-step-time").scrollIntoView({ behavior:"smooth", block:"center" });
    }).catch(function(){ $("tb-time-note").textContent = "読み込みに失敗しました。時間をおいてお試しください。" });
  }

  function renderTimes(){
    var j = state.slots; if (!j) return;
    if (j.closed) {
      $("tb-time-note").textContent = "この日は定休日です。別の日をお選びください。";
      $("tb-times").innerHTML = ""; return;
    }
    var list = state.lefty ? (j.leftySlots || []) : (j.slots || []);
    if (!list.length) {
      $("tb-time-note").textContent = state.lefty
        ? "この日の左右打席は満席です。別の日をお選びください。"
        : "この日は満席です。別の日をお選びください。";
      $("tb-times").innerHTML = ""; return;
    }
    $("tb-time-note").textContent = "体験は毎時00分スタート・所要 約" + j.labelMinutes + "分です。ご希望の開始時間をお選びください。";
    var h = "";
    list.forEach(function(t){ h += '<button type="button" class="tb__time" data-t="' + t + '">' + t + '</button>' });
    $("tb-times").innerHTML = h;
    $("tb-times").querySelectorAll("button[data-t]").forEach(function(btn){
      btn.addEventListener("click", function(){
        state.start = btn.getAttribute("data-t");
        $("tb-times").querySelectorAll("button").forEach(function(b){ b.classList.remove("is-on") });
        btn.classList.add("is-on");
        var d = new Date(state.date + "T00:00:00Z");
        $("tb-pick").textContent = state.date.replace(/-/g,"/") + "（" + WD[d.getUTCDay()] + "） "
          + state.start + "〜　体験レッスン 無料・約" + j.labelMinutes + "分"
          + (state.lefty ? "　／　左右打席" : "");
        $("tb-step-form").hidden = false;
        $("tb-step-form").scrollIntoView({ behavior:"smooth", block:"start" });
      });
    });
  }

  $("tb-lefty").addEventListener("change", function(){
    state.lefty = this.checked; state.start = null;
    $("tb-step-form").hidden = true;
    renderTimes();
  });

  /* ---------- STEP 3: 確定 ---------- */
  $("tb-submit").addEventListener("click", function(){
    var el = $("tb-status"); el.className = "form__status"; el.textContent = "";
    if (!state.date || !state.start) { el.className = "form__status is-err"; el.textContent = "日時をお選びください"; return }
    /* 姓・名は分けて受け取り、送信時に「姓 名」に結合する（台帳側は1列） */
    var sei = $("tb-sei").value.trim(), mei = $("tb-mei").value.trim();
    var name = [sei, mei].filter(Boolean).join(" ");
    var kana = [$("tb-sei-kana").value.trim(), $("tb-mei-kana").value.trim()].filter(Boolean).join(" ");
    var phone = $("tb-phone").value.trim();
    if (!sei)  { el.className = "form__status is-err"; el.textContent = "姓をご入力ください"; $("tb-sei").focus(); return }
    if (!mei)  { el.className = "form__status is-err"; el.textContent = "名をご入力ください"; $("tb-mei").focus(); return }
    if (!phone) { el.className = "form__status is-err"; el.textContent = "電話番号をご入力ください"; $("tb-phone").focus(); return }
    var birth = birthValue();
    if (!birth) { el.className = "form__status is-err"; el.textContent = "生年月日をご入力ください"; $("tb-birth-y").focus(); return }
    if (!$("tb-consent").checked) { el.className = "form__status is-err"; el.textContent = "個人情報の取扱いへの同意が必要です"; return }

    var btn = $("tb-submit"); btn.disabled = true; el.textContent = "確定しています…";
    fetch(API, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
      action:"book", name:name, name_kana:kana, birth_date:birth, phone:phone,
      email:$("tb-email").value.trim(), date:state.date, start:state.start,
      lefty:state.lefty, experience:$("tb-exp").value, message:$("tb-msg").value.trim(), consent:true
    })}).then(function(r){ return r.json() }).then(function(j){
      btn.disabled = false;
      if (!j.ok) {
        el.className = "form__status is-err";
        el.textContent = j.error || "予約できませんでした";
        if (state.date) selectDate(state.date, $("tb-dates").querySelector('button[data-date="' + state.date + '"]'));
        return;
      }
      var d = new Date(j.date + "T00:00:00Z");
      $("tb").hidden = true;
      $("tb-done").hidden = false;
      $("tb-done-when").textContent = j.date.replace(/-/g,"/") + "（" + WD[d.getUTCDay()] + "） " + j.start + "〜" + j.end;
      $("tb-done-bay").textContent = j.bayName + "（当日ご案内します）";
      var url = location.origin + location.pathname + "?cancel=" + j.cancelToken;
      var a = $("tb-done-cancel-url"); a.href = url;
      var raw = $("tb-done-cancel-raw"); if (raw) raw.textContent = url;
      var line = (window.FRANK && window.FRANK.links && window.FRANK.links.line) || null;
      if (line) $("tb-done-line").hidden = false;
      if (window.FRANK_RENDER) window.FRANK_RENDER();
      $("tb-done").scrollIntoView({ behavior:"smooth", block:"start" });
    }).catch(function(){
      btn.disabled = false;
      el.className = "form__status is-err"; el.textContent = "通信に失敗しました。時間をおいてお試しください。";
    });
  });
})();
</script>
"""
    b += foot()
    write("trial-booking.html", b)


def build_lp_trial():
    """無料体験LP（広告・SNS・LINEの飛び先用 #136）。
    体験1点に絞ったランディングページ。導線は 体験予約 と 公式LINE のみを推す。"""
    faq = jsonld_faq([
        ("本当に無料ですか？", "はい。通常3,300円（税込）の体験レッスン（約55分）を、プレオープン記念で無料でご案内しています。当日いただく費用はありません。"),
        ("ゴルフをやったことがなくても大丈夫ですか？", "大丈夫です。クラブを握ったことがない方も歓迎です。プロがマンツーマンで、その方のペースに合わせてご案内します。"),
        ("持ち物は必要ですか？", "手ぶらでお越しください。動きやすい服装であれば大丈夫です。"),
        ("体験に行ったら入会しないといけませんか？", "いいえ。強引な勧誘は一切いたしません。料金のご説明のみで、お持ち帰りでのご検討も歓迎です。"),
    ])
    b = head("【無料】プロの体験レッスン55分｜姫路・土山のインドアゴルフ FRANK GOLF",
             "姫路・土山のインドアゴルフ FRANK GOLF。所属レッスンプロのマンツーマン体験レッスン（約55分・通常3,300円）がいまなら無料。最新シミュレーター完備・手ぶらでOK・強引な勧誘なし。",
             "lp-trial", noindex=True, jsonld=faq)
    b += f"""
<section class="page-head">
  <div class="wrap rv">
    <p class="crumb">姫路・土山｜{PREOPEN} プレオープン</p>
    <h1 class="h-en">まず、1球打ってみませんか。</h1>
    <p class="h-jp">プロのマンツーマン体験レッスン（約55分）が、いまなら無料。</p>
    <p class="lead">通常3,300円（税込）の体験レッスンを、プレオープン記念で無料でご案内しています。
    最新シミュレーターでスイングを数字で見ながら、所属プロがその場でひとつ、変化をつくります。
    手ぶらでOK・強引な勧誘は一切ありません。</p>
  </div>
</section>

<section class="sec">
  <div class="wrap" style="max-width:820px">
    <div class="rv">
      {offer_badge()}
      <div class="cta__btns" style="justify-content:flex-start;margin-top:26px">
        <a class="btn btn--brass" href="#" data-cta="trial">無料体験を予約する（30秒）</a>
        <a class="btn btn--line" href="#" data-cta="line">公式LINEで相談</a>
      </div>
    </div>

    <div class="rv" style="margin-top:56px">
      <p class="eyebrow">Why FRANK GOLF</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">選ばれる3つの理由</h2>
      <div class="flow" style="margin-top:24px">
        <div class="flow__i"><p class="flow__n">01</p><div><h3 class="flow__t">所属レッスンプロが常駐</h3><p class="flow__b">レッスンは<span data-frank="lesson.coaches" data-frank-fallback="所属レッスンプロ">所属レッスンプロ</span>が担当。会員は「求めたときに5〜10分」のワンポイント指導を受け放題感覚で。</p></div></div>
        <div class="flow__i"><p class="flow__n">02</p><div><h3 class="flow__t">最新シミュレーター×完全予約制</h3><p class="flow__b"><span data-frank="store.simulator" data-frank-fallback="最新シミュレーター3打席">最新シミュレーター3打席</span>。完全予約制なので待ち時間ゼロ。天候も日焼けも関係なく、データで上達できます。</p></div></div>
        <div class="flow__i"><p class="flow__n">03</p><div><h3 class="flow__t">バーラウンジ併設</h3><p class="flow__b">元ゴルフバーのカウンターを承継した交流空間。練習の前後に一杯、ゴルフ談義まで楽しめる「大人のゴルフ基地」です。</p></div></div>
      </div>
    </div>

    <div class="rv" style="margin-top:56px">
      <p class="eyebrow">Trial Program</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">体験当日の流れ（約55分）</h2>
      <div class="flow" style="margin-top:24px" data-trial-steps></div>
      <p class="lead" style="font-size:13.5px;margin-top:14px" data-frank="trial.note" data-frank-hide></p>
    </div>

    <div class="rv" style="margin-top:56px">
      <p class="eyebrow">Access</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">アクセス</h2>
      <p class="lead" style="margin-top:14px">
        <span data-frank="store.address">兵庫県姫路市土山6-6-1</span>／駐車場 <span data-frank="store.parking" data-frank-fallback="無料">最大20台・無料</span><br>
        営業時間 <span data-frank="store.hours" data-frank-fallback="近日公開">平日 10:00〜22:00 ／ 土日祝 9:00〜20:00</span>（<span data-frank="store.holiday" data-frank-fallback="定休日">毎週火曜日</span> 定休）
      </p>
      <p style="margin-top:12px"><a class="btn btn--ghost btn--sm" data-link="store.mapUrl" target="_blank" rel="noopener">Googleマップで見る ↗</a></p>
    </div>

    <div class="rv" style="margin-top:56px">
      <p class="eyebrow">FAQ</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">よくあるご質問</h2>
      <div style="margin-top:20px">
        <div class="card" style="padding:18px;margin-top:10px"><p style="font-weight:700">Q. 本当に無料ですか？</p><p style="margin-top:6px;font-size:14px;opacity:.85">はい。通常3,300円（税込）の体験レッスン（約55分）を、プレオープン記念で無料でご案内しています。当日いただく費用はありません。</p></div>
        <div class="card" style="padding:18px;margin-top:10px"><p style="font-weight:700">Q. 初心者でも大丈夫ですか？</p><p style="margin-top:6px;font-size:14px;opacity:.85">大丈夫です。クラブを握ったことがない方も歓迎。プロがその方のペースに合わせてご案内します。</p></div>
        <div class="card" style="padding:18px;margin-top:10px"><p style="font-weight:700">Q. 持ち物は？</p><p style="margin-top:6px;font-size:14px;opacity:.85">手ぶらでお越しください。動きやすい服装であれば大丈夫です。</p></div>
        <div class="card" style="padding:18px;margin-top:10px"><p style="font-weight:700">Q. 入会の勧誘はありますか？</p><p style="margin-top:6px;font-size:14px;opacity:.85">強引な勧誘は一切いたしません。最後に料金のご説明のみで、お持ち帰りでのご検討も歓迎です。</p></div>
      </div>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("lp-trial.html", b)


def build_lp_campaign():
    """年内入会キャンペーンLP（#131のキャンペーンを1枚で伝える #136）。
    Web入会（即決済・会員番号即発行）へ直行させる導線。"""
    faq = jsonld_faq([
        ("キャンペーンの内容は？", "2026年12月31日までのご入会で、入会金5,500円（税込）が無料、さらに入会月の月会費も無料になります。"),
        ("支払いはどうなりますか？", "クレジットカードのみです。お申し込み時に翌月・翌々月の月会費2か月分を1回でお支払いいただき、以後は毎月自動でのお支払いになります。"),
        ("すぐに使えますか？", "はい。Web入会は決済完了と同時に会員番号が発行され、その場でWeb打席予約をご利用いただけます。"),
        ("条件はありますか？", "キャンペーンでのご入会は6か月間の継続をお願いしています。休会・退会の規定は会員規約をご確認ください。"),
    ])
    b = head("入会金0円・入会月0円｜年内入会キャンペーン｜FRANK GOLF 姫路・土山",
             "FRANK GOLF の年内入会キャンペーン。2026年内のご入会で入会金5,500円が無料＋入会月の月会費も無料。Web入会は決済完了と同時に会員番号を即発行。姫路・土山のインドアゴルフ。",
             "lp-campaign", jsonld=faq)
    b += f"""
<section class="page-head">
  <div class="wrap rv">
    <p class="crumb">姫路・土山｜{PREOPEN} プレオープン</p>
    <h1 class="h-en">年内入会で、入会金0円・入会月0円。</h1>
    <p class="h-jp">オープン記念・年内入会キャンペーン（2026年12月31日まで）</p>
    <p class="lead">入会金5,500円（税込）が無料、さらに入会月の月会費も無料。
    Webからのご入会なら、決済完了と同時に会員番号が発行され、その日からWeb予約で練習を始められます。</p>
    <div class="cta__btns" style="justify-content:flex-start;margin-top:22px">
      <a class="btn btn--brass" data-link="links.joinWeb">Webで入会する（会員番号を即発行）</a>
      <a class="btn btn--ghost" href="#" data-cta="trial">まずは無料体験から</a>
    </div>
  </div>
</section>

<section class="sec">
  <div class="wrap" style="max-width:860px">
    <div class="rv">
      <p class="eyebrow">Campaign</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">キャンペーン内容</h2>
      <div class="flow" style="margin-top:24px">
        <div class="flow__i"><p class="flow__n">特典 1</p><div><h3 class="flow__t">入会金 5,500円 → <b style="color:var(--brass-2)">0円</b></h3><p class="flow__b">2026年12月31日までのお申し込みで、入会金（税込5,500円）が無料になります。</p></div></div>
        <div class="flow__i"><p class="flow__n">特典 2</p><div><h3 class="flow__t">入会月の月会費 → <b style="color:var(--brass-2)">0円</b></h3><p class="flow__b">ご入会月の月会費は無料。お支払いは翌月分からのスタートです。</p></div></div>
        <div class="flow__i"><p class="flow__n">おねがい</p><div><h3 class="flow__t">6か月間の継続</h3><p class="flow__b">キャンペーンでのご入会は、6か月間の継続をお願いしています（休会・退会の規定は会員規約をご覧ください）。</p></div></div>
      </div>
      <p class="lead" style="font-size:13px;margin-top:14px">※ お申し込み時に、翌月・翌々月の月会費2か月分を1回でお支払いいただきます（以後は毎月自動でのお支払い）。</p>
    </div>

    <div class="rv" style="margin-top:56px">
      <p class="eyebrow">Plans</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">会員プラン</h2>
      <p class="h-jp">表示金額はすべて税抜です。</p>
      <div class="flow" style="margin-top:24px">
        <div class="flow__i"><p class="flow__n">LIGHT</p><div><h3 class="flow__t">ライト会員 9,800円/月</h3><p class="flow__b">月4回までのご利用（全営業日OK）。マイペースにゆったり練習したい方に。</p></div></div>
        <div class="flow__i"><p class="flow__n">REGULAR</p><div><h3 class="flow__t">レギュラー会員 13,800円/月（一番人気）</h3><p class="flow__b">全営業日ご利用可能・1日1時間通い放題。毎日練習して上達したい方に。</p></div></div>
        <div class="flow__i"><p class="flow__n">MASTER</p><div><h3 class="flow__t">マスター会員 19,800円/月</h3><p class="flow__b">全営業日ご利用可能・1日最大2時間まで。たっぷり練習したい熱心な方に。</p></div></div>
      </div>
      <p style="margin-top:14px"><a class="btn btn--ghost btn--sm" href="plan.html">プランの詳しい比較を見る ↗</a></p>
    </div>

    <div class="rv" style="margin-top:56px">
      <p class="eyebrow">How to Join</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">ご入会は3ステップ・Webで完結</h2>
      <div class="flow" style="margin-top:24px">
        <div class="flow__i"><p class="flow__n">STEP 01</p><div><h3 class="flow__t">プランを選んでフォーム入力</h3><p class="flow__b">お名前・ご連絡先を入力し、会員規約に同意して電子サイン。</p></div></div>
        <div class="flow__i"><p class="flow__n">STEP 02</p><div><h3 class="flow__t">カードでお支払い</h3><p class="flow__b">安全な決済ページ（Square）で、前取り月会費2か月分を1回でお支払い。</p></div></div>
        <div class="flow__i"><p class="flow__n">STEP 03</p><div><h3 class="flow__t">その場で会員番号発行</h3><p class="flow__b">決済完了と同時に会員番号をメールでお届け。すぐにWeb打席予約が使えます。</p></div></div>
      </div>
      <div class="cta__btns" style="justify-content:flex-start;margin-top:26px">
        <a class="btn btn--brass" data-link="links.joinWeb">Webで入会する</a>
        <a class="btn btn--line" href="#" data-cta="line">公式LINEで相談</a>
      </div>
    </div>

    <div class="rv" style="margin-top:56px">
      <p class="eyebrow">FAQ</p>
      <h2 class="h-en" style="font-size:clamp(1.7rem,4vw,2.5rem)">よくあるご質問</h2>
      <div style="margin-top:20px">
        <div class="card" style="padding:18px;margin-top:10px"><p style="font-weight:700">Q. いつまでのキャンペーンですか？</p><p style="margin-top:6px;font-size:14px;opacity:.85">2026年12月31日のお申し込み分までです。</p></div>
        <div class="card" style="padding:18px;margin-top:10px"><p style="font-weight:700">Q. 支払い方法は？</p><p style="margin-top:6px;font-size:14px;opacity:.85">クレジットカードのみです。毎月自動でのお支払いになります（口座振替をご希望の方は店頭でご相談ください）。</p></div>
        <div class="card" style="padding:18px;margin-top:10px"><p style="font-weight:700">Q. 入会前に見学・体験できますか？</p><p style="margin-top:6px;font-size:14px;opacity:.85">はい。無料の体験レッスン（約55分）をご用意しています。まずは体験からがおすすめです。</p></div>
        <div class="card" style="padding:18px;margin-top:10px"><p style="font-weight:700">Q. 休会・退会はできますか？</p><p style="margin-top:6px;font-size:14px;opacity:.85">できます。手続き・費用の規定は会員規約（休会・退会規定）をご確認ください。キャンペーン入会は6か月間の継続をお願いしています。</p></div>
      </div>
    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("lp-campaign.html", b)


def build_tokushoho():
    b = head("特定商取引法に基づく表記｜FRANK GOLF",
             "FRANK GOLF の特定商取引法に基づく表記。",
             "tokushoho")
    b += page_head("特定商取引法に基づく表記", "LEGAL NOTICE", "特定商取引法に基づく表記")
    b += """
<section class="sec">
  <div class="wrap" style="max-width:880px">
    <div class="spec rv" style="margin-top:36px">
      <div class="spec__row"><p class="spec__k">販売事業者</p><p class="spec__v" data-frank="store.company">株式会社YOZAN</p></div>
      <div class="spec__row"><p class="spec__k">運営統括責任者</p><p class="spec__v">古川 博庸</p></div>
      <div class="spec__row"><p class="spec__k">所在地</p><p class="spec__v"><span data-frank="store.postal" data-frank-hide></span><span data-frank="store.address">兵庫県姫路市土山6-6-1</span>（FRANK GOLF）</p></div>
      <div class="spec__row"><p class="spec__k">電話番号</p><p class="spec__v"><a data-tel>近日公開</a>（営業時間内）</p></div>
      <div class="spec__row"><p class="spec__k">メールアドレス</p><p class="spec__v">お取引・サービスに関するお問い合わせは<a href="#" data-cta="line" style="color:var(--brass-2)">公式LINE</a>にて承ります。メールアドレスは、ご請求をいただければ遅滞なく開示いたします。</p></div>
      <div class="spec__row"><p class="spec__k">販売価格</p><p class="spec__v">各会員プランの月会費は<a href="plan.html" style="color:var(--brass-2)">料金ページ</a>に記載のとおりです（表示は税抜・別途消費税がかかります）。体験レッスンは通常3,300円（税込）、キャンペーン期間中は無料です。</p></div>
      <div class="spec__row"><p class="spec__k">商品代金以外の必要料金</p><p class="spec__v">消費税。Webサイトのご利用にかかる通信費はお客様のご負担となります。</p></div>
      <div class="spec__row"><p class="spec__k">支払方法</p><p class="spec__v">クレジットカード（毎月の自動決済）、口座振替、または店頭でのお支払い</p></div>
      <div class="spec__row"><p class="spec__k">支払時期</p><p class="spec__v">月会費は当月分を毎月お支払いいただきます。クレジットカードはご登録時および以後毎月、自動で決済されます。口座振替・店頭払いは当社所定の日にお支払いいただきます。会員ポータルからのご注文（モバイルオーダー）は、ご注文の確定時にご登録のクレジットカードで決済されます（カード未登録の場合は退店時に店頭でお支払いいただきます）。モバイルオーダーの商品代金は、会員ポータルに税込価格で表示します。</p></div>
      <div class="spec__row"><p class="spec__k">サービスの提供時期</p><p class="spec__v">入会のご承認後、ご利用開始日からご利用いただけます。打席・レッスンは予約された日時に提供します。</p></div>
      <div class="spec__row"><p class="spec__k">返品・キャンセル</p><p class="spec__v">サービスの性質上、提供済みのサービスの返金はいたしかねます。打席のご予約は、ご利用開始前まで予約ページからキャンセルいただけます。</p></div>
      <div class="spec__row"><p class="spec__k">退会について</p><p class="spec__v">退会を希望される月の前月末日までに、当社所定の方法でお申し出ください。月会費の日割り精算・返金はいたしません。詳細は<a href="terms.html" style="color:var(--brass-2)">会員規約</a>をご確認ください。</p></div>
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
        予約・会員管理システムの運用、クレジットカード決済の処理（Square等の決済事業者）など、
        必要な範囲で個人情報の取り扱いを外部に委託する場合があります。委託先に対しては、適切な監督を行います。
        なお、クレジットカード番号は当社では保持せず、決済事業者が安全に取り扱います。
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
        <span data-frank="store.address">兵庫県姫路市土山6-6-1</span><br>
        <a href="#" data-cta="line" style="color:var(--brass-2)">公式LINE</a> または店頭にて承ります。
      </p>

      <p class="legal__date">制定日: 2026年8月3日</p>
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
    <div class="rv legal" style="margin-top:44px">
      <p class="legal__lead">
        本規約は、<span data-frank="store.company">株式会社YOZAN</span>（以下「当社」）が運営する
        FRANK GOLF（以下「当施設」）の会員（以下「会員」）の利用条件を定めるものです。
        会員は、入会申込により本規約に同意したものとみなします。
      </p>

      <h2 class="legal__h">第1条（会員）</h2>
      <p class="legal__b">会員とは、本規約に同意し、所定の入会申込を行い、当社が入会を承認した個人または法人をいいます。当社は、当施設の運営上必要と判断した場合、入会をお断りすることがあります。</p>

      <h2 class="legal__h">第2条（会員種別・会費）</h2>
      <p class="legal__b">会員種別および月会費は、<a href="plan.html" style="color:var(--brass-2)">料金ページ</a>に定めるとおりです（表示金額は税抜）。会費は、クレジットカードによる毎月の自動決済、口座振替、または当社が認めるその他の方法により、当月分を毎月お支払いいただきます。会費および各種料金は、経済情勢等により改定する場合があります。改定する場合は、事前に当施設内の掲示またはWebサイトでお知らせします。</p>

      <h2 class="legal__h">第3条（利用方法・予約・キャンセル）</h2>
      <p class="legal__b">会員は、会員種別ごとに定める範囲で当施設を利用できます。打席のご利用は、当社が定める予約システム（Web予約等）によりご予約ください。ご予約は、ご利用開始前まで予約ページからキャンセルいただけます。ご連絡のないキャンセル（無断キャンセル）が続く場合、当社はWeb予約のご利用を制限することがあります。</p>

      <h2 class="legal__h">第4条（休会）</h2>
      <p class="legal__b">
        会員は、休会を希望する月の前月末日までに当社所定の方法で申し出ることにより、翌月から休会することができます。
        休会中は、月会費に代えて休会費として月額1,100円（税込）をお支払いいただきます。休会期間は連続3ヶ月を上限とし、
        上限を超えて復会のお申し出がない場合は、翌月から通常の月会費に戻ります。
        復会を希望する場合は、復会を希望する月の前月末日までにお申し出ください。
      </p>

      <h2 class="legal__h">第5条（退会）</h2>
      <p class="legal__b">
        会員は、退会を希望する月の前月末日までに当社所定の方法で申し出ることにより、希望月の末日をもって退会することができます。
        前月末日を過ぎてのお申し出は、翌月末日での退会となります。月会費の日割り精算は行いません。
        既にお支払いいただいた会費は、当社に責のある場合を除き返金いたしません。
        クレジットカードによる自動決済をご利用の場合、退会月の末日をもって決済を停止します。
      </p>

      <h2 class="legal__h">第6条（会員資格の停止・除名）</h2>
      <p class="legal__b">会員が本規約に違反した場合、会費の支払いを怠った場合、または当施設の秩序・信用を害する行為を行った場合、当社は事前の通知なく会員資格の停止または除名を行うことがあります。</p>

      <h2 class="legal__h">第7条（禁止事項）</h2>
      <p class="legal__b">会員は、会員資格の第三者への貸与・譲渡、他の会員・来店者への迷惑行為、設備の破損、営業妨害、その他当社が不適切と判断する行為を行ってはなりません。</p>

      <h2 class="legal__h">第8条（免責）</h2>
      <p class="legal__b">会員が当施設の利用に際して負傷し、または所持品の紛失・盗難等の損害を被った場合であっても、当社の故意または重大な過失による場合を除き、当社は責任を負いません。</p>

      <h2 class="legal__h">第9条（会員ポータル・モバイルオーダー）</h2>
      <p class="legal__b">
        当社は、会員に対し、会員専用のウェブサービス（以下「会員ポータル」）を提供します。会員は会員ポータルを通じて、来店受付（チェックイン）、予約の確認、レッスン記録の閲覧、店内で提供する飲食物等の注文（以下「モバイルオーダー」）を行うことができます。<br>
        会員がモバイルオーダーにより注文を確定した時点で売買契約が成立し、当社は、会員が月会費のお支払いのために登録したクレジットカードに対し、注文代金を請求します（注文のたびの個別のカード操作は行いません）。会員は、当該カードを注文代金の決済にも使用することについて、あらかじめ同意するものとします。注文代金は、会員ポータルに表示する税込価格（本体価格に消費税を加算した金額）とします。カードが登録されていない場合、またはカード会社の承認が得られなかった場合は、退店時に店頭でお支払いいただきます。<br>
        商品の提供前であれば、会員ポータルまたはスタッフへの申し出により注文を取り消すことができます。提供後の返金は、商品に瑕疵がある場合を除き、原則としてお受けできません。<br>
        会員は、会員ポータルのログイン情報および会員証QRコードを第三者に利用させてはなりません。会員証QRコードが第三者に渡ったおそれがある場合は、会員ポータルの設定画面から再発行できます。クレジットカード情報は当社では保持せず、決済代行会社（Square）が保持します。
      </p>

      <h2 class="legal__h">第10条（個人情報の取り扱い）</h2>
      <p class="legal__b">会員の個人情報は、<a href="privacy.html" style="color:var(--brass-2)">プライバシーポリシー</a>に従い適切に取り扱います。</p>

      <h2 class="legal__h">第11条（規約の変更）</h2>
      <p class="legal__b">当社は、必要に応じて本規約を変更することがあります。変更後の規約は、当施設内の掲示または本ページへの掲載をもって効力を生じるものとします。</p>

      <p class="legal__date">制定日: 2026年8月3日　／　改定日: 2026年8月26日（第9条を追加）（2026年9月2日施行）　／　運営: <span data-frank="store.company">株式会社YOZAN</span></p>
    </div>
  </div>
</section>
"""
    b += foot()
    write("terms.html", b)


def build_404():
    b = head("ページが見つかりません｜FRANK GOLF",
             "お探しのページは見つかりませんでした。",
             "404", noindex=True)
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
    import datetime
    today = datetime.date.today().isoformat()
    # (URL, priority)。noindex のページ（lp-trial / 404 / 会員専用の予約画面）は載せない
    urls = [("home", "1.0"),
            ("trial", "0.9"), ("plan", "0.9"), ("lesson", "0.9"), ("access", "0.8"),
            ("facility", "0.8"), ("beginner", "0.8"), ("faq", "0.7"), ("trial-booking", "0.7"),
            ("concept", "0.6"), ("lounge", "0.6"), ("community", "0.6"), ("corporate", "0.6"),
            ("lp-campaign", "0.5"),
            ("column", "0.6")] + [(c["page"], "0.7") for c in COLUMNS + INTENT_COLUMNS] + [
            ("tokushoho", "0.3"), ("privacy", "0.3"), ("terms", "0.3")]
    body = "\n".join(
        f"  <url><loc>{page_url(p)}</loc><lastmod>{today}</lastmod><priority>{pr}</priority></url>"
        for p, pr in urls
    )
    xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{body}
</urlset>
'''
    write("sitemap.xml", xml)
    ai_bots = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "anthropic-ai",
               "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bytespider", "CCBot", "Amazonbot", "meta-externalagent"]
    txt = "User-agent: *\nAllow: /\n\n"
    txt += "# AI検索・AIアシスタントのクローラーも明示的に許可（店舗情報を正しく引用してもらうため）\n"
    for ua in ai_bots:
        txt += f"User-agent: {ua}\nAllow: /\n\n"
    txt += f"Sitemap: {abs_url('sitemap.xml')}\n# AI向けサイト概要: {abs_url('llms.txt')}\n"
    write("robots.txt", txt)



# ==================================================================
# コラム（#229 SEO）— 「姫路 インドアゴルフ」「姫路 ゴルフ 初心者」の検索意図に答える読みもの
# ==================================================================
# ★書き方のルール
#   ・他店の料金・設備を書かない（比較サイトではない。事実確認できない数字は載せない）
#   ・FRANK の数字は site-data.js と一致させる（ずれると問い合わせで食い違う）
#   ・「上達します」と言い切らない → 「〜しやすくなります」
COLUMNS = [
    {"page": "guide-indoor-golf-himeji", "file": "guide-indoor-golf-himeji.html",
     "title": "姫路でインドアゴルフを選ぶときの5つのチェックポイント",
     "sub": "料金・シミュレーター・レッスン・立地・続けやすさ",
     "desc": "姫路でインドアゴルフを探している方へ。月額料金の見方、シミュレーター（TrackMan など）の違い、レッスンの形式、駐車場・営業時間、続けやすさの5つの観点で、自分に合う施設の選び方をまとめました。",
     "date": "2026-09-09", "img": "hero-2.jpg",
     "alt": "姫路のインドアゴルフ FRANK GOLF の打席とシミュレーター"},
    {"page": "guide-golf-beginner-himeji", "file": "guide-golf-beginner-himeji.html",
     "title": "ゴルフ初心者が姫路で始めるなら｜最初の3か月の進め方と費用の目安",
     "sub": "道具は後でいい。まず「打ってみる」から",
     "desc": "姫路でゴルフを始めたい初心者の方へ。最初に決めること、道具を買う順番、最初の3か月の練習の進め方、インドアゴルフで始める場合の費用の目安、よくある不安への答えをまとめました。",
     "date": "2026-09-09", "img": "lesson-rara.jpg",
     "alt": "所属プロによる初心者向けマンツーマンレッスンの様子"},
    {"page": "guide-trackman", "file": "guide-trackman.html",
     "title": "TrackMan 4 で何が分かる？｜インドアゴルフの計測データの見方",
     "sub": "初心者がまず見るべき3つの数字",
     "desc": "TrackMan 4 はレーダー式の弾道計測器。ボールスピード・ミート率・打ち出し角・スピン量・キャリー・クラブ軌道など、インドアゴルフのシミュレーターで表示される数字の意味と、初心者がまず見るべき3つを解説します。",
     "date": "2026-09-09", "img": "hero-2.jpg",
     "alt": "TrackMan 4 を備えたインドアゴルフの打席"},
]
for _c in COLUMNS:
    PAGE_FILE[_c["page"]] = _c["file"]
    PAGE_LABEL[_c["page"]] = _c["title"]
PAGE_FILE["column"] = "column.html"
PAGE_LABEL["column"] = "コラム・読みもの"


def jsonld_article(c):
    import json
    return json.dumps({
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": c["title"],
        "description": c["desc"],
        "image": abs_url("assets/img/" + c["img"]),
        "datePublished": c["date"],
        "dateModified": c["date"],
        "inLanguage": "ja",
        "mainEntityOfPage": page_url(c["page"]),
        "author": {"@type": "Organization", "name": "FRANK GOLF", "url": page_url("home")},
        "publisher": {"@type": "Organization", "name": "FRANK GOLF（株式会社YOZAN）",
                      "logo": {"@type": "ImageObject", "url": abs_url("assets/ogp.png")}},
        "about": {"@id": (SITE_URL.rstrip("/") + "/#business") if SITE_URL else "#business"},
    }, ensure_ascii=False, separators=(",", ":"))


def column_head(c):
    b = head(f'{c["title"]}｜FRANK GOLF 姫路', c["desc"], c["page"], jsonld=jsonld_article(c), og_type="article")
    b += f"""
<section class="page-head">
  <div class="wrap rv">
    <p class="crumb"><a href="/">HOME</a><span>/</span><a href="column.html">コラム</a><span>/</span>{c["sub"]}</p>
    <h1 class="article__t">{c["title"]}</h1>
    <p class="article__meta"><time datetime="{c["date"]}">{c["date"].replace("-", ".")}</time> ／ FRANK GOLF 姫路・土山</p>
  </div>
</section>
<section class="sec" style="padding-top:0">
  <div class="wrap article rv">
    <figure class="article__hero"><img src="assets/img/{c["img"]}" alt="{c["alt"]}" width="1600" height="900" loading="lazy"></figure>
"""
    return b


def column_foot(c, related):
    lis = "".join(f'<li><a href="{PAGE_FILE[p]}">{PAGE_LABEL[p]}</a></li>' for p in related)
    return f"""
    <aside class="article__cta">
      <p class="article__cta-t">まずは、無料の体験レッスンで打ってみませんか。</p>
      <p>FRANK GOLF（兵庫県姫路市土山6-6-1・駐車場20台無料）では、所属プロのマンツーマン体験レッスン（約55分・通常3,300円）を無料でご案内しています。手ぶらでOK、強引な勧誘はしません。</p>
      <p><a class="btn btn--brass" href="#" data-cta="trial">体験レッスンを予約する</a></p>
    </aside>
    <nav class="article__rel"><p class="article__rel-t">あわせて読む</p><ul>{lis}</ul></nav>
  </div>
</section>
"""


def build_column_index():
    b = head("コラム・読みもの｜姫路のインドアゴルフ FRANK GOLF",
             "姫路のインドアゴルフ FRANK GOLF のコラム。インドアゴルフの選び方、初心者の始め方、TrackMan 4 の計測データの見方など、ゴルフを始める・続けるための読みものです。",
             "column")
    b += page_head("コラム", "COLUMN", "ゴルフを始める・続けるための読みもの",
                   "姫路でインドアゴルフやレッスンを探している方に向けて、選び方や練習の進め方をまとめています。")
    cards = ""
    for c in INTENT_COLUMNS + COLUMNS:
        cards += f"""      <a class="card rv column-card" href="{c["file"]}">
        <img src="assets/img/{c["img"]}" alt="{c["alt"]}" width="800" height="450" loading="lazy">
        <p class="column-card__date"><time datetime="{c["date"]}">{c["date"].replace("-", ".")}</time></p>
        <h2 class="column-card__t">{c["title"]}</h2>
        <p class="card__b">{c["desc"]}</p>
      </a>
"""
    b += f"""
<section class="sec">
  <div class="wrap">
    <div class="grid grid--3">
{cards}    </div>
  </div>
</section>
"""
    b += cta_block()
    b += foot()
    write("column.html", b)


def build_column_indoor():
    c = COLUMNS[0]
    b = column_head(c)
    b += """
    <p class="article__lead">姫路市内にも、ここ数年でインドアゴルフの施設が増えました。雨でも夜でも打てて、打った球の数字がその場で見える。屋外の練習場とは別の良さがある一方で、「どこを選べばいいのか」は分かりにくいものです。ここでは、施設を見学・体験するときに確かめておきたい5つのポイントをまとめました。</p>

    <h2>1. 料金は「月に何回・1回何時間」で考える</h2>
    <p>インドアゴルフの料金は、月額定額（通い放題・回数制）と都度払いに大きく分かれます。安く見えても、ご自身の通い方に合っていなければ割高になります。先に決めておきたいのは次の2つです。</p>
    <ul>
      <li><b>月に何回行けそうか</b>（週1回なら月4回、仕事帰りに週2〜3回なら月10回前後）</li>
      <li><b>1回にどれくらい打つか</b>（30分で集中／1時間じっくり／2時間かけてラウンド練習）</li>
    </ul>
    <p>そのうえで、入会金・レッスン料・シミュレーターの利用料が月額に含まれているか、別料金かを確認します。FRANK GOLF の場合は、月4回までのライト会員（9,800円）、1日1時間通い放題のレギュラー会員（13,800円）、1日最大2時間のマスター会員（19,800円）の3つで、いずれも税抜・月額です。会員は所属プロのワンポイントレッスンを無料で受けられ、25分のマンツーマンだけ別料金（2,500円・税抜）にしています。</p>

    <h2>2. シミュレーターは「何を測れるか」で選ぶ</h2>
    <p>シミュレーターは大きく、レーダーで球とクラブを追いかける方式（TrackMan など）と、カメラで撮影して解析する方式に分かれます。飛距離や方向だけなら多くの機種で分かりますが、<b>クラブの軌道・フェースの向き・スピン量</b>まで見たいなら、計測項目を確認してください。数字が多ければよいわけではなく、レッスンで「どの数字を見て直すか」まで案内してもらえるかが大切です。</p>
    <p>FRANK GOLF では TrackMan 4・DTECT・OKONGOLF の3機種を全3打席に置き、うち1打席はレフティ（左打ち）にも対応しています。数字の見方は <a href="guide-trackman.html">TrackMan 4 で何が分かる？</a> にまとめています。</p>

    <h2>3. レッスンは「誰が・いつ・いくらで」</h2>
    <p>インドアゴルフには、打席だけを貸す施設と、スクールとして指導がつく施設があります。指導つきでも、プロが常駐しているのか、予約したときだけ来るのか、レッスンは月額に含まれるのかで、実際の使い勝手が大きく変わります。</p>
    <p>初心者の方ほど、<b>短いワンポイントを高い頻度で受けられる</b>形が向いています。自己流の癖がつく前に、その日のうちに直せるからです。FRANK GOLF は所属レッスンプロが常駐し、会員はワンポイント（約5分）を無料で、じっくり見てほしいときは25分のマンツーマンをチケットで、という2段構えにしています。</p>

    <h2>4. 立地・駐車場・営業時間</h2>
    <p>姫路はお車で移動する方が多い街です。駅前でない限り、<b>駐車場の台数と無料かどうか</b>は毎回の通いやすさに直結します。あわせて、平日の夜と土日の営業時間、定休日も確認しておきましょう。「行ける時間に開いているか」は、料金と同じくらい続けやすさを左右します。</p>
    <p>FRANK GOLF は兵庫県姫路市土山6-6-1、駐車場は20台・無料です。営業時間は平日10:00〜22:00、土日祝9:00〜20:00、定休日は毎週火曜日。姫路市南部のほか、たつの市・太子町・高砂市・加古川市方面からもお車で来やすい場所です（<a href="access.html">アクセス</a>）。</p>

    <h2>5. 続けやすい雰囲気かどうか</h2>
    <p>最後は、見学や体験で感じる雰囲気です。個室・半個室で人目を気にせず打てるか、一人で行っても居心地がよいか、逆に、聞きたいときに聞ける人がいるか。ゴルフは続けた人が上手くなるスポーツなので、<b>「また来たい」と思えるか</b>を大事にしてください。</p>
    <p>FRANK GOLF は打席とバーカウンターのラウンジがひと続きになっていて、練習の前後にコーヒー一杯分の時間を過ごせます。交流は任意で、打って帰るだけでもまったく問題ありません。</p>

    <h2>まとめ：まず一度、体験で打ってみる</h2>
    <p>料金・シミュレーター・レッスン・立地・雰囲気の5つは、Webの情報だけでは半分しか分かりません。多くの施設が体験や見学を受け付けているので、候補を2〜3に絞ったら、実際に打席に立ってみることをおすすめします。</p>
"""
    b += column_foot(c, ["guide-golf-beginner-himeji", "guide-trackman", "plan", "trial"])
    b += cta_block()
    b += foot()
    write(c["file"], b)


def build_column_beginner():
    c = COLUMNS[1]
    b = column_head(c)
    b += """
    <p class="article__lead">「ゴルフを始めたいけれど、何から手をつければいいのか分からない」。姫路でこの相談をいただくとき、私たちがお伝えしている順番をそのまま書きます。結論から言うと、<b>道具を買う前に、まず一度打ってみる</b>のがいちばんの近道です。</p>

    <h2>最初に決めるのは「何のために」</h2>
    <p>コースデビューを目指すのか、会社や友人の付き合いで恥をかかない程度に打てればよいのか、運動不足の解消なのか。目的によって、最初の3か月でやることが変わります。決まっていなくても大丈夫ですが、体験のときにコーチへ伝えておくと、練習の組み立てが具体的になります。</p>

    <h2>道具は後でいい。買う順番</h2>
    <p>クラブ一式を先に買ってしまい、合わなくて買い直す方は少なくありません。おすすめの順番は次のとおりです。</p>
    <ol>
      <li><b>まず手ぶらで体験</b>。FRANK GOLF の体験レッスンはクラブをこちらでご用意します</li>
      <li><b>グローブ</b>（手に合うものを1枚。数千円）</li>
      <li><b>シューズ</b>（インドアなら普段のスニーカーでも始められます）</li>
      <li><b>クラブ</b>は、数回レッスンを受けて自分の振り方が見えてから。コーチに相談して選ぶと失敗しにくいです</li>
    </ol>

    <h2>最初の3か月の進め方（一例）</h2>
    <h3>1か月目：握り方・構え・7番アイアン</h3>
    <p>いちばん大事な時期です。握り方と構えは、あとから直すほど時間がかかります。7番アイアンなど1本に絞って、「まっすぐ当たる」感覚を体で覚えます。週1回でも、その日のうちにプロに見てもらえる環境だと、癖がつく前に直せます。</p>
    <h3>2か月目：ドライバーとアプローチ</h3>
    <p>飛ばすクラブ（ドライバー）と、グリーン周りの短い距離（アプローチ）を加えます。シミュレーターの数字で、キャリー（落ちるまでの距離）と方向のばらつきを見ながら、番手ごとの「自分の距離」を知っていきます。</p>
    <h3>3か月目：シミュレーターでラウンド体験 → コースデビュー</h3>
    <p>シミュレーターの実在コースを回ってみると、ルールの流れや番手選びが自然に身につきます。ここまで来れば、コースデビューは十分現実的です。兵庫県はゴルフ場の多い県で、姫路周辺から行けるコースも豊富です。FRANK GOLF では初心者向けのラウンド会も企画します。</p>

    <h2>費用の目安（インドアゴルフで始める場合）</h2>
    <p>FRANK GOLF で始める場合の例です（金額は税抜・2026年9月時点）。</p>
    <ul>
      <li>体験レッスン（約55分・所属プロのマンツーマン）：<b>0円</b>（通常3,300円・税込）</li>
      <li>入会金：5,000円 → <b>2026年内のご入会は無料</b></li>
      <li>月会費：ライト 9,800円（月4回まで）／レギュラー 13,800円（1日1時間 通い放題）／マスター 19,800円（1日最大2時間）</li>
      <li>レッスン：ワンポイント（約5分）は会員無料／25分マンツーマンは 2,500円</li>
    </ul>
    <p>屋外の練習場と違って球数ごとの料金がかからないので、「今日は30分だけ」という通い方でも費用が読みやすいのが、月額制のインドアゴルフの良さです。</p>

    <h2>よくある不安に答えます</h2>
    <h3>下手なのに行っていいの？</h3>
    <p>いちばん歓迎しているのが、これから始める方です。屋内の打席なので周りの目はほとんど気になりません。</p>
    <h3>女性一人でも大丈夫？</h3>
    <p>完全予約制の少人数制で、打席とラウンジは落ち着いた雰囲気です。お一人でのご利用も多く想定しています。</p>
    <h3>運動が苦手でも？</h3>
    <p>ゴルフは力より「同じ動きを繰り返せるか」のスポーツです。数字で確かめながら少しずつ進めれば、運動経験に関係なく上達を実感しやすくなります。</p>

    <h2>まとめ</h2>
    <p>目的をざっくり決める → 手ぶらで体験 → 道具はあとから → 3か月でコースデビューを目指す。この順番なら、無駄な買い物も遠回りも減らせます。姫路・土山の FRANK GOLF で、最初の一球をご一緒できたらうれしいです。</p>
"""
    b += column_foot(c, ["beginner", "guide-indoor-golf-himeji", "trial", "lesson"])
    b += cta_block()
    b += foot()
    write(c["file"], b)


def build_column_trackman():
    c = COLUMNS[2]
    b = column_head(c)
    b += """
    <p class="article__lead">インドアゴルフの打席に立つと、画面にたくさんの数字が出ます。全部を理解する必要はありません。この記事では、FRANK GOLF でも使っている TrackMan 4 を例に、数字の意味と、初心者がまず見るべき3つをまとめます。</p>

    <h2>TrackMan とは</h2>
    <p>TrackMan（トラックマン）は、レーダーでボールとクラブの動きを追いかける弾道計測器です。ツアープロの練習やクラブフィッティングでも広く使われており、TrackMan 4 は2つのレーダーでクラブの動きとボールの飛びを別々に捉えます。屋内では、打った直後の数値からその先の弾道を計算して表示します。</p>

    <h2>画面に出る主な数字</h2>
    <dl class="article__dl">
      <dt>ボールスピード（Ball Speed）</dt><dd>打った直後の球の速さ。飛距離にいちばん直結します。</dd>
      <dt>クラブスピード（Club Speed）</dt><dd>インパクト時のヘッドの速さ。「振る速さ」です。</dd>
      <dt>ミート率（Smash Factor）</dt><dd>ボールスピード ÷ クラブスピード。芯に当たっているほど高くなります。ドライバーで1.4台後半が一つの目安です。</dd>
      <dt>打ち出し角（Launch Angle）</dt><dd>球が飛び出す角度。低すぎても高すぎても距離をロスします。</dd>
      <dt>スピン量（Spin Rate）</dt><dd>バックスピンの回転数。多すぎると吹け上がり、少なすぎると失速します。</dd>
      <dt>キャリー（Carry）</dt><dd>球が地面に落ちるまでの距離。コースで番手を選ぶときの基準になります。</dd>
      <dt>クラブパス／フェース角（Club Path / Face Angle）</dt><dd>ヘッドの通り道と、当たった瞬間のフェースの向き。球の曲がり方（スライス・フック）の原因がここに出ます。</dd>
    </dl>

    <h2>初心者がまず見る3つ</h2>
    <h3>1. キャリー ── 自分の「番手ごとの距離」を知る</h3>
    <p>最初に知るべきは、最大飛距離ではなく<b>平均のキャリー</b>です。同じ番手を10球打って、飛びすぎた球と当たり損ないを除いた真ん中あたりが、コースで頼れる距離になります。</p>
    <h3>2. ミート率 ── 「芯に当たったか」を数字で確かめる</h3>
    <p>感覚では分かりにくい「芯に当たった」が、ミート率なら一目で分かります。振る速さを上げるより、まずミート率を安定させるほうが、初心者の飛距離は伸びやすい傾向があります。</p>
    <h3>3. フェース角の傾向 ── 曲がりの原因を一つに絞る</h3>
    <p>スライスが続くとき、原因は軌道かフェースの向きか、その両方です。数球の傾向を見ると「毎回フェースが開いている」のように原因が絞れるので、直すポイントが一つになります。ここはプロと一緒に見るのがいちばん早いところです。</p>

    <h2>数字との付き合い方</h2>
    <ul>
      <li><b>毎回同じ番手・同じ設定で記録する</b>。条件が揃わないと比べられません</li>
      <li><b>1球ではなく平均で見る</b>。良い球だけ覚えていても上達につながりません</li>
      <li><b>一度に直すのは一つ</b>。数字が多いほど、あれもこれもと欲張りがちです</li>
      <li><b>プロの目と組み合わせる</b>。数字は「何が起きたか」を教えてくれますが、「どう直すか」は指導の領域です</li>
    </ul>

    <h2>FRANK GOLF での使い方</h2>
    <p>FRANK GOLF（姫路・土山）では TrackMan 4 のほか DTECT・OKONGOLF を全3打席に備えています。所属レッスンプロが常駐しているので、会員はワンポイントレッスン（約5分）で「今日はこの数字を見よう」と一緒に決めることができます。体験レッスン（無料・約55分）でも、実際に数字を見ながら打っていただけます。</p>
"""
    b += column_foot(c, ["lesson", "facility", "guide-indoor-golf-himeji", "trial"])
    b += cta_block()
    b += foot()
    write(c["file"], b)



# ---- 検索意図ごとのランディング記事（#229・ユーザー指示「初心者 スクール → 初心者ならFRANK GOLFへ」）----
# Google はキーワードごとにトップページの見出しを出し分ける仕組み（クローキング）を禁止しているので、
# 代わりに「キーワード1つ＝記事1本」を用意し、トップの「お悩みから探す」から内部リンクで束ねる。
# 各記事: page / title / sub / desc / img / alt / h1（検索者に向けた一言）/ body / faq（Q&A 3つ → FAQPage 構造化データ）/ related
INTENT_COLUMNS = [
 {"page": "himeji-golf-school-beginner", "file": "himeji-golf-school-beginner.html",
  "kw": "姫路 ゴルフスクール 初心者", "title": "姫路でゴルフスクールを探している初心者の方へ｜初心者なら FRANK GOLF",
  "sub": "はじめての人をいちばん歓迎するスクールです", "date": "2026-09-09", "img": "lesson-rara.jpg",
  "alt": "姫路のゴルフスクール FRANK GOLF で初心者がプロのレッスンを受けている様子",
  "desc": "姫路で初心者向けのゴルフスクールをお探しなら FRANK GOLF（土山）。所属プロのマンツーマン、屋内で人目を気にしない打席、手ぶらでOKの無料体験（約55分）、月額9,800円〜。初心者がスクール選びで確かめたい点もまとめました。",
  "body": """
    <p class="article__lead"><b>結論から。姫路で「初心者歓迎」のゴルフスクールを探しているなら、FRANK GOLF（兵庫県姫路市土山6-6-1）へ一度打ちに来てください。</b>クラブを握ったことがなくても大丈夫です。所属レッスンプロが握り方から見て、屋内の打席なので周りの目も気になりません。体験レッスン（約55分・通常3,300円）は無料で、手ぶらでお越しいただけます。</p>
    <h2>初心者がゴルフスクールを選ぶとき、確かめたい4つ</h2>
    <h3>1. 「初心者専用の時間」ではなく「初心者でも普通に通える」か</h3>
    <p>初心者向けクラスがある施設は多いのですが、クラスの時間に予定を合わせられないと続きません。予約制で、行ける時間にプロがいる形のほうが、仕事帰りや休日に無理なく続けられます。FRANK GOLF は完全予約制で、所属プロが常駐しています。</p>
    <h3>2. 短いレッスンを、高い頻度で受けられるか</h3>
    <p>初心者に必要なのは、長いレッスンを月に1回受けることより、<b>その日の癖をその日に直してもらう</b>ことです。FRANK GOLF では会員の方はワンポイントレッスン（約5分）を無料で何度でも受けられ、じっくり見てほしいときだけ25分のマンツーマン（2,500円・税抜）を足せます。</p>
    <h3>3. 数字で確かめられるか</h3>
    <p>「今のは良かった」を感覚だけで終わらせないために、TrackMan 4 などの計測器があると上達が見えやすくなります。飛距離や芯に当たった度合い（ミート率）が数字で出るので、初心者ほど「変わった」が分かります。</p>
    <h3>4. 通いやすさ（駐車場・営業時間）</h3>
    <p>姫路はお車で通う方が大半です。駐車場20台・無料、平日は22時まで営業しているので、仕事帰りにも寄れます。定休日は毎週火曜日です。</p>
    <h2>FRANK GOLF の初心者向け体験レッスン（約55分・無料）</h2>
    <p>受付 → カウンセリング（ゴルフ歴・目標をうかがいます） → 打席のご案内 → プロのマンツーマン体験レッスン（約30分） → 料金のご説明。強引な勧誘はいたしません。持ち帰ってご検討いただいて大丈夫です。</p>
    <h2>費用の目安</h2>
    <ul>
      <li>体験レッスン：0円（通常3,300円・税込）</li>
      <li>入会金：5,000円（税抜）→ 2026年内のご入会は無料</li>
      <li>月会費：ライト 9,800円／レギュラー 13,800円（1日1時間 通い放題）／マスター 19,800円（税抜）</li>
      <li>ワンポイントレッスン：会員無料　／　25分マンツーマン：2,500円（税抜）</li>
    </ul>
    <p>最初の3か月の進め方は <a href="guide-golf-beginner-himeji.html">ゴルフ初心者が姫路で始めるなら</a> に、道具の買い方も含めて書いています。</p>
""",
  "faq": [
    ("まったくの未経験でもゴルフスクールに通っていいですか？", "はい。FRANK GOLF がいちばん歓迎しているのは、これから始める方です。握り方・構えからプロがお伝えします。"),
    ("初心者の体験レッスンは何を持っていけばいいですか？", "手ぶらでお越しください。クラブはこちらでご用意します。動きやすい服装と、あればグローブをお持ちください。"),
    ("姫路のどこにありますか？", "兵庫県姫路市土山6-6-1（〒670-0996）です。駐車場20台・無料。平日10:00〜22:00、土日祝9:00〜20:00、火曜定休です。"),
  ],
  "related": ["guide-golf-beginner-himeji", "beginner", "trial", "plan"]},

 {"page": "himeji-golf-lesson-women", "file": "himeji-golf-lesson-women.html",
  "kw": "姫路 ゴルフレッスン 女性", "title": "女性が一人でも通いやすい姫路のゴルフレッスン｜FRANK GOLF",
  "sub": "人目を気にせず、自分のペースで", "date": "2026-09-09", "img": "lesson-rara.jpg",
  "alt": "女性プロコーチによるマンツーマンのゴルフレッスン（姫路 FRANK GOLF）",
  "desc": "姫路で女性が一人でも通いやすいゴルフレッスンをお探しの方へ。FRANK GOLF（土山）は完全予約制の屋内打席、女性の所属レッスンプロ、無料の体験レッスン（約55分・手ぶらOK）。始めやすさと続けやすさをまとめました。",
  "body": """
    <p class="article__lead">「興味はあるけれど、打ちっぱなしに一人で行くのは気が引ける」。姫路で女性の方からいちばん多くいただく声です。<b>FRANK GOLF（姫路・土山）は、完全予約制の屋内打席で、女性の所属レッスンプロがマンツーマンで見ます。</b>周りの目を気にせず、ご自身のペースで始められます。</p>
    <h2>女性が一人でも通いやすい理由</h2>
    <ul>
      <li><b>完全予約制の屋内打席</b>。隣の打席から見られる屋外練習場とは違い、落ち着いて打てます</li>
      <li><b>女性のレッスンプロが所属</b>。メインコーチの「らら」（小川うらら／USGTF レベルⅢ）が常駐。YouTube「RaRa LESSON」でも初心者向けに発信しています</li>
      <li><b>手ぶらでOK</b>。体験はクラブをこちらでご用意。道具は始めてから、コーチと相談して選べます</li>
      <li><b>お車で来やすい</b>。駐車場20台・無料。平日は22時まで、土日祝は9時から</li>
      <li><b>カフェ感覚のラウンジ</b>。コーヒーやソフトドリンクがあり、お酒が飲めなくても過ごせます。交流は任意です</li>
    </ul>
    <h2>レッスンの形</h2>
    <p>会員の方は、所属プロのワンポイントレッスン（約5分）を無料で受けられます。「今日はスライスを直したい」「番手ごとの距離を知りたい」といった一点を、その日のうちに。じっくり見てほしいときは25分のマンツーマン（2,500円・税抜）を足せます。TrackMan 4 の数字で、変化を自分の目で確かめられます。</p>
    <h2>まずは無料の体験レッスンから</h2>
    <p>約55分、通常3,300円のところ無料です。カウンセリングで目標をうかがってから、実際に打っていただきます。ご入会の説明はしますが、強引なお誘いはしません。</p>
""",
  "faq": [
    ("女性一人でも浮きませんか？", "完全予約制で、打席は屋内。お一人でのご利用を前提に設計しています。女性の所属プロもいます。"),
    ("服装は？", "動きやすい服装で大丈夫です。インドアなのでスニーカーでも始められます。"),
    ("お酒を飲まなくてもラウンジは使えますか？", "はい。コーヒー・紅茶・ソフトドリンクをご用意しています。ラウンジの利用も交流も任意です。"),
  ],
  "related": ["himeji-golf-school-beginner", "lesson", "lounge", "trial"]},

 {"page": "himeji-golf-lesson-private", "file": "himeji-golf-lesson-private.html",
  "kw": "姫路 ゴルフレッスン マンツーマン", "title": "姫路でマンツーマンのゴルフレッスンを受けるなら｜所属プロ×TrackMan 4 の FRANK GOLF",
  "sub": "感覚ではなく、数字で直す", "date": "2026-09-09", "img": "lesson-rara-wide.jpg",
  "alt": "TrackMan 4 のデータを見ながらのマンツーマンレッスン（姫路 FRANK GOLF）",
  "desc": "姫路でマンツーマンのゴルフレッスンをお探しの方へ。FRANK GOLF（土山）は所属レッスンプロが常駐、TrackMan 4 の計測データで原因を一つに絞って直します。会員はワンポイント無料、25分マンツーマン2,500円（税抜）。",
  "body": """
    <p class="article__lead">グループレッスンで「順番待ちの時間が長い」「自分の番になると質問が浮かばない」と感じたことはありませんか。<b>FRANK GOLF（姫路・土山）のレッスンは、所属プロによるマンツーマンが基本です。</b>TrackMan 4 の計測データを一緒に見て、「今日はこの一点」を決めて直します。</p>
    <h2>FRANK GOLF のマンツーマンレッスン</h2>
    <dl class="article__dl">
      <dt>ワンポイント（約5分）</dt><dd>会員は無料・回数制限なしの感覚で。練習中に「ちょっと見てください」と呼べる距離感です</dd>
      <dt>25分マンツーマン</dt><dd>2,500円（税抜）。チケット制。スイングの組み立てから見直したいとき、コースデビュー前の総点検に</dd>
      <dt>体験レッスン（約55分）</dt><dd>無料（通常3,300円・税込）。カウンセリング＋約30分のマンツーマン</dd>
    </dl>
    <h2>「数字で直す」とはどういうことか</h2>
    <p>スライスが出るとき、原因はクラブの軌道か、フェースの向きか、その両方です。目で見ただけでは切り分けにくいのですが、TrackMan 4 はクラブパス・フェース角・打ち出し角・スピン量を1球ごとに出します。プロがその数字を読み、<b>直すポイントを一つに絞る</b>。だから短いレッスンでも変化が出やすくなります。数字の見方は <a href="guide-trackman.html">TrackMan 4 で何が分かる？</a> にまとめました。</p>
    <h2>コーチ</h2>
    <p>メインコーチは所属レッスンプロの「らら」（小川うらら）。USGTF レベルⅢ、YouTube「RaRa LESSON」で6万人超に向けて発信しています。初心者から100切り・90切りを目指す方まで、目的に合わせて組み立てます。</p>
    <h2>場所・営業時間</h2>
    <p>兵庫県姫路市土山6-6-1（駐車場20台・無料）。平日10:00〜22:00、土日祝9:00〜20:00、火曜定休。仕事帰りの30分レッスンにも使えます。</p>
""",
  "faq": [
    ("レッスンは予約が必要ですか？", "打席が完全予約制です。ワンポイントはご利用中にお声がけください。25分マンツーマンはご予約時にレッスンを選べます。"),
    ("経験者・中級者でも受けられますか？", "はい。TrackMan 4 の数字をもとに、スコアの詰まっているところを一緒に探します。"),
    ("レッスンだけ受けて、練習は他でしてもいいですか？", "もちろんです。ただ、同じ計測器で継続して数字を見るほうが変化が追いやすいので、会員プランとの組み合わせをおすすめしています。"),
  ],
  "related": ["lesson", "guide-trackman", "himeji-golf-school-beginner", "plan"]},

 {"page": "himeji-golf-bar", "file": "himeji-golf-bar.html",
  "kw": "姫路 ゴルフバー", "title": "姫路のゴルフバーなら FRANK GOLF｜打席とバーカウンターがひと続きのラウンジ",
  "sub": "打って、教わって、語れる", "date": "2026-09-09", "img": "lounge.jpg",
  "alt": "姫路のゴルフバー FRANK GOLF のバーカウンター",
  "desc": "姫路でゴルフバーをお探しなら FRANK GOLF（土山）。シミュレーター3打席とバーカウンターのラウンジがひと続き。会員制で落ち着いた雰囲気、ゴルフ談義・ラウンドの反省会・コンペの打ち上げに。駐車場20台無料。",
  "body": """
    <p class="article__lead">FRANK GOLF は、元ゴルフバーのバーカウンターを受け継いだ、姫路・土山のインドアゴルフラウンジです。<b>打席とバーがひと続き</b>なので、練習の前後にゴルフの話をしながら一杯──という時間の使い方ができます。</p>
    <h2>ゴルフバーとしての使い方</h2>
    <ul>
      <li><b>ラウンド後の反省会</b>。シミュレーターで「あのホールのあの1打」を打ち直しながら</li>
      <li><b>ゴルフ仲間との待ち合わせ</b>。カウンターでコーヒーやソーダを飲みながら、次のラウンドの相談</li>
      <li><b>会員限定コンペの打ち上げ</b>。ソファ席・パーティースペースもあります</li>
      <li><b>一人でふらっと</b>。カウンター中心なので、お一人でも過ごしやすい席配置です</li>
    </ul>
    <h2>ドリンク</h2>
    <p>コーヒー・紅茶・ソフトドリンク 350円〜、FRANK オリジナルソーダ・ノンアルコールカクテル 500円〜（税込・会員価格あり）。お酒が飲めない方も、お車の方も過ごせるメニューにしています。</p>
    <h2>会員制について</h2>
    <p>FRANK GOLF は会員制のインドアゴルフです。ラウンジは会員の方と、体験・見学でお越しの方にご利用いただいています。「バーだけ」の営業ではなく、練習とセットで過ごしていただく場所です。まずは無料の体験レッスン（約55分）でラウンジの雰囲気もご覧ください。</p>
    <h2>場所</h2>
    <p>兵庫県姫路市土山6-6-1。駐車場20台・無料。平日10:00〜22:00、土日祝9:00〜20:00、火曜定休。</p>
""",
  "faq": [
    ("会員でなくてもバーだけ利用できますか？", "ラウンジは会員の方と、体験・見学でお越しの方にご利用いただいています。まずは無料の体験レッスンでご来店ください。"),
    ("お酒は飲めますか？", "現在のメニューはコーヒー・紅茶・ソフトドリンク・オリジナルソーダ・ノンアルコールカクテルです。お車の方も安心してお過ごしいただけます。"),
    ("何人くらいで使えますか？", "カウンターのほか、ソファ席・パーティースペースがあります。コンペの打ち上げなど人数の多いご利用は公式LINEでご相談ください。"),
  ],
  "related": ["lounge", "community", "facility", "trial"]},

 {"page": "himeji-golf-range-unlimited", "file": "himeji-golf-range-unlimited.html",
  "kw": "姫路 ゴルフ練習場 打ち放題 安い", "title": "姫路で「通い放題」のゴルフ練習場を探している方へ｜月額制インドアという選択",
  "sub": "球数を数えない練習に変える", "date": "2026-09-09", "img": "hero-2.jpg",
  "alt": "月額制で通い放題のインドアゴルフ練習場（姫路 FRANK GOLF）",
  "desc": "姫路で打ち放題・通い放題のゴルフ練習場をお探しの方へ。月額制インドアゴルフ FRANK GOLF（土山）はレギュラー会員13,800円（税抜）で1日1時間通い放題、平日22時まで営業、TrackMan 4 で毎球計測。球数課金との違いを解説します。",
  "body": """
    <p class="article__lead">打ちっぱなしの「球数×単価」は、練習するほど費用が増えます。<b>月額制のインドアゴルフなら、球数を気にせず「今日は30分だけ」でも「週3回」でも定額</b>です。FRANK GOLF（姫路・土山）のレギュラー会員は月13,800円（税抜）で1日1時間の通い放題。平日は22時まで開いています。</p>
    <h2>球数課金と月額制、どちらが向いているか</h2>
    <p>月に2回、まとめて何百球も打つ方は球数課金でも構いません。一方で、<b>週1回以上・短時間で通いたい方</b>は月額制のほうが費用が読みやすく、ムダ打ちも減ります。1球ごとにお金がかかると「とにかく打つ」練習になりがちですが、定額だと1球ずつ数字を見ながら打てるからです。</p>
    <h2>FRANK GOLF の会員プラン（税抜・月額）</h2>
    <ul>
      <li><b>ライト</b> 9,800円 ── 月4回まで。週1回ペースの方に</li>
      <li><b>レギュラー</b> 13,800円 ── 全営業日・1日1時間 通い放題。いちばん人気</li>
      <li><b>マスター</b> 19,800円 ── 全営業日・1日最大2時間。たっぷり打ちたい方に</li>
    </ul>
    <p>入会金5,000円（税抜）は2026年内のご入会で無料。会員は所属プロのワンポイントレッスン（約5分）も無料です。</p>
    <h2>屋外の練習場との違い</h2>
    <dl class="article__dl">
      <dt>天候・時間</dt><dd>雨でも夏の夜でも同じ環境。平日は22時まで</dd>
      <dt>計測</dt><dd>TrackMan 4・DTECT・OKONGOLF が毎球のキャリー・方向・ミート率を表示。「なんとなく良かった」で終わらない</dd>
      <dt>距離感</dt><dd>実在コースのシミュレーションでラウンド練習も可能</dd>
      <dt>人目</dt><dd>完全予約制の屋内打席。3打席（うち1打席はレフティ対応）</dd>
    </dl>
    <h2>場所・営業時間</h2>
    <p>兵庫県姫路市土山6-6-1。駐車場20台・無料。平日10:00〜22:00、土日祝9:00〜20:00、火曜定休。姫路市南部・たつの市・太子町・高砂市・加古川市からもお車で。</p>
""",
  "faq": [
    ("1日1時間通い放題とは？", "レギュラー会員は、営業日であれば毎日1時間まで打席を予約してご利用いただけます。予約は前の予約を消化してから次を取る形です。"),
    ("夜は何時まで？", "平日は22:00まで、土日祝は20:00までです（火曜定休）。"),
    ("ビジター（都度払い）はありますか？", "現在は会員制でのご案内です。まずは無料の体験レッスン（約55分）をご利用ください。"),
  ],
  "related": ["plan", "facility", "guide-indoor-golf-himeji", "trial"]},

 {"page": "indoor-golf-cost", "file": "indoor-golf-cost.html",
  "kw": "インドアゴルフ 料金 相場 初期費用", "title": "インドアゴルフはいくらかかる？初期費用と月額の内訳｜姫路 FRANK GOLF の場合",
  "sub": "「安い／高い」の前に、内訳を知る", "date": "2026-09-09", "img": "play.jpg",
  "alt": "インドアゴルフの打席（姫路 FRANK GOLF）",
  "desc": "インドアゴルフの料金はいくら？初期費用（入会金・道具）と月額（会費・レッスン）の内訳、月額制と都度払いの違い、続けやすい料金の考え方を解説。姫路 FRANK GOLF の実例（体験0円・入会金2026年内無料・月額9,800円〜）つき。",
  "body": """
    <p class="article__lead">「インドアゴルフはいくらくらいしますか？」という質問に一言で答えるのは難しく、<b>初期費用・月額・レッスン料の3つに分けて見る</b>と比べやすくなります。この記事では内訳の考え方と、姫路 FRANK GOLF の実例を書きます。</p>
    <h2>1. 初期費用</h2>
    <ul>
      <li><b>入会金</b>：施設によって無料〜数万円まで幅があります。キャンペーンで無料になる時期も多いので、確認する価値があります</li>
      <li><b>道具</b>：最初は不要です。体験は手ぶらでOKの施設がほとんど。買うならグローブ→シューズ→クラブの順で、クラブはレッスンを受けてから選ぶと失敗しにくいです</li>
    </ul>
    <h2>2. 月額（会費）</h2>
    <p>月額制は「月◯回まで」「1日◯時間まで通い放題」のように、回数か時間で上限が決まります。安いプランほど回数が少ないので、<b>自分が月に何回・1回何分打つか</b>を先に決めてから選ぶのがコツです。都度払い（ビジター）は1回あたりの単価が高めなので、月2回以上通うなら月額制のほうが割安になることが多いです。</p>
    <h2>3. レッスン料</h2>
    <p>ここがいちばん差の出るところです。「打席だけ」の施設はレッスンが別料金か、そもそも無い場合があります。スクール型は月額にレッスンが含まれることが多く、初心者ほどレッスン込みの施設が結果的に安くつきます。</p>
    <h2>姫路 FRANK GOLF の場合（2026年9月時点・税抜）</h2>
    <dl class="article__dl">
      <dt>体験レッスン</dt><dd>0円（通常3,300円・税込）・約55分・所属プロのマンツーマン</dd>
      <dt>入会金</dt><dd>5,000円 → 2026年内のご入会は無料</dd>
      <dt>ライト会員</dt><dd>9,800円／月（月4回まで）</dd>
      <dt>レギュラー会員</dt><dd>13,800円／月（全営業日・1日1時間 通い放題）</dd>
      <dt>マスター会員</dt><dd>19,800円／月（全営業日・1日最大2時間）</dd>
      <dt>レッスン</dt><dd>ワンポイント（約5分）は会員無料／25分マンツーマン 2,500円</dd>
      <dt>法人プラン</dt><dd>ライト 39,800円／プレミアム 59,800円（月額・会社契約）</dd>
    </dl>
    <p>表示金額は税抜、カッコ内や店頭表示では税込（消費税10%）を併記しています。</p>
    <h2>「続けられる料金」が、いちばん安い</h2>
    <p>3か月で辞めてしまえば、安いプランでも高くつきます。行ける時間に開いているか、駐車場があるか、聞ける人がいるか──料金表に出ない部分が、結局は費用対効果を決めます。まずは体験で確かめてください。</p>
""",
  "faq": [
    ("インドアゴルフの月額はいくらくらい？", "回数制か通い放題かで変わります。FRANK GOLF は月4回9,800円、1日1時間通い放題13,800円、1日2時間19,800円（いずれも税抜）です。"),
    ("初期費用はいくらかかりますか？", "FRANK GOLF の場合、入会金5,000円（税抜）が2026年内は無料、体験も無料なので、初月の会費から始められます。道具は手ぶらで大丈夫です。"),
    ("レッスンは別料金ですか？", "所属プロのワンポイントレッスン（約5分）は会員無料です。25分マンツーマンのみ2,500円（税抜）です。"),
  ],
  "related": ["plan", "guide-indoor-golf-himeji", "himeji-golf-range-unlimited", "trial"]},

 {"page": "area", "file": "area.html",
  "kw": "たつの 太子町 高砂 加古川 土山 ゴルフ レッスン", "title": "土山・御着・別所、たつの市・太子町・高砂市・加古川市からのインドアゴルフ｜FRANK GOLF 姫路",
  "sub": "お車で通いやすい、姫路市南東部の立地", "date": "2026-09-09", "img": "hero-1.jpg",
  "alt": "駐車場20台を備えた FRANK GOLF 姫路・土山の外観",
  "desc": "姫路市土山・御着・別所のほか、たつの市・太子町・揖保郡・高砂市・加古川市からインドアゴルフやゴルフレッスンをお探しの方へ。FRANK GOLF は兵庫県姫路市土山6-6-1、駐車場20台無料、平日22時まで。",
  "body": """
    <p class="article__lead">FRANK GOLF は兵庫県姫路市土山6-6-1、姫路市の南東部にあります。<b>お車でのご来店を前提に、駐車場を20台・無料</b>でご用意しています。姫路市内はもちろん、近隣の市町からも通いやすい立地です。</p>
    <h2>対応エリア</h2>
    <ul>
      <li><b>姫路市</b>：土山・御着・別所・四郷・花田・飾磨・広畑・網干 ほか市内全域</li>
      <li><b>たつの市・揖保郡太子町</b>：国道2号・姫路バイパス方面から</li>
      <li><b>高砂市・加古川市</b>：加古川バイパス・国道2号方面から</li>
    </ul>
    <p>いずれも、仕事帰りの1時間で通える距離感を想定しています。平日は22時まで営業しています。</p>
    <h2>近隣にお住まいの方の使い方</h2>
    <dl class="article__dl">
      <dt>仕事帰りに30分</dt><dd>レギュラー会員（1日1時間 通い放題）で、帰り道に寄って打つ</dd>
      <dt>週末にじっくり</dt><dd>マスター会員（1日最大2時間）でシミュレーターのラウンド練習</dd>
      <dt>まず月4回から</dt><dd>ライト会員で週1ペース。所属プロのワンポイントは無料</dd>
    </dl>
    <h2>店舗情報</h2>
    <dl class="article__dl">
      <dt>住所</dt><dd>〒670-0996 兵庫県姫路市土山6-6-1</dd>
      <dt>電話</dt><dd>079-260-6671</dd>
      <dt>営業時間</dt><dd>平日 10:00〜22:00 ／ 土日祝 9:00〜20:00</dd>
      <dt>定休日</dt><dd>毎週火曜日</dd>
      <dt>駐車場</dt><dd>20台・無料</dd>
      <dt>打席</dt><dd>3打席（うち1打席はレフティ左右打席対応）／TrackMan 4・DTECT・OKONGOLF</dd>
    </dl>
    <p>地図・道順は <a href="access.html">アクセス</a> をご覧ください。体験レッスン（約55分・無料）は <a href="trial-booking.html">Webから日時を選ぶだけ</a>で予約できます。</p>
""",
  "faq": [
    ("たつの市・太子町から通っている人はいますか？", "はい、姫路市外からのご来店も想定した立地です。駐車場20台無料で、平日は22時まで営業しています。"),
    ("最寄りの高速・バイパスは？", "姫路バイパス・国道2号方面からお越しいただく方が多い想定です。詳しい道順はGoogleマップ（アクセスページ）でご確認ください。"),
    ("送迎や公共交通は？", "送迎はありません。お車でのご来店を前提に駐車場をご用意しています。"),
  ],
  "related": ["access", "plan", "guide-indoor-golf-himeji", "trial"]},
]
for _c in INTENT_COLUMNS:
    PAGE_FILE[_c["page"]] = _c["file"]
    PAGE_LABEL[_c["page"]] = _c["title"]


def build_intent_column(c):
    import json
    faq_ld = jsonld_faq(c["faq"])
    b = head(f'{c["title"]}', c["desc"], c["page"], jsonld=jsonld_article(c) + "</script>\n<script type=\"application/ld+json\">" + faq_ld, og_type="article")
    b += f"""
<section class="page-head">
  <div class="wrap rv">
    <p class="crumb"><a href="/">HOME</a><span>/</span><a href="column.html">コラム</a><span>/</span>{c["sub"]}</p>
    <h1 class="article__t">{c["title"]}</h1>
    <p class="article__meta"><time datetime="{c["date"]}">{c["date"].replace("-", ".")}</time> ／ FRANK GOLF 姫路・土山</p>
  </div>
</section>
<section class="sec" style="padding-top:0">
  <div class="wrap article rv">
    <figure class="article__hero"><img src="assets/img/{c["img"]}" alt="{c["alt"]}" width="1600" height="900" loading="lazy"></figure>
{c["body"]}
    <h2>よくあるご質問</h2>
    <div class="faq">
{faq_items(c["faq"])}    </div>
"""
    b += column_foot(c, c["related"])
    b += cta_block()
    b += foot()
    write(c["file"], b)


def build_intent_columns():
    for c in INTENT_COLUMNS:
        build_intent_column(c)


# ---- AI検索（ChatGPT / Perplexity / Google AI）向け: llms.txt ----
def build_llms_txt():
    lines = ["# FRANK GOLF（フランクゴルフ）— 姫路・土山のインドアゴルフスクール", "",
             "> 兵庫県姫路市土山6-6-1にある会員制インドアゴルフラウンジ。TrackMan 4 など3台のシミュレーター打席、所属レッスンプロのマンツーマンレッスン、バーカウンター併設のラウンジ。運営は株式会社YOZAN。2026年9月オープン。", "",
             "## 基本情報", "- 住所: 〒670-0996 兵庫県姫路市土山6-6-1", "- 電話: 079-260-6671",
             "- 営業時間: 平日 10:00〜22:00 ／ 土日祝 9:00〜20:00 ／ 定休日 毎週火曜日",
             "- 駐車場: 20台・無料", "- 打席: 3打席（うち1打席はレフティ左右打席対応）／ TrackMan 4・DTECT・OKONGOLF",
             "- コーチ: 所属レッスンプロ らら（小川うらら）／ USGTF レベルⅢ", "",
             "## 料金（税抜）", "- 体験レッスン: 無料（通常3,300円 税込）・約55分・手ぶらOK・マンツーマン",
             "- 入会金: 5,000円（2026年内のご入会は無料）",
             "- ライト会員: 9,800円/月（月4回まで）", "- レギュラー会員: 13,800円/月（全営業日・1日1時間 通い放題）",
             "- マスター会員: 19,800円/月（全営業日・1日最大2時間）",
             "- レッスン: ワンポイント（約5分）会員無料 ／ 25分マンツーマン 2,500円",
             "- 法人: ライト 39,800円/月（利用者2名まで・4コマ）／ プレミアム 59,800円/月（人数制限なし・8コマ・同伴無料）", "",
             "## 主要ページ"]
    for p, label in [("home", "トップ"), ("trial", "体験レッスン"), ("trial-booking", "体験の予約フォーム"), ("plan", "料金・会員プラン"),
                     ("lesson", "レッスン"), ("facility", "施設・設備"), ("access", "アクセス"), ("faq", "よくあるご質問"),
                     ("beginner", "はじめての方へ"), ("corporate", "法人でのご利用"), ("lounge", "バー・ラウンジ"), ("column", "コラム一覧")]:
        lines.append(f"- [{label}]({page_url(p)})")
    lines += ["", "## コラム（検索の目的別）"]
    for c in COLUMNS + INTENT_COLUMNS:
        lines.append(f"- [{c['title']}]({page_url(c['page'])}): {c['desc']}")
    lines += ["", "## SNS・予約", "- Instagram: https://www.instagram.com/frank_golf_himeji", "- 公式LINE: https://lin.ee/yp2leQU",
              "- 会員ページ: https://my.frankgolf.jp/", "- Web入会: https://my.frankgolf.jp/join-web", ""]
    write("llms.txt", "\n".join(lines))


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
    build_trial_booking()
    build_lp_trial()
    build_lp_campaign()
    build_tokushoho()
    build_privacy()
    build_terms()
    build_404()
    build_column_index()
    build_column_indoor()
    build_column_beginner()
    build_column_trackman()
    build_intent_columns()
    build_llms_txt()
    build_sitemap()
    print("done.")
