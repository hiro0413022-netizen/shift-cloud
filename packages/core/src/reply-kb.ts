/* ============================================================
   返信文アシスタントのナレッジ（公式LINE・メールの返信補助）

   なぜ作るか:
     事業内容・料金を把握しきれていないスタッフでも、公式LINE／メールに
     正確な返信を即座に返せるようにする（スタッフポータル「聞く」→「返信文をつくる」）。

   ここに書くのは「お客様に言ってよい公開情報」だけ:
     出典は各公式サイト（golfwing.jp / frankgolf.jp・sites/frank-golf / YOZANコーポレート）。
     ※このリポジトリは Public 運用（DECISIONS #14）。社内専用の情報・個人情報は書かない。
     料金やキャンペーンが変わったら、必ずここを更新する（AIはここに無い事実を書かない設計）。

   このファイルは純粋関数のみ（テストから直接 import する）。API呼び出しは reply-draft.ts。
   ============================================================ */

export type ReplyBrand = "golfwing" | "frank" | "yozan";
export type ReplyChannel = "line" | "email";

export const KB_UPDATED_AT = "2026-10-02";

export const BRAND_LABEL: Record<ReplyBrand, string> = {
  golfwing: "GOLF WING 宝塚",
  frank: "FRANK GOLF 姫路",
  yozan: "株式会社YOZAN",
};

/* ------------------------------------------------------------
   ブランド別ナレッジ（AIに渡す唯一の事実）
------------------------------------------------------------ */
const KB_GOLFWING = `
# GOLF WING（ゴルフウィング）宝塚店 — インドアゴルフ・シャフトフィッティングスタジオ
## 基本情報
- 住所: 〒665-0882 兵庫県宝塚市山本南1-26-25
- 電話: 0797-82-0833（お電話の受付 11:00〜20:00・火曜日を除く）／ メール: info@golfwing.jp
- アクセス: 阪急宝塚線「山本駅」より徒歩13分 ／ 店舗前に共有駐車場25台
- 営業: 24時間営業（会員は早朝・深夜も練習可）
- スタッフアワー（スタッフ常駐）: 11:00〜20:00 ／ 毎週火曜日は終日スタッフ不在
- 公式サイト: https://www.golfwing.jp/ ／ 料金: https://www.golfwing.jp/plan/plan.html ／ 体験: https://www.golfwing.jp/trial/trial.html
- 打席予約（会員）: https://www5.revn.jp/golfwing/
- お問い合わせフォーム: https://www.golfwing.jp/contact/contact.php
## 特徴・設備
- 全打席に TrackMan（弾道・スイングを多面的に分析）
- 日本最大級、18メーカー・1,300本以上の試打シャフトを常設
- PGA/JLPGAのプロが一人ひとりに合わせてレッスン（初心者〜上級者）。PGAトーナメントプロによる飛距離に特化したレッスンも
- レフティ（左打ち）対応の打席あり（ご予約時に左右対応打席を選んでいただく）。レフティでも試打・フィッティング可
- ボール代・打席料は料金に含まれる。会員はワンポイントレッスン無料
- クラブ・シューズ・グローブのレンタルは無し（お客様ご自身でお持ちいただく）。服装は動きやすい格好でOK（ジャージ・ジーパン可）
## 料金（表示は税抜、カッコ内は税込）
定額会員
- レギュラー会員: 19,800円/月（税込21,780円）… 終日利用可・1日1コマ（55分）・全設備利用可
- マスター会員: 24,800円/月（税込27,280円）… 終日利用可・1日2コマ（110分）・全設備利用可
- 法人会員: 55,000円/月（税込60,500円）… 無記名会員証2枚発行
チケット会員
- レッスンチケット: 月会費9,800円（税込10,780円）＋チケット1枚2,500円（税込2,750円）／11枚つづり25,000円（税込27,500円）… スタッフアワーのみ利用可
- 練習チケット: 月会費9,800円（税込10,780円）＋チケット1枚1,800円（税込1,980円）／11枚つづり18,000円（税込19,800円）
一回利用（1コマ55分）
- 体験利用: 3,000円（税込3,300円）… お一人様1回限り
- ビジター利用: 7,500円（税込8,250円）
- 会員様のご家族: 3,000円（税込3,300円）
フィッティング
- シャフトフィッティング: 会員 1コマ10,000円（税込11,000円）／2コマ15,000円（税込16,500円）、一般 1コマ15,000円（税込16,500円）／2コマ20,000円（税込22,000円）
- アイアンフィッティング: 会員 10,000円（税込11,000円）、一般 15,000円（税込16,500円）
入会
- 入会金: 通常30,000円 → 体験利用から30日以内のご入会は50%OFFの15,000円（税込16,500円）。友達割引の適用時も15,000円（税込16,500円）
- 友達割引: ご紹介で入会された方は入会月の月会費が無料。紹介者には対象ゴルフボール1ダースをプレゼント（レギュラー・マスター会員のみ）
- 入会月の会費: 利用開始日が 1〜7日=100% ／ 8〜15日=75% ／ 16〜23日=50% ／ 24日〜末日=25%
- 入会方法: フロント、体験利用時、またはお電話で受付
- お支払い: 入会月＋翌月分は現金またはクレジットカード。3か月目以降は銀行引落またはクレジットカード（月会費は自動更新）
- その他: 会員証再発行 500円（税込550円）
## 体験利用
- 55分・3,000円（税込3,300円）・お一人様1回限り
- 内容: ワンポイントレッスン／TrackMan弾道解析／スイング矯正マシン／練習器具の使用
- 申込: 公式サイトの体験利用受付フォーム、またはお電話（0797-82-0833・11:00〜20:00・火曜除く）
- 公式サイトに「先着50名限定で体験無料」の掲載あり。いま実施中かは店舗確認が必要（断定しない）
`.trim();

