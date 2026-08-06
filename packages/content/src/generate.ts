import type { GeneratedPost, Material, SalesProduct } from "./types";
import { PRODUCT_LABEL } from "./types";

/**
 * 投稿の生成。Claude API（REST直・SDK不使用＝#97方式）＋キー無し/失敗時はテンプレートに落ちる。
 * どちらの経路でも GeneratedPost の同じ形を返す＝呼び出し側は生成方法を意識しない。
 */

const HASHTAGS: Record<SalesProduct, string[]> = {
  pganote: ["#ゴルフレッスン", "#ゴルフコーチ", "#ゴルフスクール", "#レッスンプロ", "#PGANOTE", "#ゴルフ上達"],
  "swing-cortex": ["#ゴルフレッスン", "#ゴルフコーチ", "#スイング分析", "#ゴルフ上達", "#SWINGCORTEX", "#レッスンプロ"],
  webdesign: ["#ホームページ制作", "#ホームページ", "#集客", "#個人事業主", "#店舗経営", "#クリニック開業"],
};

/** 商品ごとのCTA（LPへ誘導。DMは相手起点のみ＝キャプションでDM送付を約束しない） */
const CTA: Record<SalesProduct, string> = {
  pganote: "レッスンの記録と生徒さんとのつながりを仕組みにしたい方は、プロフィールのリンクからどうぞ。",
  "swing-cortex": "レッスン現場でその場で使える診断ツールに興味のある方は、プロフィールのリンクからどうぞ。",
  webdesign: "「まず完成形を見てから決めたい」という方は、プロフィールのリンクからどうぞ。",
};

/** 商品ごとの読者像（生成プロンプトに注入） */
const AUDIENCE: Record<SalesProduct, string> = {
  pganote: "日本のゴルフコーチ・レッスンプロ・練習場運営者",
  "swing-cortex": "日本のゴルフコーチ・レッスンプロ・練習場運営者",
  webdesign: "ホームページが無い・古いままの日本の店舗/クリニック/教室/個人事業のオーナー",
};

/**
 * HP制作（webdesign）の題材リスト。SWING CORTEX資産の代わりに使う固定ネタ帳。
 * theme（重複回避キー）は symptomName に入れて Material と同じ形で流す。
 */
export const WEB_TOPICS: Material[] = [
  { symptomId: "web-1", symptomName: "HPが無いお店は検索で存在しない", category: "集客", points: [{ title: "「地名＋業種」で検索した時に出るのは競合だけ", cause: "情報の受け皿が無い", fix: "1ページでも公式情報があれば検索と地図に載る", drill: null }] },
  { symptomId: "web-2", symptomName: "スマホで見づらいHPは逆効果", category: "改善", points: [{ title: "閲覧の8割はスマホから", cause: "10年前のPC向けデザインのまま", fix: "スマホ表示・電話タップ・地図リンクの3点を最優先", drill: null }] },
  { symptomId: "web-3", symptomName: "問い合わせが来ないHPの共通点", category: "導線", points: [{ title: "見た人が次に何をすればいいか書いていない", cause: "予約・問い合わせボタンが目立たない/無い", fix: "全ページに「予約する」「電話する」を固定表示", drill: null }] },
  { symptomId: "web-4", symptomName: "営業時間がGoogleとHPで違う問題", category: "信頼", points: [{ title: "情報がバラバラだとお客様は不安になる", cause: "更新が面倒で放置", fix: "更新しやすい仕組みで作る（更新代行も可）", drill: null }] },
  { symptomId: "web-5", symptomName: "HPは作って終わりではなく育てるもの", category: "運用", points: [{ title: "新着情報が2年前で止まっていると「やってるのかな？」と思われる", cause: "自分で更新できない作りになっている", fix: "お知らせだけでも月1回動かす", drill: null }] },
  { symptomId: "web-6", symptomName: "完成形を見てから決められるHP制作", category: "サービス", points: [{ title: "契約前にあなたのお店の「完成デモ」をお見せします", cause: "出来上がりが見えない発注は不安", fix: "デモを見て気に入ったら進める・合わなければ断ってOK", drill: null }] },
  { symptomId: "web-7", symptomName: "写真だけで印象は決まる", category: "改善", points: [{ title: "暗い写真・古い写真は実物より損をする", cause: "開業時の写真のまま", fix: "スマホでも「明るい時間に横位置で」撮り直すだけで変わる", drill: null }] },
  { symptomId: "web-8", symptomName: "予約をLINEに一本化するという選択", category: "導線", points: [{ title: "電話に出られない時間の機会損失", cause: "予約手段が電話のみ", fix: "HPからLINE・Web予約へ流す導線を作る", drill: null }] },
];

