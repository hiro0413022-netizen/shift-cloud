// 文面の組み立て。純粋関数。
//
// 特定電子メール法4条は、送信者の氏名・名称、住所、受信拒否の通知先の表示を義務づけている。
// これをテンプレート本文に書かせると**書き忘れた文面が1つでも混ざった瞬間に違法**になるので、
// 本文とは別に、ここが機械的に必ず付ける。テンプレート側で消すことはできない。

import type { ComposedEmail, CompanyIdentity, SendCandidate, TemplateRow } from "./types";

/** 業種に一致するテンプレートを選ぶ。無ければ industry=null の既定を使う */
export function pickTemplate(templates: TemplateRow[], industry: string): TemplateRow | null {
  const live = templates.filter((t) => t.enabled).sort((a, b) => a.sort - b.sort);
  return live.find((t) => t.industry === industry) ?? live.find((t) => t.industry == null) ?? null;
}

/** 差込。未知の差込キーは空文字にする（`{{foo}}` が本文に残って先方に見えるのを防ぐ） */
export function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface ComposeInput {
  template: TemplateRow;
  prospect: SendCandidate & { improvePoints?: string | null; city?: string | null };
  company: CompanyIdentity;
  demoUrl: string;
  unsubUrl: string;
  replyTo: string;
}

export function composeEmail(input: ComposeInput): ComposedEmail {
  const { template, prospect, company, demoUrl, unsubUrl, replyTo } = input;

  // 改善余地は最大2つまで。3つ以上並べると「ダメ出しの手紙」になって読まれない
  const improve = (prospect.improvePoints ?? "")
    .split("\n")
    .map((s) => s.replace(/^[-・]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 2);

  const vars: Record<string, string> = {
    name: prospect.name,
    city: prospect.city ?? "",
    improve: improve.length ? improve.map((s) => `・${s}`).join("\n") : "",
    improveInline: improve.join("、"),
    demoUrl,
    company: company.companyName,
    representative: company.representative,
  };

  const subject = fill(template.subject, vars).trim();
  const bodyMain = fill(template.body, vars).trim();

  // ここから下は法定表示。テンプレートの内容にかかわらず必ず付く
  const legal = [
    "――――――――――――――――――――",
    `${company.companyName}（${company.representative}）`,
    `${company.postalCode} ${company.address}`,
    `お問い合わせ・ご返信: ${replyTo}`,
    "",
    "今後このようなご案内が不要な場合は、下記から配信停止いただけます（以後お送りしません）。",
    unsubUrl,
    "――――――――――――――――――――",
  ].join("\n");

  const text = `${bodyMain}\n\n${legal}\n`;

  const html = `<div style="font-family:system-ui,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:640px;color:#1a1a17;line-height:1.9;font-size:15px">
${esc(bodyMain)
  .split("\n")
  .map((line) =>
    line.trim() === ""
      ? "<div style=\"height:12px\"></div>"
      : `<div>${line.replace(new RegExp(escapeRe(demoUrl), "g"), `<a href="${demoUrl}" style="color:#0f6b4f">${demoUrl}</a>`)}</div>`,
  )
  .join("")}
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e2d9;color:#6b6b63;font-size:12px;line-height:1.8">
    <div>${esc(company.companyName)}（${esc(company.representative)}）</div>
    <div>${esc(company.postalCode)} ${esc(company.address)}</div>
    <div>お問い合わせ・ご返信: <a href="mailto:${esc(replyTo)}" style="color:#6b6b63">${esc(replyTo)}</a></div>
    <div style="margin-top:10px">今後このようなご案内が不要な場合は <a href="${unsubUrl}" style="color:#6b6b63">こちらから配信停止</a> いただけます（以後お送りしません）。</div>
  </div>
</div>`;

  return { subject, text, html };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 既定のテンプレート（初回投入用）。売り込みではなく「見てもらう」ことだけを目的にした短い文面 */
export const DEFAULT_TEMPLATES: { key: string; name: string; industry: string | null; subject: string; body: string; sort: number }[] = [
  {
    key: "default",
    name: "既定（全業種）",
    industry: null,
    sort: 100,
    subject: "{{name}} 様のホームページ案を作ってみました（ご確認だけでも）",
    body: `{{name}} ご担当者さま

突然のご連絡失礼いたします。兵庫県宝塚市でインドアゴルフ場の運営とシステム開発をしております、{{company}}の{{representative}}と申します。

貴院・貴店のホームページを拝見し、スマートフォンでの見え方を中心に、こちらで改善案を1ページ実際に作成いたしました。売り込みというより、必要かどうかを画面をご覧になってご判断いただきたくご連絡しました。

{{improve}}

▼ 作成した案（60日間の限定公開・検索には出ません）
{{demoUrl}}

ご覧になって「不要」と思われましたら、このメールは破棄いただいて構いません。ご興味をお持ちいただけましたら、このメールにご返信ください。費用感のみのご相談でも承ります。`,
  },
  {
    key: "vet",
    name: "動物病院",
    industry: "vet",
    sort: 10,
    subject: "{{name}} 様のホームページ案を作ってみました（ご確認だけでも）",
    body: `{{name}} ご担当者さま

突然のご連絡失礼いたします。兵庫県宝塚市でインドアゴルフ場の運営とシステム開発をしております、{{company}}の{{representative}}と申します。

貴院のホームページを拝見し、飼い主さまがスマートフォンで「診療時間・予約・アクセス」にたどり着きやすい形を、こちらで1ページ実際に作成いたしました。売り込みというより、必要かどうかを画面をご覧になってご判断いただきたくご連絡しました。

{{improve}}

▼ 作成した案（60日間の限定公開・検索には出ません）
{{demoUrl}}

ご覧になって「不要」と思われましたら、このメールは破棄いただいて構いません。ご興味をお持ちいただけましたら、このメールにご返信ください。`,
  },
];