const KB_FRANK = `
# FRANK GOLF（フランクゴルフ）姫路 — 会員制インドアゴルフラウンジ（2026年9月オープン）
## 基本情報
- 住所: 〒670-0996 兵庫県姫路市土山6-6-1
- 電話: 079-260-6671
- 営業時間: 平日 10:00〜22:00 ／ 土日祝 9:00〜20:00 ／ 定休日 毎週火曜日
- 駐車場: 20台・無料
- 公式サイト: https://frankgolf.jp/ ／ 料金: https://frankgolf.jp/plan.html ／ よくある質問: https://frankgolf.jp/faq.html
- 体験の予約フォーム: https://frankgolf.jp/trial-booking.html（カレンダーで日時を選ぶとその場で確定・会員登録不要。キャンセルは確定画面のリンクから）
- 公式LINE: https://lin.ee/yp2leQU ／ Instagram: https://www.instagram.com/frank_golf_himeji
- 会員ページ（打席のWeb予約・キャンセル）: https://my.frankgolf.jp/（会員番号と電話番号下4桁でログイン）
- Web入会: https://my.frankgolf.jp/join-web（規約同意・電子サイン・お支払いまでその場で完了し、会員番号が即時発行）
## 特徴・設備
- シミュレーター3打席: TrackMan 4・DTECT・OKONGOLF（うち1打席はレフティ左右打席対応）
- 完全予約制・少人数で落ち着いた環境。スマート入退室で待ち時間なし
- バーカウンター併設のラウンジ（ソフトドリンクあり・お酒が飲めなくてもOK）。イベント・ラウンジ利用はすべて任意
- メインコーチ: らら（小川うらら）／ USGTF レベルⅢ・YouTube「RaRa LESSON」登録者6万人超
- 初心者を歓迎（握り方からプロがお伝え）。女性お一人でも通いやすい
- 見学OK（公式LINEまたはお電話で連絡のうえ、営業時間内）
- クラブが無くても始められる（体験は手ぶらでOK）。入会後のレンタルは受付で確認
## 料金（表示は税抜、カッコ内は税込）
- ライト会員: 9,800円/月（税込10,780円）… 月4回まで・平日10:00〜15:00のみ（土日祝は利用不可）
- レギュラー会員: 13,800円/月（税込15,180円）… 全営業日・1日1時間 通い放題（一番人気）
- マスター会員: 19,800円/月（税込21,780円）… 全営業日・1日最大2時間
- 法人ライトプラン: 39,800円/月（税込43,780円）… ご利用者2名まで登録・御社合計4コマ（1コマ=1時間）まで
- 法人プレミアムプラン: 59,800円/月（税込65,780円）… ご利用者の登録人数制限なし・御社合計8コマまで・同伴のビジター様は無料
- レッスン: 会員はワンポイントレッスン（約5分）無料 ／ 25分マンツーマン 2,500円（税込2,750円・チケット制）
- 入会金: 5,000円（税込5,500円）→ 2026年12月31日までのご入会は無料（キャンペーンでのご入会は6か月間の継続をお願いしている）
- ビジター利用: 未定（決まり次第お知らせ）
## 体験レッスン
- 約55分・通常3,300円（税込）→ 現在は無料・手ぶらでOK・プロのマンツーマン
- 流れ: 受付 → カウンセリング → 打席のご案内 → 体験レッスン → ご入会のご案内。強引な勧誘はしない
- 予約: 公式サイトの体験予約フォーム（その場で確定）、または公式LINE
## 月会費のお支払い
- ご入会月（利用開始を先の月にした場合は利用開始月）の月会費は無料
- Web入会時に翌月・翌々月の2か月分をお支払い、以後は毎月10日に翌月分をクレジットカードで自動決済
## 入会の流れ
- 体験予約 → ご来店・体験 → ご入会手続き（来店時またはWeb入会）→ 会員ページからWeb予約開始
`.trim();

