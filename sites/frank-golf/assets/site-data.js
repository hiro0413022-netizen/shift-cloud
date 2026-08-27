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
    // ★埋め込み地図。hl=ja を付けないと地名がローマ字（Tsuchiyama / 6 CHOME）で出る
    mapEmbed: "https://maps.google.com/maps?q=%E5%85%B5%E5%BA%AB%E7%9C%8C%E5%A7%AB%E8%B7%AF%E5%B8%82%E5%9C%9F%E5%B1%B16-6-1&hl=ja&z=16&output=embed",
    tel: null,                     // 例: "079-000-0000"（確定後）
    email: null,
    hours: "平日 10:00〜22:00 ／ 土日祝 9:00〜20:00",  // ★確定（2026-08-07 更新）
    holiday: "毎週火曜日",          // ★確定
    parking: "最大20台・無料",      // ★確定
    access: "お車でのご来店に便利な立地（駐車場20台完備）",  // ★確定
    bays: "全3打席（うち1打席はレフティ左右打席対応）※4打席目はオープン約3ヶ月後に増設予定",      // ★確定（2026-08-27 更新）
    simulator: "TrackMan 4・DTECT・OKONGOLF の最新シミュレーター 計3台",       // ★確定（2026-08-27 更新）
    lounge: "バーカウンター併設のラウンジ",  // ★確定
    company: "株式会社YOZAN",      // ★確定済み
  },

  /* ---------- 料金（★出資資料より・確定） ---------- */
  price: {
    // 個人3プラン（カード表示）
    plans: [
      { id: "light", name: "LIGHT", nameJa: "ライト会員", price: "9,800円 / 月", featured: false,
        features: ["月4回までのご利用（全営業日OK）", "マイペースにゆったり練習したい方に"] },
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
    joinFee: "5,000円",  // 入会金（★2026-08-11改定 #131・税抜=税込5,500円。2026年内はキャンペーンで無料）
    trialFee: "0円（通常 3,300円 税込 → プレオープン記念で無料）",  // ★確定
    visitorFee: null,   // ビジター利用料（未確定 → 近日公開）
    note: "表示金額はすべて税抜です。カッコ内は税込価格（消費税10%）です。",
  },

  /* ---------- レッスン（★未確定 = null） ---------- */
  lesson: {
    style: "所属プロによるワンポイントレッスン5分（会員は無料・受け放題感覚）／ 追加のパーソナルレッスンは25分",  // ★確定（2026-08-27 更新）
    coaches: "らら（小川 うらら）／ USGTF レベルⅢ・YouTube「RaRa LESSON」登録者6万人超 ＝ メインコーチ",  // ★確定（2026-08-27 更新）
    menu: "ワンポイントレッスン（会員は受け放題感覚）／ 25分マンツーマン・チケット制も選べます",  // ★確定
    beginnerProgram: null,  // 初心者向けの具体プログラムは近日公開
  },

  /* ---------- 体験利用（★未確定 = null） ---------- */
  trial: {
    // ★確定（2026-07-27）
    fee:      "無料",   // 通常 3,300円（税込）→ プレオープン記念で無料
    feeNote:  "通常 3,300円（税込）のところ、プレオープン記念で無料です。",
    duration: "約55分",
    content:  "受付 → カウンセリング（ヒアリング） → 打席のご案内 → 体験レッスン → ご入会のご案内",
    // 体験当日の流れ（体験ページ・トップの体験セクションに自動で並びます）
    steps: [
      { t: "受付",             m: "05分", b: "ご来店・受付。当日いただく費用はありません。" },
      { t: "カウンセリング",   m: "10分", b: "ゴルフ歴・お困りごと・目標をおうかがいします。初めての方も大歓迎です。" },
      { t: "打席のご案内",     m: "05分", b: "実際にお使いいただく打席・シミュレーターをご案内します。" },
      { t: "体験レッスン",     m: "30分", b: "プロがマンツーマンで指導。データを見ながら、その日のうちに変化を体感できます。" },
      { t: "ご入会のご案内",   m: "05分", b: "料金・プランのご説明のみ。強引な勧誘は一切しません。持ち帰り検討も歓迎です。" },
    ],
    bring: null,        // 持ち物（クラブレンタルの有無が確定したら記入）
    note: "強引な勧誘は一切いたしません。まずは打ちに来ていただくだけで大丈夫です。",
  },

  /* ---------- バー・ラウンジ（★未確定 = null） ---------- */
  lounge: {
    // ★2026-08-10 ドリンクメニュー確定（#123・SquareのPOSにも同じ24品を登録済み）
    drink: "コーヒー・紅茶・ソフトドリンク 350円〜／FRANKオリジナルソーダ・ノンアルコールカクテル 500円〜（税込・会員価格あり）",
    food: null,
    seats: null,
    hours: null,
    note: "元ゴルフバーのバーカウンターを承継。練習の前後に、ゴルフ談義を楽しめる交流空間です。",  // ★確定（コンセプト）
  },

  /* ---------- 画像（★サンプル。本番は同じファイル名で実写に差し替え） ----------
     assets/img/ 内のJPGを上書きすればOK。別名にするならここのパスを変更してください。
     すべて「差し替え前提のサンプル画像」です（抽象アトモスフィア）。 */
  images: {
    /* ★実写の中身に合わせた割り当て（ファイル名は歴史的経緯でズレているので、
       「どの写真か」はここで決めます。差し替えるときは同じファイル名で上書き） */
    hero:      "assets/img/hero-1.jpg",   // 店舗外観（看板つき・実写）
    hero2:     "assets/img/hero-2.jpg",   // 打席＋シミュレーター
    hero3:     "assets/img/hero-3.jpg",   // レッスン風景
    exterior:  "assets/img/hero-1.jpg",   // 外観
    bay:       "assets/img/play.jpg",     // 打席（テーブル・ワイン付き）
    sim:       "assets/img/hero-2.jpg",   // シミュレーター
    lessonPic: "assets/img/hero-3.jpg",   // レッスン（★lesson.jpg は料理写真なので使わない）
    lounge:    "assets/img/lounge.jpg",   // バーカウンター
    food:      "assets/img/lesson.jpg",   // ラウンジのフード（実体は料理写真）
    community: "assets/img/community.jpg",// ソファ席・パーティースペース
    concept:   "assets/img/play.jpg",     // コンセプト
    play:      "assets/img/play.jpg",
    lesson:    "assets/img/hero-3.jpg",
    // プレオープン告知バナー（SNS・LINE配布用。トップでは使わなくなりました）
    bannerWide:   "assets/banner-wide.jpg",
    bannerSquare: "assets/banner-square.jpg",
    bannerLine:   "assets/banner-line.jpg",
  },

  /* ---------- 予約・会員システム（Genesis / member-os） ---------- */
  links: {
    // ★体験予約：サイト内のセルフ予約ページ（日時を選ぶだけで即確定・打席は自動割当／0083）。
    //   旧「member-osの申込フォーム（スタッフ折り返し）」は https://member-os-tau.vercel.app/trial に残っています。
    trialBooking: "trial-booking.html",

    // ★Web入会：member-os のWeb入会申込フォーム（公開・プラン選択つき）。
    joinWeb: "https://member-os-tau.vercel.app/join-web",

    // （旧）オンサイトのFormspreeフォームは使いません＝member-osに集約。null固定でOK。
    trialForm: null,

    // ★公式LINE（未設定の間はボタンが「近日公開」表示になります）
    line: null,           // 例: "https://lin.ee/xxxxxxx"

    // 会員向け（member-os / 稼働中）
    // ★会員ログインは「会員番号＋電話番号下4桁」。打席予約(booking.html)と同じ frunk_members を見ます。
    memberLogin:    "https://member-os-tau.vercel.app/member/login",
    // ★旧 /member/register（仮会員 P########）は廃止しました（2026-08-07）。
    //   その番号では打席予約が通らないため、入会は joinWeb に一本化しています。
    memberRegister: "https://member-os-tau.vercel.app/join-web",
    // ★お客様の打席予約は公式サイトに一本化（#93）。member-os の /member/book は転送のみ。
    memberBooking:  "booking.html",
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
      date: "2026-08-13",
      tag: "キャンペーン",
      title: "年内入会キャンペーン実施中。2026年12月31日までのご入会で、入会金5,500円（税込）が無料＋入会月の月会費も無料。Web入会なら決済完了と同時に会員番号を即発行します。",
      url: "lp-campaign.html",
    },
    {
      date: "2026-07-18",
      tag: "お知らせ",
      title: "2026年9月2日プレオープン・9月5日グランドオープン。姫路・土山に FRANK GOLF が誕生します。いまなら体験レッスン（約55分・通常3,300円）が無料です。",
      url: null,
    },
  ],
};
