import "server-only";
import { createAdmin } from "@/lib/db";
import { inquiryKindLabel } from "@/lib/inquiry";

// ============================================================
// お問い合わせを「プロが指定したメールアドレス」へ届ける（#235）。
//
// - Reply-To を問い合わせた方にする → プロは届いたメールに返信するだけでやり取りが始まる。
// - 送信元は運営の送信専用アドレス（Resendで認証済みのドメインでないと届かない）。
//   表示名だけ「◯◯ オフィシャルサイト」に差し替える。
// - 記録は pgw_inquiries が正。送信に失敗しても問い合わせは消えず、管理画面から再送できる。
//
// env（Vercel: pro-site）:
//   RESEND_API_KEY … 未設定なら送らない（mail_status='skipped'・フォーム自体は受け付ける）
//   PRO_MAIL_FROM  … 送信元アドレス。未設定なら DEFAULT_FROM
// ============================================================

// Resend無料プランの認証済みドメインは frankgolf.jp の1枠だけ（2026-09-01実測）。ここ以外の
// ドメインから送ると届かないので、既定はそれに合わせる。YOZANのドメインを認証したら PRO_MAIL_FROM で差し替える。
const DEFAULT_FROM = "noreply@frankgolf.jp";

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(displayName: string): string {
  const raw = (process.env.PRO_MAIL_FROM || DEFAULT_FROM).trim();
  const addr = raw.match(/<([^>]+)>/)?.[1] ?? raw;
  // 表示名に " や改行が入るとヘッダーが壊れるので落とす
  const name = displayName.replace(/["\r\n<>]/g, "").trim();
  return name ? `${name} <${addr}>` : addr;
}

function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

function fmtJst(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

type InquiryRow = {
  id: string;
  kind: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  message: string;
  created_at: string;
};

export function buildInquiryMail(proName: string, q: InquiryRow, adminUrl: string): { subject: string; text: string } {
  const who = q.company ? `${oneLine(q.name)} 様（${oneLine(q.company)}）` : `${oneLine(q.name)} 様`;
  const subject = `【お問い合わせ】${inquiryKindLabel(q.kind)}｜${who}`;
  const line = "────────────────────";
  const text = [
    `${proName} オフィシャルサイトのお問い合わせフォームから、新しいお問い合わせが届きました。`,
    `このメールにそのまま返信すると、お問い合わせいただいた方（${q.email}）に届きます。`,
    "",
    line,
    `種類　　　：${inquiryKindLabel(q.kind)}`,
    `お名前　　：${q.name}`,
    `会社・団体：${q.company || "（未入力）"}`,
    `メール　　：${q.email}`,
    `電話番号　：${q.phone || "（未入力）"}`,
    `受付日時　：${fmtJst(q.created_at)}`,
    line,
    q.message,
    line,
    "",
    "届いたお問い合わせは管理画面でも確認できます。",
    adminUrl,
    "",
    "※このメールは送信専用アドレスから自動でお送りしています。",
  ].join("\n");
  return { subject, text };
}

export type DeliverResult = { status: "sent" | "failed" | "skipped"; error?: string };

/**
 * pgw_inquiries の1件を、いまのプロの受信アドレスへ送り、結果を台帳に書き戻す。
 * 公開フォームの送信直後と、管理画面の「再送」の両方から呼ぶ。
 */
export async function deliverInquiry(inquiryId: string, adminUrl: string): Promise<DeliverResult> {
  const admin = createAdmin();
  const { data: q } = await admin
    .from("pgw_inquiries")
    .select("id, pro_id, kind, name, company, email, phone, message, created_at")
    .eq("id", inquiryId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!q) return { status: "failed", error: "not found" };
  const { data: pro } = await admin.from("pgw_pros").select("name, contact_email").eq("id", q.pro_id).maybeSingle();

  const to = pro?.contact_email?.trim();
  const apiKey = process.env.RESEND_API_KEY;
  let result: DeliverResult & { id?: string };

  if (!to) {
    result = { status: "skipped", error: "受信メールアドレスが未設定" };
  } else if (!apiKey) {
    result = { status: "skipped", error: "RESEND_API_KEY 未設定" };
  } else {
    const { subject, text } = buildInquiryMail(pro!.name, q as InquiryRow, adminUrl);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromAddress(`${pro!.name} オフィシャルサイト`),
          to: [to],
          reply_to: q.email,
          subject,
          text,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      result = res.ok
        ? { status: "sent", id: body.id }
        : { status: "failed", error: `resend ${res.status} ${body.message ?? body.name ?? ""}`.trim().slice(0, 200) };
    } catch (e) {
      result = { status: "failed", error: String(e).slice(0, 200) };
    }
  }

  if (result.status !== "sent") console.warn("[pro-site inquiry] メール未送信:", inquiryId, result.status, result.error);
  await admin
    .from("pgw_inquiries")
    .update({
      mail_status: result.status,
      mailed_to: to || null,
      mail_id: result.id ?? null,
      mail_error: result.error ?? null,
    })
    .eq("id", inquiryId);
  return { status: result.status, error: result.error };
}