const KB_YOZAN = `
# 株式会社YOZAN（ヨウザン）— ゴルフ業界の総合ソリューション企業
## 基本情報
- 所在地: 兵庫県宝塚市 ／ 代表取締役: 古川 博庸
- お問い合わせ: info@yozan-group.jp（法人のお問い合わせ・マーケティング相談・採用）
- 経営理念: 「共に歩む、共に成す。」
- 運営店舗: GOLF WING 宝塚（インドアゴルフ・シャフトフィッティング）／ FRANK GOLF 姫路（会員制インドアゴルフラウンジ）
## 5つの事業（ゴルフ業界を点ではなく面で支える）
1. 人材事業: キャディー派遣・レッスンプロ派遣・人材育成（採用〜教育〜配置まで一貫）
2. DX事業: ゴルフ施設向けの自社プロダクト（PGA NOTE＝レッスン記録・顧客管理、Golf OS＝予約・売上・スタッフ管理の一元化、発注管理・在庫管理システム）とカスタムシステム開発
3. マーケティング事業: SNS運用・LP/HP制作・広告運用（自社施設で検証したノウハウを提供）
4. 運営支援: インドアゴルフ施設の開業支援（物件選定〜内装・機器・採用・集客設計）、運営代行、店舗改善
5. アパレル事業: ゴルフアパレルブランド「KALLINOS（カリノス）」（ウェア・キャップ・バッグ・ベルト）
## 対応の基本
- 事業提携・取材・営業提案は、内容を確認のうえ担当者（代表）から折り返す。即答で約束しない
- 採用の問い合わせは、応募・カジュアル面談の希望を伺い、担当者から連絡する
`.trim();

export const KB: Record<ReplyBrand, string> = {
  golfwing: KB_GOLFWING,
  frank: KB_FRANK,
  yozan: KB_YOZAN,
};

