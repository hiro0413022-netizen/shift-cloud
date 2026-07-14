// 営業ドキュメント生成 — 1枚提案書 / 電話トーク / 訪問トーク / メール / お礼メール / 見積書案。
// ルールベース（Claude API不要・0秒生成）。営業先の分析結果が入っていれば差し込まれる。
// 思想: 現サイトを批判しない。「現在の魅力を活かしながら、スマホでより分かりやすく整理した案」として提案する。

import { INDUSTRIES, type IndustryKey } from "./types";

export interface DocInput {
  name: string; // 院名
  industry: IndustryKey;
  goodPoints?: string | null;
  improvePoints?: string | null;
  cautionPoints?: string | null;
  planName: string;
  buildPrice: number;
  monthlyFee: number;
  planPages?: string | null;
  planFeatures: string[];
  demoUrl?: string | null;
  ownerName: string; // 営業担当
}

const yen = (n: number) => n.toLocaleString("ja-JP") + "円";
const label = (k: IndustryKey) => INDUSTRIES[k] ?? "医院";
const isVet = (k: IndustryKey) => k === "vet";
const visitors = (k: IndustryKey) => (isVet(k) ? "飼い主さま" : "患者さま");

export function buildProposal(d: DocInput): { title: string; content: string } {
  const v = visitors(d.industry);
  return {
    title: `${d.name}さま向け ホームページ改善のご提案（1枚）`,
    content: `# ${d.name}さま向け ホームページ改善のご提案

**ご提案日**: ${new Date().toLocaleDateString("ja-JP")}　**担当**: ${d.ownerName}（YOZAN）

## 1. 現在のホームページの良い点

${d.goodPoints || `${label(d.industry)}としての情報がきちんと掲載されており、${v}への誠実な姿勢が伝わります。（分析後に具体化）`}

## 2. ${v}目線で、もう一歩分かりやすくできる点

${d.improvePoints || `- スマートフォンでの診療時間・予約方法の見つけやすさ\n- 初めての方向けの案内（持ち物・流れ）\n- 電話・予約への導線`}

## 3. 今回作成したデモの内容

現在の情報と${d.name}さまの魅力を活かしたまま、スマートフォンで「診療時間・予約・アクセス」がすぐ分かる構成に整理した案です。

${d.demoUrl ? `**デモURL**: ${d.demoUrl}\n（非公開・検索対象外。スマートフォンでもご覧いただけます）` : "（デモURLは共有時に記載）"}

## 4. 改善後に期待できること

- ${v}が迷わず予約・来院できる（電話・予約導線の明確化）
- スマートフォンからの新規${isVet(d.industry) ? "来院" : "受診"}のしやすさ向上
- お知らせ更新が簡単になり、情報が新しく保てる
- 採用募集の受け皿ができる

## 5. 推奨プラン

| 項目 | 内容 |
|---|---|
| プラン | **${d.planName}** |
| 初期制作費 | **${yen(d.buildPrice)}**（税別） |
| 月額管理費 | **${yen(d.monthlyFee)}**（税別） |
| ページ数 | ${d.planPages ?? "-"} |
| 含まれる内容 | ${d.planFeatures.join(" / ")} |
| 制作期間 | 正式素材のご準備後 約4〜6週間 |

## 6. 次のステップ

1. デモをご覧いただき、ご感想・修正のご希望をお聞かせください
2. ご希望を反映した修正案と正式なお見積りをご提示します
3. ご契約後、写真撮影・文章作成を進め、公開まで伴走します

※デモの文章・画像は仮のものです。ご契約前に貴院の情報を正式利用することはありません。`,
  };
}

