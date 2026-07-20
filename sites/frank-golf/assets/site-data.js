/* ============================================================
   FRANK GOLF — サイト可変データ（★ここだけ直せばサイト全体に反映）
   ------------------------------------------------------------
   ■ ルール
     ・値が null            → 画面に「近日公開」と表示される（勝手な数字は出しません）
     ・値が "文字列"        → そのまま表示される
     ・値の末尾 _TBD: true  → 「仮」の意味。確定したら false にする
   ■ 変更したら
     ・保存 → ブラウザで再読み込み。ビルド作業は不要です。
   ============================================================ */

window.FRANK = {

  /* ---------- 開業情報 ---------- */
  preopen: {
    date: "2026年9月2日",        // ★確定済み
    label: "PRE-OPEN",
    // プレオープン特典の内容（未確定 → null のまま）
    benefits: null,
    // 例: benefits: ["入会金無料", "初月会費半額"],
    grandOpenDate: "2026年9月5日",  // ★グランドオープン（確定）
  },

  /* ---------- 店舗基本情報（★すべて未確定 = null） ---------- */
  store: {
    name: "FRANK GOLF",
    nameJa: "フランクゴルフ",
    area: "姫路・土山",            // ★確定済み
    postal: null,                  // 例: "〒670-0000"（番地まで確定したら記入）
    address: "兵庫県姫路市土山6-6-1",  // ★確定
    mapUrl: "https://www.google.com/maps/search/?api=1&query=%E5%85%B5%E5%BA%AB%E7%9C%8C%E5%A7%AB%E8%B7%AF%E5%B8%82%E5%9C%9F%E5%B1%B16-6-1",  // ★Googleマップ
    mapEmbed: "https://maps.google.com/maps?q=%E5%85%B5%E5%BA%AB%E7%9C%8C%E5%A7%AB%E8%B7%AF%E5%B8%82%E5%9C%9F%E5%B1%B16-6-1&z=16&output=embed",  // ★埋め込み地図
    tel: null,                     // 例: "079-000-0000"（確定後）
    email: null,
    hours: "平日 11:00〜22:00 ／ 土日祝 9:00〜20:00",  // ★確定
    holiday: "毎週火曜日",          // ★確定
    parking: "最大20台・無料",      // ★確定
    access: "お車でのご来店に便利な立地（駐車場20台完備）",  // ★確定
    bays: "全4打席（うち1打席はレフティ左右打席対応）",      // ★確定
    simulator: "OKONGOLF ほか最新シミュレーター 計4台",       // ★確定
    lounge: "バーカウンター併設のラウンジ",  // ★確定
    company: "株式会社YOZAN",      // ★確定済み
  },

  /* ---------- 料金（★出資資料より・確定） ---------- */
  price: {
    // 個人3プラン（カード表示）
    plans: [
      { id: "light", name: "LIGHT", nameJa: "ライト会員", price: "9,800円 / 月", featured: false,
        features: ["平日昼間の利用中心（月8回まで）", "日中ゆったり練習したい方に"] },
      { id: "regular", name: "REGULAR", nameJa: "レギュラー会員（一番人気）", price: "13,800円 / 月", featured: true,
        features: ["全営業日ご利用可能", "1日1時間 通い放題", "毎日練習して上達したいメイン層に"] },
      { id: "master", name: "MASTER", nameJa: "マスター会員", price: "19,800円 / 月", featured: false,
        features: ["全営業日ご利用可能", "1日最大2時間まで", "たっぷり練習したい熱心な方に"] },
    ],
    // 法人プラン（料金ページのスペック表・法人ページに表示）
    corporate: [
      { name: "法人ライトプラン", price: "39,800円 / 月", desc: "最大2名様登録／社員の福利厚生・接待前の調整に" },
      { name: "法人プレミアムプラン", price: "59,800円 / 月", desc: "最大4名様登録／同伴ビジター無料枠つきの最上級プラン" },
    ],
    // レッスン料金
    lessonPrice: "25分マンツーマン 2,500円 ／ 4回チケット 9,000円 ／ 8回チケット 16,000円",
    joinFee: null,      // 入会金（未確定 → 近日公開）
    trialFee: null,     // 体験利用料（未確定 → 近日公開）
    visitorFee: null,   // ビジター利用料（未確定 → 近日公開）
    note: "表示金額はすべて税抜（月額）です。",
  },

  /* ---------- レッスン（★未確定 = null） ---------- */
  lesson: {
    style: "プロ常駐によるワンポイントレッスン（求めたときに5〜10分、受け放題感覚）",  // ★確定
    coaches: "藤田 晃規（ツアープロ／JGTOツアーメンバー・兵庫県出身）",  // ★確定
    menu: "ワンポイントレッスン（会員は受け放題感覚）／ 25分マンツーマン・チケット制も選べます",  // ★確定
    beginnerProgram: null,  // 初心者向けの具体プログラムは近日公開
  },

  /* ---------- 体験利用（★未確定 = null） ---------- */
  trial: {
    content: null,      // 体験の内容
    duration: null,     // 所要時間
    bring: null,        // 持ち物
    note: null,
  },

  /* ---------- バー・ラウンジ（★未確定 = null） ---------- */
  lounge: {
    drink: null,        // ドリンクの内容（近日公開）
    food: null,
    seats: null,
    hours: null,
    note: "元ゴルフバーのバーカウンターを承継。練習の前後に、ゴルフ談義を楽しめる交流空間です。",  // ★確定（コンセプト）
  },

  /* ---------- 画像（★サンプル。本番は同じファイル名で実写に差し替え） ----------
     assets/img/ 内のJPGを上書きすればOK。別名にするならここのパスを変更してください。
     すべて「差し替え前提のサンプル画像」です（抽象アトモスフィア）。 */
  images: {
    hero:      "assets/img/hero.jpg",       // メインビジュアル背景（1920x1200 目安）
    concept:   "assets/img/concept.jpg",    // コンセプト
    play:      "assets/img/play.jpg",       // 施設・打席
    lesson:    "assets/img/lesson.jpg",     // レッスン
    lounge:    "assets/img/lounge.jpg",     // バー・ラウンジ
    community: "assets/img/community.jpg",  // コミュニティ
    // プレオープン告知バナー（トップの帯・SNS・LINE配布用）
    bannerWide:   "assets/banner-wide.jpg",   // Web横長 1200x420
    bannerSquare: "assets/banner-square.jpg", // Instagram 1080x1080
    bannerLine:   "assets/banner-line.jpg",   // LINEリッチメニュー 2500x843
  },

  /* ---------- 予約・会員システム（Genesis / member-os） ---------- */
  links: {
    // ★体験予約：member-os の体験申込フォームに接続（公開・トークン不要）。
    //   member-os をデプロイすると有効になります（/trial ルート）。
    trialBooking: "https://member-os-tau.vercel.app/trial",

    // ★Web入会：member-os のWeb入会申込フォーム（公開・プラン選択つき）。
    joinWeb: "https://member-os-tau.vercel.app/join-web",

    // （旧）オンサイトのFormspreeフォームは使いません＝member-osに集約。null固定でOK。
    trialForm: null,

    // ★公式LINE（未設定の間はボタンが「近日公開」表示になります）
    line: null,           // 例: "https://lin.ee/xxxxxxx"

    // 会員向け（member-os / 稼働中）
    memberLogin:    "https://member-os-tau.vercel.app/member/login",
    memberRegister: "https://member-os-tau.vercel.app/member/register",
    memberBooking:  "https://member-os-tau.vercel.app/member/book",
    memberHome:     "https://member-os-tau.vercel.app/member",

    instagram: null,
    youtube: null,
  },

  /* ---------- お知らせ ----------
     ここに足すと、トップの NEWS セクションに自動で並びます（新しい順に手動で並べてください）。
     0件にすると NEWS セクションごと自動で非表示になります。
     tag は省略可（既定は「お知らせ」）。url は無ければ null でOK（リンクなしで表示）。 */
  news: [
    {
      date: "2026-07-18",
      tag: "お知らせ",
      title: "2026年9月2日プレオープン・9月5日グランドオープン。姫路・土山に FRANK GOLF が誕生します。体験のご予約は公式LINEより承ります。",
      url: null,
    },
  ],
};