/** 署名（メール用）。LINEは公式アカウント名が出るので署名は付けない */
export const SIGNATURE: Record<ReplyBrand, string> = {
  golfwing: "ゴルフウィング 宝塚店\nTEL 0797-82-0833（11:00〜20:00・火曜除く）\nhttps://www.golfwing.jp/",
  frank: "FRANK GOLF 姫路\nTEL 079-260-6671\nhttps://frankgolf.jp/",
  yozan: "株式会社YOZAN\ninfo@yozan-group.jp",
};

/* ------------------------------------------------------------
   ワンタップ用件（押すだけで返信案が出る）
------------------------------------------------------------ */
export type ReplyIntent = {
  key: string;
  label: string;
  /** AIへの指示（お客様の文面が無いときは、この用件の問い合わせを想定して書く） */
  guide: string;
  brands: ReplyBrand[];
};

const STORES: ReplyBrand[] = ["golfwing", "frank"];

export const REPLY_INTENTS: ReplyIntent[] = [
  { key: "trial", label: "体験したい", brands: STORES,
    guide: "体験の問い合わせ・申込への返信。料金・所要時間・内容・持ち物/服装・申込方法（URLまたは電話）を案内し、来店を前向きに促す。" },
  { key: "price", label: "料金を知りたい", brands: STORES,
    guide: "料金・会員プランの問い合わせへの返信。主なプランを税抜と税込で簡潔に並べ、迷ったら体験で相談できることを添える。" },
  { key: "access", label: "場所・営業時間", brands: STORES,
    guide: "場所・営業時間・定休日・駐車場・アクセスの問い合わせへの返信。" },
  { key: "beginner", label: "初心者でも大丈夫？", brands: STORES,
    guide: "初心者・未経験・道具を持っていない人からの不安への返信。安心させ、体験への一歩を促す。持ち物・レンタルの事実は正確に。" },
  { key: "join", label: "入会したい", brands: STORES,
    guide: "入会希望への返信。入会方法・入会金（キャンペーン含む）・支払い方法・入会月の会費の扱いを案内する。" },
  { key: "booking", label: "予約変更・キャンセル", brands: STORES,
    guide: "予約の変更・キャンセル依頼への返信。承った旨と、会員は自分でWeb予約ページから変更できる場合はその方法を案内。空き状況は断定せず確認して連絡すると書く。" },
  { key: "leave", label: "休会・退会したい", brands: STORES,
    guide: "休会・退会の相談への返信。引き止めすぎず丁寧に受け止め、手続き方法や締め日・費用はナレッジに無いので『確認のうえご案内します』とし、担当者から連絡すると書く。" },
  { key: "lesson", label: "レッスンについて", brands: STORES,
    guide: "レッスンの内容・料金・コーチについての問い合わせへの返信。" },
  { key: "corporate", label: "法人で利用したい", brands: STORES,
    guide: "法人利用（福利厚生・接待）の問い合わせへの返信。法人プランを案内し、詳細は担当者から連絡すると書く。" },
  { key: "thanks", label: "来店・体験のお礼", brands: STORES,
    guide: "来店・体験後のお礼メッセージ。押し売りせず、また来たくなる温度感で。入会特典（体験後の入会金割引など）があれば一言添える。" },
  { key: "apology", label: "お詫び・クレーム", brands: ["golfwing", "frank", "yozan"],
    guide: "お叱り・クレームへの一次返信。まず不快な思いをさせたことへのお詫び、内容を確認して責任者から改めて連絡する旨。言い訳・原因の断定・補償の約束はしない。" },
  { key: "partnership", label: "提携・取材・営業", brands: ["yozan"],
    guide: "事業提携・取材・営業提案への返信。お礼を述べ、内容を確認のうえ担当者から連絡する旨。約束はしない。" },
  { key: "recruit", label: "採用・求人", brands: ["yozan", "golfwing", "frank"],
    guide: "求人・アルバイト応募への返信。お礼を述べ、希望（職種・勤務日時）を伺い、担当者から連絡する旨。" },
  { key: "business", label: "事業内容の説明", brands: ["yozan"],
    guide: "YOZANの事業内容を知りたいという問い合わせへの返信。5事業を簡潔に紹介し、関心のある分野を伺う。" },
];