export function buildPhoneTalk(d: DocInput): { title: string; content: string } {
  const v = visitors(d.industry);
  const target = isVet(d.industry) ? "院長先生" : "院長先生（またはホームページのご担当者さま）";
  return {
    title: `${d.name}さま 電話営業トーク（目的: 10分の面談獲得）`,
    content: `# 電話トーク — ${d.name}さま

**ゴールは電話で売ることではなく、「10分だけデモを見てもらう約束」を取ること。**

## 導入（受付の方へ）

「お忙しいところ突然のお電話失礼いたします。宝塚で事業をしております YOZAN の${d.ownerName}と申します。
実は${d.name}さま向けに、ホームページのリニューアル案を**実際の画面として**お作りしまして、
売り込みというより、**必要かどうかを画面を見てご判断いただきたく**ご連絡しました。
${target}に、お取り次ぎいただくことは可能でしょうか？」

## 取り次いでもらえた場合（院長・担当者へ）

「${d.name}さま専用のホームページ案を、勝手ながら先にお作りしました。
${d.goodPoints ? `現在のホームページの${d.goodPoints.split("\n")[0].replace(/^[-・]\s*/, "")}はそのまま活かした上で、` : "現在の情報や貴院の雰囲気はそのまま活かした上で、"}
スマートフォンで${v}が診療時間や予約方法をすぐ見つけられる形に整理した案です。
**10分だけ**実物をご覧いただけないでしょうか。見ていただいて不要であれば、それで終わりで構いません。」

## 受付で断られた場合

「承知しました。それでは、デモ画面のURLと1枚のご案内だけお渡し（お送り）してもよろしいでしょうか。
院長先生のお手すきの際に、1分だけ見ていただければ十分です。」

## 折り返しをお願いする場合

「お忙しい時間帯に失礼しました。改めてのご連絡はいつ頃が迷惑になりにくいでしょうか。
（曜日・時間帯をメモ→ next_contact_on に登録）」

## 注意

- ${d.cautionPoints || "現在のホームページを否定する言い方をしない（「古い」「見にくい」はNG。「スマホでより分かりやすく整理した案」と言う）"}
- 電話で料金の話を深追いしない（面談で画面と一緒に提示する）`,
  };
}

export function buildVisitTalk(d: DocInput): { title: string; content: string } {
  const v = visitors(d.industry);
  return {
    title: `${d.name}さま 訪問営業トーク（面談の進め方）`,
    content: `# 訪問トーク — ${d.name}さま

## 進行（この順番を守る）

1. **現在サイトの良い点から入る**
   「${d.goodPoints || "（分析後に具体化。例: 診療方針が丁寧に書かれている、など）"}」
2. **${v}が迷いやすい部分を、批判せずに共有**
   「スマホで見たとき、${d.improvePoints ? d.improvePoints.split("\n")[0].replace(/^[-・]\s*/, "") : "診療時間と予約方法にたどり着くまでに数タップかかる"}ことがあり、もったいないと感じました」
3. **デモサイトの提示（PC→そのままスマホ）**
   「そこで、貴院の魅力を活かしたままこういう形にした案をお持ちしました」
   ${d.demoUrl ? `→ その場でスマホで開く: ${d.demoUrl}` : "→ タブレット・スマホで提示"}
4. **スマートフォン比較** — 現サイトとデモを並べて、ファーストビュー・診療時間・電話ボタンの違いを見せる
5. **予約導線の違い** — 「${v}は最短2タップで電話できます」
6. **院長の感想を聞く**（ここで一度黙る）
7. **修正希望を聞く** — 「色・構成・載せたい内容、その場で承ります」→ GENESISに入力
8. **料金提示** — ${d.planName}: 初期${yen(d.buildPrice)}＋月額${yen(d.monthlyFee)}（税別）
9. **次のステップ** — 「修正版のデモと正式なお見積りを、◯日までにお送りします」

## 面談中に修正要望が出たら

その場でGENESIS（営業先詳細 → 面談メモ・修正指示）に入力 → デモ再生成 → 見積再計算。

## タブー

- ${d.cautionPoints || "現サイト・現在の制作会社の批判"}
- その場でのクロージング強要（検討の時間を尊重する）`,
  };
}

export function buildEmail(d: DocInput): { title: string; content: string } {
  const v = visitors(d.industry);
  return {
    title: `${d.name}さま 初回メール・問い合わせフォーム文章`,
    content: `件名: ${d.name}さま向けホームページ案を作成しました（ご覧いただくだけで構いません）

${d.name}
ご担当者さま

突然のご連絡失礼いたします。
宝塚市で事業をしております、YOZAN の${d.ownerName}と申します。

このたび、${d.name}さま向けにホームページのリニューアル案を
実際にご覧いただける画面としてお作りしました。

${d.demoUrl ? `▼ デモサイト（非公開URL・検索には載りません）\n${d.demoUrl}\n※スマートフォンでもご覧いただけます` : "（デモURL）"}

現在のホームページの情報と貴院の雰囲気はそのまま活かし、
スマートフォンで${v}が「診療時間・予約方法・アクセス」を
すぐに見つけられる形に整理した案です。

売り込みのご連絡ではございません。
画面をご覧いただき、必要かどうかだけご判断いただければ幸いです。
もしご興味があれば、10分ほどお時間をいただければ直接ご説明いたします。

ご不要の場合は、このメールへのご返信は不要です。

YOZAN　${d.ownerName}
（電話・メールは提案書記載の連絡先へ）`,
  };
}

