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

export async function sendFrankMail(input: { to: string; subject: string; text: string }): Promise<MailResult> {
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