/** 題材をプロンプト用のテキストに畳む */
function materialText(m: Material): string {
  const lines = [`題材: ${m.symptomName}${m.category ? `（${m.category}）` : ""}`];
  for (const p of m.points) {
    lines.push(
      [
        `- 確認ポイント: ${p.title}`,
        p.cause ? `  原因: ${p.cause}` : null,
        p.fix ? `  対処: ${p.fix}` : null,
        p.drill ? `  ドリル: ${p.drill}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return lines.join("\n");
}

/** キー無し・API失敗時のテンプレート生成（安全側フォールバック） */
export function buildTemplatePost(product: SalesProduct, m: Material): GeneratedPost {
  const p = m.points[0];
  if (product === "webdesign") {
    const body = [
      `${m.symptomName}。`,
      ``,
      p?.title ? `${p.title}。` : ``,
      p?.fix ? `対策はシンプルで、${p.fix}。` : ``,
      ``,
      `YOZAN WEB制作は、契約前にあなたのお店の「完成デモ」を作ってお見せするHP制作です。`,
      ``,
      CTA.webdesign,
    ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return {
      theme: m.symptomName,
      hook: m.symptomName.slice(0, 30),
      body,
      hashtags: HASHTAGS.webdesign,
      generator: "template",
    };
  }
  const bodyLines =
    product === "pganote"
      ? [
          `「${m.symptomName}」に悩む生徒さん、いませんか？`,
          ``,
          p?.cause ? `原因のひとつは「${p.cause}」。` : `原因は人によって違います。`,
          p?.fix ? `現場では「${p.fix}」から直すのが近道です。` : ``,
          ``,
          `こうした指導のポイント、レッスンのたびに記録できていますか？`,
          `記録が残ると、生徒さんの上達が「見える」ようになります。`,
          ``,
          CTA.pganote,
        ]
      : [
          `「${m.symptomName}」— レッスン中によく出る症状です。`,
          ``,
          p?.cause ? `原因のひとつは「${p.cause}」。` : `原因は1つではありません。`,
          p?.fix ? `対処は「${p.fix}」。` : ``,
          p?.drill ? `おすすめドリル: ${p.drill}` : ``,
          ``,
          `SWING CORTEXは、見たままの症状を入れると原因と対処が出る、コーチのための現場ツールです。`,
          ``,
          CTA["swing-cortex"],
        ];
  return {
    theme: m.symptomName,
    hook: `${m.symptomName}、原因わかりますか？`.slice(0, 30),
    body: bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    hashtags: HASHTAGS[product],
    generator: "template",
  };
}

export type GenerateOptions = {
  apiKey?: string | null; // 既定 process.env.ANTHROPIC_API_KEY
  model?: string | null; // 既定 CONTENT_AI_MODEL > claude-haiku-4-5
  /** 過去にユーザーが出した修正指示（gn_feedback）。生成時から反映する */
  learnedRules?: string[];
  timeoutMs?: number;
};

function buildSystem(product: SalesProduct): string {
  return [
    `あなたは中小事業者向けサービスのSNS運用者。読者は${AUDIENCE[product]}。`,
    "与えられた「本日の題材」から、Instagramのフィード投稿を1本作る。",
    "構成: 冒頭1行で読者の悩みを言い当てる → 題材の知見を具体的に → 最後に指定のCTAを自然につなげる。",
    "制約: 全角400字以内。絵文字は2〜3個まで。誇大表現・効果の断定・他社比較はしない。医療的な表現はしない。",
    "出力はJSONのみ: {\"theme\": ネタの短い説明(20字以内), \"hook\": カード画像用の見出し(22字以内・体言止めか問いかけ), \"body\": キャプション本文}",
  ].join("\n");
}

/** Claudeで投稿を生成。失敗したらテンプレートに落ちる（throwしない） */
export async function generatePost(
  product: SalesProduct,
  m: Material,
  opts: GenerateOptions = {}
): Promise<GeneratedPost> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return buildTemplatePost(product, m);

  const description: Record<SalesProduct, string> = {
    pganote: "レッスンの記録・生徒とのつながりを仕組みにするコーチ向けノートシステム",
    "swing-cortex": "症状を入れると原因・対処・ドリルが出る、コーチ向けのレッスン現場診断ツール",
    webdesign: "契約前に完成デモを見てから決められるホームページ制作サービス（YOZAN WEB制作）",
  };
  const user = [
    `## 商品（CTAの誘導先）`,
    `${PRODUCT_LABEL[product]} — ${description[product]}`,
    ``,
    `## 本日の題材（実データ由来の知見）`,
    materialText(m),
    ``,
    `## CTA（本文の最後にこの趣旨で入れる。文言は自然に調整してよい）`,
    CTA[product],
    opts.learnedRules && opts.learnedRules.length > 0
      ? `\n## 過去の学習ルール（ユーザーの修正指示。必ず従う）\n${opts.learnedRules.map((r) => `- ${r}`).join("\n")}`
      : ``,
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model ?? process.env.CONTENT_AI_MODEL ?? "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        system: buildSystem(product),
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
    });
    if (!res.ok) return buildTemplatePost(product, m);
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim()
      .replace(/^```(?:json)?/g, "")
      .replace(/```$/g, "")
      .trim();
    const parsed = JSON.parse(text) as { theme?: string; hook?: string; body?: string };
    const hook = String(parsed.hook ?? "").trim().slice(0, 30);
    const body = String(parsed.body ?? "").trim().slice(0, 900);
    if (!hook || !body) return buildTemplatePost(product, m);
    return {
      theme: String(parsed.theme ?? m.symptomName).trim().slice(0, 40),
      hook,
      body,
      hashtags: HASHTAGS[product],
      generator: "claude",
    };
  } catch {
    return buildTemplatePost(product, m);
  }
}

/** キャプション＝本文＋ハッシュタグ（Instagramへ送る最終形） */
export function buildCaption(body: string, hashtags: string[]): string {
  const tags = hashtags.join(" ");
  return tags ? `${body}\n\n${tags}` : body;
}