export function intentsFor(brand: ReplyBrand): ReplyIntent[] {
  return REPLY_INTENTS.filter((i) => i.brands.includes(brand));
}

export function findIntent(key: string | null | undefined): ReplyIntent | null {
  if (!key) return null;
  return REPLY_INTENTS.find((i) => i.key === key) ?? null;
}

/* ------------------------------------------------------------
   プロンプト
------------------------------------------------------------ */
export type ReplyRequest = {
  brand: ReplyBrand;
  channel: ReplyChannel;
  /** お客様から届いた文面（貼り付け）。空でもワンタップ用件があれば書ける */
  customerMessage?: string;
  intentKey?: string | null;
  /** お客様のお名前（任意） */
  customerName?: string;
  /** スタッフが伝えたい事実（例:「明日15時は空いている」「担当は○○」） */
  staffNote?: string;
  /** 直前の返信案と、直してほしい点（「もっと短く」など） */
  previousDraft?: string;
  adjust?: string;
};

export function buildReplySystem(brand: ReplyBrand, channel: ReplyChannel): string {
  const channelRule =
    channel === "line"
      ? [
          "チャネル: 公式LINE。",
          "- 店舗スタッフからの返信として自然で、硬すぎない丁寧語。1メッセージで読み切れる長さ（目安150〜300字）。",
          "- 冒頭はお名前が分かれば「○○様」、分からなければ宛名なしで「お問い合わせありがとうございます。」など。",
          "- 改行で読みやすく。絵文字は使わないか、最後に1つまで。署名は付けない（公式アカウント名が表示されるため）。",
          "- URLは必要なものだけ、1〜2個まで。",
        ]
      : [
          "チャネル: メール。",
          "- 1行目に「件名: 」で始まる件名を書き、1行空けて本文。",
          "- 本文は「○○様」（名前が無ければ「お客様」）で始め、ビジネスメールとして丁寧に。目安200〜450字。",
          "- 末尾に次の署名をそのまま付ける:",
          SIGNATURE[brand],
        ];

  return [
    `あなたは${BRAND_LABEL[brand]}のお客様対応スタッフです。お客様への返信文の下書きを日本語で書きます。`,
    "下の【ナレッジ】が、あなたが知っている事実のすべてです。",
    "",
    ...channelRule,
    "",
    "厳守事項:",
    "- 料金・時間・住所・URL・キャンペーンなどの事実は【ナレッジ】にあるものだけを書く。数字は一字一句ナレッジどおり。",
    "- ナレッジに無いこと（空き状況、個別の予約・契約内容、会員個人の情報、手続きの締め日、在庫など）は推測で書かず、「確認してご連絡いたします」と書く。",
    "- スタッフメモに書かれた事実は使ってよい（ナレッジより優先）。",
    "- 料金を書くときは税抜と税込を併記する（例: 9,800円（税込10,780円））。",
    `- ${BRAND_LABEL[brand]}以外の店舗・ブランドの情報を混ぜない（店舗の取り違えは厳禁）。お客様が別の店舗の話をしている場合は確認ポイントに書く。`,
    "- スタッフ・コーチの個人名は、ナレッジに載っている名前以外は書かない。",
    "- 強引な勧誘・誇大な表現・他店の悪口はしない。返金・補償・法的な判断は約束しない。",
    "- お客様の文面が無い場合は、ワンタップ用件のよくある問い合わせを想定して、そのまま送れる汎用の返信を書く。",
    "",
    "出力形式（厳守。前置き・マークダウン記法は不要）:",
    "<reply>",
    "（そのまま送れる返信文）",
    "</reply>",
    "<check>",
    "（送信前にスタッフが確認すべき点を「- 」で始まる箇条書きで0〜3個。確認不要なら空）",
    "</check>",
    "",
    "【ナレッジ】",
    KB[brand],
  ].join("\n");
}