const THANKS: Record<string, (d: DocInput) => string> = {
  興味あり: (d) => `件名: 本日はありがとうございました（${d.name}さま デモの件）

本日は貴重なお時間をいただき、ありがとうございました。
デモをご覧いただき、前向きなお言葉をいただけて大変うれしく思います。

面談でいただいたご希望を反映した修正版デモと正式なお見積りを、
◯月◯日までにお送りいたします。

引き続きよろしくお願いいたします。
YOZAN ${d.ownerName}`,
  検討中: (d) => `件名: 本日はありがとうございました（${d.name}さま）

本日はお時間をいただきありがとうございました。
ご検討にあたり、判断材料が足りない点があれば何なりとお申し付けください。
デモは${d.demoUrl ? "こちらのURL" : "お渡ししたURL"}からいつでもご覧いただけます。

ご検討の期限は設けておりませんので、ご都合の良いタイミングでご連絡ください。
YOZAN ${d.ownerName}`,
  院内で相談: (d) => `件名: 本日はありがとうございました（院内でのご共有用資料）

本日はありがとうございました。
院内でご相談いただく際にそのままお使いいただけるよう、
デモURLと1枚の提案書を添付（記載）いたします。

スタッフの皆さまのご意見（特にスマートフォンでの見え方）も
ぜひお聞かせいただければ、修正案に反映いたします。
YOZAN ${d.ownerName}`,
  見積希望: (d) => `件名: お見積りの件（${d.name}さま）

本日はありがとうございました。
ご希望いただいたお見積りを、面談内容を反映のうえ◯月◯日までにお送りします。

概算は ${d.planName}: 初期制作費${yen(d.buildPrice)}＋月額${yen(d.monthlyFee)}（税別）です。
追加のご要望による増減は見積書に明記いたします。
YOZAN ${d.ownerName}`,
  今回は見送り: (d) => `件名: ありがとうございました（${d.name}さま）

このたびは、お時間をいただき誠にありがとうございました。
今回はご縁がありませんでしたが、デモをご覧いただけただけでも幸いです。

今後、ホームページのことでお困りごとがあれば
（更新が止まっている・スマホ表示・採用など）、いつでもお声がけください。
${d.name}さまの益々のご発展をお祈りしております。
YOZAN ${d.ownerName}`,
};

export function buildThanksMails(d: DocInput): { title: string; content: string } {
  return {
    title: `${d.name}さま 面談後お礼メール（5パターン）`,
    content: Object.entries(THANKS)
      .map(([k, fn]) => `## ${k}\n\n${fn(d)}`)
      .join("\n\n---\n\n"),
  };
}

export function buildQuote(d: DocInput): { title: string; content: string; meta: Record<string, unknown> } {
  const tax = Math.round(d.buildPrice * 0.1);
  return {
    title: `${d.name}さま 御見積書（案）`,
    content: `# 御見積書（案）

**宛先**: ${d.name} 御中
**発行**: YOZAN　**担当**: ${d.ownerName}
**日付**: ${new Date().toLocaleDateString("ja-JP")}　**有効期限**: 発行より30日

## お見積り内容 — ${d.planName}

| 項目 | 金額（税別） |
|---|---:|
| ホームページ制作一式（${d.planPages ?? "-"}） | ${yen(d.buildPrice)} |
| 消費税（10%） | ${yen(tax)} |
| **初期費用 合計（税込）** | **${yen(d.buildPrice + tax)}** |

| 月額 | 金額（税別） |
|---|---:|
| 管理費（${d.planFeatures.slice(-3).join("・")} 等） | ${yen(d.monthlyFee)}/月 |

## 含まれる内容

${d.planFeatures.map((f) => `- ${f}`).join("\n")}

## お支払い・その他

- 初期費用: 着手時50%・公開時50%（ご相談可）
- 制作期間: 素材確定後 約4〜6週間
- デモサイトの内容をベースに、正式素材（写真・文章）へ差し替えて制作します
- 本見積は概算です。面談での追加ご要望により正式見積を再提示します`,
    meta: { plan: d.planName, build_price: d.buildPrice, monthly_fee: d.monthlyFee, tax_rate: 0.1 },
  };
}

export const DOC_BUILDERS = {
  proposal: buildProposal,
  phone_talk: buildPhoneTalk,
  visit_talk: buildVisitTalk,
  email: buildEmail,
  thanks_mail: buildThanksMails,
} as const;
