import "server-only";

/**
 * FRANK GOLF お客様向けメール（member-os 側）
 *
 * 経緯: Web入会申込（/join-web）は申込を受け付けるだけで、申込者にも店舗にも
 * 一切通知が飛んでいなかった。申込者は「送信できたのか」「会員番号は何番か」が
 * 分からず、同じ人が何度も申し込む／予約ページで弾かれる、という事故が起きていた。
 * （2026-08-07 ユーザー検証で判明）
 *
 * env（Vercel: member-os）:
 *   RESEND_API_KEY    … Resend APIキー（未設定なら送信をスキップするだけで、申込自体は成立させる）
 *   FRANK_MAIL_FROM   … 送信元。既定 "FRANK GOLF <info@frankgolf.jp>"
 *                       ※ Resend で frankgolf.jp のドメイン認証が必要
 *
 * メール送信の失敗で申込処理を落とさない（申込の成立が最優先）。
 */

const FROM_DEFAULT = "FRANK GOLF <info@frankgolf.jp>";
export const FRANK_SITE = "https://frankgolf.jp";

export type MailResult = { ok: boolean; skipped?: boolean; error?: string };
/** Resend の添付（content は base64 文字列） */
export type MailAttachment = { filename: string; content: string };

export async function sendFrankMail(input: {
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[frank-mail] RESEND_API_KEY 未設定のため送信をスキップ:", input.subject);
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.FRANK_MAIL_FROM || FROM_DEFAULT,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[frank-mail] 送信失敗:", res.status, body.slice(0, 300));
      return { ok: false, error: `resend ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[frank-mail] 送信失敗:", e);
    return { ok: false, error: String(e) };
  }
}

/**
 * 体験申込（希望日時3つの申込型・member-os /trial）の受付メール。
 * サイトのカレンダー予約（即確定）と違い、この時点では日時は確定していない。
 * 「スタッフから連絡して日時を確定する」ことを必ず書く。
 */
export function buildTrialRequestReceiptMail(input: {
  name: string;
  pref1?: string | null;
  pref2?: string | null;
  pref3?: string | null;
}): { subject: string; text: string } {
  const prefs = [input.pref1, input.pref2, input.pref3]
    .map((p, i) => (p ? `第${i + 1}希望: ${p}` : null))
    .filter(Boolean)
    .join("\n");
  return {
    subject: "【FRANK GOLF】体験レッスンのお申し込みを受け付けました",
    text: [
      `${input.name} 様`,
      "",
      "FRANK GOLF（姫路）です。体験レッスンのお申し込みありがとうございます。",
      "以下の内容で受け付けました。",
      "",
      prefs || "ご希望日時: （記載なし）",
      "",
      "スタッフが空き状況を確認のうえ、お電話またはメールで日時を確定のご連絡をいたします。",
      "1〜2営業日たっても連絡がない場合は、お手数ですがこのメールにご返信ください。",
      "",
      "当日は動きやすい服装でお越しください。クラブ・シューズは無料でお貸しします。",
      "",
      "FRANK GOLF（姫路・土山）",
      FRANK_SITE,
    ].join("\n"),
  };
}

/**
 * Web入会申込の受付メール（申込者あて）。
 *
 * この時点では会員番号は発行されない（スタッフ承認時に発行）。
 * 「まだ予約はできない」「会員番号は追ってご連絡する」の2点を必ず書く。
 * ここが曖昧だと、申込直後に予約ページで弾かれて問い合わせになる。
 */
export function buildWebSignupReceiptMail(input: { name: string; planName?: string | null }): {
  subject: string;
  text: string;
} {
  const plan = input.planName ? `\nご希望プラン: ${input.planName}` : "";
  return {
    subject: "【FRANK GOLF】入会申込を受け付けました",
    text: [
      `${input.name} 様`,
      "",
      "FRANK GOLF へのご入会申込ありがとうございます。以下の内容で受け付けました。",
      `お名前: ${input.name} 様${plan}`,
      "",
      "■ このあとの流れ",
      "1. スタッフが内容を確認し、ご入会を承認します（通常1〜2営業日）。",
      "2. 承認後、会員番号をご連絡します。",
      "3. 会員番号が届いたら、打席のWeb予約をご利用いただけます。",
      "",
      "※ 会員番号が発行されるまでは、Web予約（打席・レッスン）はご利用いただけません。",
      "　 承認前に予約ページで会員番号を入力するとエラーになりますので、ご連絡をお待ちください。",
      "",
      `打席予約ページ: ${FRANK_SITE}/booking.html`,
      "",
      "ご不明な点はこのメールにご返信ください。",
      "FRANK GOLF（姫路・土山）",
      FRANK_SITE,
    ].join("\n"),
  };
}

/**
 * 入会承認メール（会員番号の通知）#123
 *
 * #120の残課題「承認時に会員番号を伝える手段が未実装＝電話・LINEで案内する運用」を解消する。
 * このメールが届いて初めてお客様は (1)Web予約 (2)月会費のカード登録 ができるようになるため、
 * 会員番号・ログイン方法（会員番号＋電話下4桁）・カード登録の場所、の3点を必ず書く。
 */
export function buildApprovalMail(input: {
  name: string;
  memberNo: string;
  planName?: string | null;
  monthlyFeeTaxIncluded?: number | null; // 税込・円（0円プランは案内を変える）
  joiningFeeTaxIncluded?: number | null; // 税込・円（クーポン適用なら0を渡す）
}): { subject: string; text: string } {
  const fee = input.monthlyFeeTaxIncluded ?? 0;
  const joinFee = input.joiningFeeTaxIncluded ?? 0;
  const planLine = input.planName
    ? `ご入会プラン: ${input.planName}${fee > 0 ? `（月会費 ${fee.toLocaleString()}円・税込）` : ""}`
    : "";
  const billing =
    fee > 0
      ? [
          "■ 月会費のお支払い登録（クレジットカード）",
          `打席予約ページ（${FRANK_SITE}/booking.html）の「月会費のお支払い登録」から、`,
          "会員番号と電話番号下4桁を入力してお手続きください。安全な決済ページ（Square）で",
          "カードを登録すると、月会費は毎月自動でお支払いになります。",
          joinFee > 0
            ? `初回のみ、月会費に続けて入会金 ${joinFee.toLocaleString()}円（税込）を同じカードへ自動でご請求します。`
            : "入会金はクーポン適用のため無料です。",
          "（口座振替をご希望の方は店頭でお手続きください）",
          "",
        ]
      : [];
  return {
    subject: `【FRANK GOLF】ご入会が完了しました（会員番号 ${input.memberNo}）`,
    text: [
      `${input.name} 様`,
      "",
      "FRANK GOLF へのご入会ありがとうございます。ご入会手続きが完了しました。",
      "",
      `■ あなたの会員番号: ${input.memberNo}`,
      ...(planLine ? [planLine, ""] : [""]),
      "■ 打席のWeb予約",
      `${FRANK_SITE}/booking.html から、会員番号と電話番号下4桁でご予約いただけます。`,
      "",
      ...billing,
      "会員番号はこのメールを保存するか、スクリーンショットでお控えください。",
      "",
      "ご不明な点はこのメールにご返信ください。",
      "FRANK GOLF（姫路・土山）",
      FRANK_SITE,
    ].join("\n"),
  };
}
