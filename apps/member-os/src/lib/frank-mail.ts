import "server-only";
import { FRANK_LINKS, FRANK_SITE, trialCancelUrl } from "@yozan/core/frank-links";

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
export { FRANK_SITE };

/**
 * お客様に出すリンクは会員ポータル（my.frankgolf.jp）に一本化した（#188）。
 * メールの中に frankgolf.jp と member-os-tau.vercel.app が混在していて、
 * 「打席予約はこちら」が2つあるように見えていた（2026-09-01 ユーザー指摘）。
 * URLの正典は @yozan/core/frank-links。ここで直書きしない。
 */
/** 会員あて（会員ページへ誘導する） */
const SIGNATURE = ["FRANK GOLF（姫路・土山）", `会員ページ ${FRANK_LINKS.home}`];
/** まだ会員でない方あて（体験の申込など。会員ページに送っても入れない） */
const SIGNATURE_GUEST = ["FRANK GOLF（姫路・土山）", FRANK_SITE];

/**
 * 送信結果。id は Resend のメッセージID（#188）。
 * 「送ったのに届いていない」の相談は、このIDで Resend のログを引けば
 * delivered / bounced / complained のどれなのかが一発で分かる。
 * IDを持ち帰らないと、毎回メールアドレスと時刻で探すことになる。
 */
export type MailResult = { ok: boolean; skipped?: boolean; error?: string; id?: string };
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
      // 理由まで持ち帰る（例: 無料プランの上限・ドメイン未認証は本文にしか出ない）
      return { ok: false, error: `resend ${res.status} ${body.slice(0, 160)}`.trim() };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    console.info("[frank-mail] 送信:", input.to, json.id ?? "(id不明)", input.subject);
    return { ok: true, id: json.id };
  } catch (e) {
    console.error("[frank-mail] 送信失敗:", e);
    return { ok: false, error: String(e) };
  }
}

/**
 * 予約の日時・打席を変更したときのお知らせ（#151）。
 *
 * スタッフが画面で「お客様にメールで知らせる」にチェックしたときだけ送る。
 * 勝手に飛ばさないのは、電話で口頭合意した直後にメールが来ると二度手間になる現場があるため。
 * キャンセル用リンクは元のまま有効なので、そのまま再掲する。
 */
export function buildBookingRescheduleMail(input: {
  name: string;
  before: string; // "2026-09-05 10:00〜11:00 Aブース"
  after: string;
  cancelToken?: string | null;
  kind: "trial" | "booking";
}): { subject: string; text: string } {
  const label = input.kind === "trial" ? "体験レッスン" : "ご予約";
  const cancel = input.cancelToken ? trialCancelUrl(input.cancelToken) : null;
  return {
    subject: `【FRANK GOLF】${label}の日時変更のお知らせ`,
    text: [
      `${input.name} 様`,
      "",
      `${label}の日時を変更いたしましたのでお知らせします。`,
      "",
      `変更前: ${input.before}`,
      `変更後: ${input.after}`,
      "",
      "お間違いがないかご確認ください。ご都合が合わない場合はお手数ですがご連絡ください。",
      ...(cancel ? ["", "ご予約の確認・キャンセルはこちらから", cancel] : []),
      ...(input.kind === "booking" ? ["", "ご予約の確認・変更は会員ページから", FRANK_LINKS.home] : []),
      "",
      "──────────────",
      ...(input.kind === "trial" ? SIGNATURE_GUEST : SIGNATURE),
    ].join("\n"),
  };
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
      ...SIGNATURE_GUEST,
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
      `会員ページ（ご予約・カルテ・会員証QR）: ${FRANK_LINKS.home}`,
      "",
      "ご不明な点はこのメールにご返信ください。",
      ...SIGNATURE,
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
          `${FRANK_LINKS.settings}`,
          "会員ページにログインし、「設定・お手続き」からお手続きください。",
          "安全な決済ページ（Square）でカードを登録すると、月会費は毎月自動でお支払いになります。",
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
      "■ 会員ページ（打席のご予約・ご予約の確認・レッスンカルテ・会員証QR）",
      FRANK_LINKS.home,
      "ログインは 会員番号 と 電話番号の下4桁 です。",
      "",
      ...billing,
      "会員番号はこのメールを保存するか、スクリーンショットでお控えください。",
      "",
      "ご不明な点はこのメールにご返信ください。",
      ...SIGNATURE,
    ].join("\n"),
  };
}

/**
 * 法人プランのご利用者に追加したときのご案内（#204）
 *
 * ご契約者が会員ページから追加した瞬間に、ご本人へお送りする。
 * 会社の中で会員番号を伝え忘れると、その方は会員ページに入れないまま終わる。
 * 必要なのは (1)会員番号 (2)ログイン方法 (3)御社の枠は分け合うこと の3点。
 */
export function buildCorporateUserMail(input: {
  name: string;
  memberNo: string;
  companyName?: string | null;
  maxOpenSlots?: number | null;
}): { subject: string; text: string } {
  const slots = Number(input.maxOpenSlots ?? 4);
  return {
    subject: `【FRANK GOLF】会員ページのご案内（会員番号 ${input.memberNo}）`,
    text: [
      `${input.name} 様`,
      "",
      `${input.companyName ? `${input.companyName} の法人プラン` : "法人プラン"}のご利用者としてご登録いただきました。`,
      "本日から打席のご予約をお取りいただけます。",
      "",
      `■ あなたの会員番号: ${input.memberNo}`,
      "",
      "■ 会員ページ（打席のご予約・会員証QR・レッスンカルテ）",
      FRANK_LINKS.home,
      "ログインは 会員番号 と ご自身の電話番号の下4桁 です。",
      "",
      "■ ご予約について",
      `打席のご予約は御社の合計 ${slots}コマ（1コマ=1時間）を、ご登録者のみなさまで分け合ってお取りいただきます。`,
      "ご利用が済むと（その時間を過ぎるか、ご来店いただくと）、また次のご予約をお取りいただけます。",
      "会員ページに「御社のご予約」として、いま何コマ使われているかが表示されます。",
      "",
      "月会費は御社へご請求しておりますので、お客様個人へのご請求はございません。",
      "",
      "ご不明な点はこのメールにご返信ください。",
      ...SIGNATURE,
    ].join("\n"),
  };
}