export function buildReplyUser(req: ReplyRequest): string {
  const intent = findIntent(req.intentKey);
  const lines: string[] = [];
  if (intent) lines.push(`## 用件（ワンタップ）: ${intent.label}`, intent.guide, "");
  if (req.customerName?.trim()) lines.push(`## お客様のお名前: ${req.customerName.trim().slice(0, 40)}`, "");
  const msg = req.customerMessage?.trim();
  lines.push("## お客様から届いた文面", msg ? msg.slice(0, 3000) : "（なし — 用件から想定して書く）", "");
  if (req.staffNote?.trim()) lines.push("## スタッフメモ（返信に反映する事実・方針）", req.staffNote.trim().slice(0, 1000), "");
  if (req.previousDraft?.trim()) {
    lines.push("## 直前の返信案", req.previousDraft.trim().slice(0, 3000), "");
    lines.push("## 修正の指示", req.adjust?.trim() || "より良くしてください", "");
    lines.push("直前の返信案を、修正の指示に従って書き直してください。");
  } else {
    lines.push("上記への返信文の下書きを書いてください。");
  }
  return lines.join("\n");
}

/** モデル出力 → 返信文と確認ポイント。タグが無ければ全文を返信とみなす */
export function parseReplyOutput(raw: string): { reply: string; checks: string[] } {
  const text = raw.trim();
  const r = text.match(/<reply>([\s\S]*?)(?:<\/reply>|$)/i);
  const c = text.match(/<check>([\s\S]*?)(?:<\/check>|$)/i);
  const reply = (r ? r[1] : text.replace(/<check>[\s\S]*$/i, "")).trim();
  const checks = c
    ? c[1]
        .split("\n")
        .map((l) => l.replace(/^\s*[-・*]\s*/, "").trim())
        .filter((l) => l.length > 0 && !/^（.*）$/.test(l) && l !== "なし")
        .slice(0, 5)
    : [];
  return { reply, checks };
}

/** スタッフの所属店舗名からブランドの既定値を決める */
export function brandFromStoreName(name: string | null | undefined): ReplyBrand {
  const s = (name ?? "").toLowerCase();
  if (/frank|フランク|姫路/.test(s)) return "frank";
  if (/golf ?wing|ゴルフウ[ィイ]ング|宝塚/.test(s)) return "golfwing";
  return "golfwing";
}

/* ------------------------------------------------------------
   サーバーアクションの入力検証（/chat と /store で共用）
------------------------------------------------------------ */
export type ReplyDraftInput = {
  brand: string;
  channel: string;
  customerMessage?: string;
  intentKey?: string | null;
  customerName?: string;
  staffNote?: string;
  previousDraft?: string;
  adjust?: string;
};

/** 入力を検証して ReplyRequest にする。不正なら { error } */
export function validateReplyInput(input: ReplyDraftInput): { req: ReplyRequest } | { error: string } {
  const brand = (["golfwing", "frank", "yozan"] as const).find((b) => b === input.brand);
  const channel = (["line", "email"] as const).find((c) => c === input.channel);
  if (!brand || !channel) return { error: "窓口と送信先を選んでください。" };
  if (!input.customerMessage?.trim() && !findIntent(input.intentKey) && !input.previousDraft?.trim()) {
    return { error: "お客様の文面を貼り付けるか、用件ボタンを押してください。" };
  }
  return {
    req: {
      brand,
      channel,
      customerMessage: input.customerMessage,
      intentKey: input.intentKey ?? null,
      customerName: input.customerName,
      staffNote: input.staffNote,
      previousDraft: input.previousDraft,
      adjust: input.adjust,
    },
  };
}
