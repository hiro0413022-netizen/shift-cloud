/**
 * FRANK GOLF お客様向けメールの文面（純粋関数・tests/frank-pos.test.ts で固定）#118
 * 送信本体は frank-mail.ts。
 */

export const FRANK_SITE = "https://frankgolf.jp";
const TEL_NOTE = "ご不明な点はお気軽にご連絡ください。";

export const fmtDateJa = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  const dow = "日月火水木金土"[new Date(`${d}T00:00:00Z`).getUTCDay()];
  return `${y}年${m}月${day}日（${dow}）`;
};

/** 体験予約の確認メール本文 */
export function buildTrialConfirmMail(p: {
  name: string;
  date: string;
  start: string;
  end: string;
  bayName: string;
  cancelToken: string;
}): { subject: string; text: string } {
  const cancelUrl = `${FRANK_SITE}/trial-booking.html?cancel=${p.cancelToken}`;
  return {
    subject: `【FRANK GOLF】体験レッスンのご予約を承りました（${fmtDateJa(p.date)} ${p.start}〜）`,
    text: [
      `${p.name} 様`,
      "",
      "FRANK GOLF（姫路）です。体験レッスンのご予約を承りました。",
      "",
      `日時: ${fmtDateJa(p.date)} ${p.start}〜${p.end}（約55分）`,
      `打席: ${p.bayName}`,
      `アクセス: ${FRANK_SITE}/access.html`,
      "",
      "当日は動きやすい服装でお越しください。クラブ・シューズは無料でお貸しします。",
      "",
      "▼ キャンセル・日程変更はこちらから（お電話不要）",
      cancelUrl,
      "",
      TEL_NOTE,
      "FRANK GOLF",
      FRANK_SITE,
    ].join("\n"),
  };
}

/** 前日リマインダー本文 */
export function buildReminderMail(p: {
  name: string;
  kind: "体験レッスン" | "打席のご予約";
  date: string;
  start: string;
  end: string;
  cancelUrl?: string;
}): { subject: string; text: string } {
  return {
    subject: `【FRANK GOLF】明日 ${p.start}〜 ${p.kind}のお知らせ`,
    text: [
      `${p.name} 様`,
      "",
      `明日の${p.kind}をお知らせします。`,
      "",
      `日時: ${fmtDateJa(p.date)} ${p.start}〜${p.end}`,
      `アクセス: ${FRANK_SITE}/access.html`,
      "",
      ...(p.cancelUrl ? ["▼ ご都合が悪くなった場合はこちらからキャンセルできます", p.cancelUrl, ""] : []),
      TEL_NOTE,
      "FRANK GOLF",
      FRANK_SITE,
    ].join("\n"),
  };
}
