import "server-only";
import { fmtJst, HANDEDNESS_LABEL, INTAKE_FIELDS, fmtSeq } from "@/lib/reserve";

/**
 * 汎用メール送信レイヤ（Resend）。
 * 今後の全社トランザクションメール（予約・問い合わせ・通知）に流用できるよう、
 * 送信処理は sendEmail() に集約し、用途別の関数はテンプレを組み立てて呼ぶだけにしている。
 *
 * env:
 *   RESEND_API_KEY       … Resend APIキー（未設定なら送信スキップ＝開発時も落ちない）
 *   RESERVE_FROM_EMAIL   … 送信元（YOZANのアドレス）
 *   RESERVE_STAFF_EMAIL  … 予約通知の宛先（GOLF WINGのアドレス）
 */

export type MailResult = { ok: boolean; skipped?: boolean; error?: string };

export type SendInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  from?: string;
};

const FROM_DEFAULT = () => process.env.RESERVE_FROM_EMAIL || "info@yozan-inc.jp";

/**
 * メール本文に載せる自サイトのURL。
 * NEXT_PUBLIC_SITE_URL を明示していなくても、Vercelが自動で渡す本番ドメインで代替する
 * （env設定漏れでメールのリンクが消える事故を防ぐ / DECISIONS #34）。
 *   VERCEL_PROJECT_PRODUCTION_URL … 本番ドメイン（例: shift-cloud-reserve-os.vercel.app）
 *   VERCEL_URL                    … そのデプロイ固有のURL（プレビュー時のフォールバック）
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : "";
}

export async function sendEmail(input: SendInput): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[mail] RESEND_API_KEY 未設定のため送信をスキップしました:", input.subject);
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from || FROM_DEFAULT(),
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[mail] Resend送信失敗:", res.status, body);
      return { ok: false, error: `${res.status} ${body}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[mail] Resend送信例外:", e);
    return { ok: false, error: String(e) };
  }
}

/* ============================================================
   予約OS 用テンプレ
   ============================================================ */

type RequestRow = Record<string, unknown>;

function esc(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

function detailRows(r: RequestRow): string {
  return INTAKE_FIELDS.map(({ key, label }) => {
    let val = r[key];
    if (key === "handedness" && typeof val === "string") val = HANDEDNESS_LABEL[val] ?? val;
    return `<tr><td style="padding:4px 12px 4px 0;color:#6b6b63;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0;color:#1a1a17">${esc(val)}</td></tr>`;
  }).join("");
}

function preferredRows(r: RequestRow): string {
  const items = [r.pref1_at, r.pref2_at, r.pref3_at].filter(Boolean) as string[];
  return items
    .map((iso, i) => `<tr><td style="padding:4px 12px 4px 0;color:#6b6b63;white-space:nowrap">第${i + 1}希望</td><td style="padding:4px 0;color:#1a1a17;font-weight:600">${esc(fmtJst(iso))}</td></tr>`)
    .join("");
}

/** 新規申込 → GOLF WING（スタッフ）へ通知。返信先はお客様のメール。 */
export async function notifyStaffNewRequest(r: RequestRow): Promise<MailResult> {
  const to = process.env.RESERVE_STAFF_EMAIL;
  if (!to) {
    console.warn("[mail] RESERVE_STAFF_EMAIL 未設定のためスタッフ通知をスキップ");
    return { ok: false, skipped: true };
  }
  const seq = fmtSeq(r.request_seq as number);
  const svc = esc(r.service_name);
  const base = siteUrl();
  const adminUrl = base ? `${base}/requests/${r.id}` : "";
  const html = `
  <div style="font-family:system-ui,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:640px;margin:0 auto;color:#1a1a17">
    <p style="letter-spacing:.3em;font-size:11px;color:#a9863f;margin:0 0 4px">GOLF WING — 予約申込</p>
    <h2 style="margin:0 0 16px;font-size:18px">新しい${svc}のお申し込み（${seq}）</h2>
    <p style="margin:0 0 8px;color:#6b6b63;font-size:13px">対応可能なスタッフとフィッティング枠をご確認のうえ、下記のお客様へ折り返しご連絡ください（このメールへの返信でお客様に届きます）。</p>
    <table style="border-collapse:collapse;font-size:14px;margin:16px 0"><tbody>${preferredRows(r)}</tbody></table>
    <div style="height:1px;background:#e5e2d9;margin:12px 0"></div>
    <table style="border-collapse:collapse;font-size:14px"><tbody>${detailRows(r)}</tbody></table>
    ${adminUrl ? `<p style="margin:20px 0 0"><a href="${adminUrl}" style="color:#0f6b4f">▶ 管理画面でこの申込を開く</a></p>` : ""}
  </div>`;
  const text =
    `【GOLF WING 予約申込 ${seq}】${String(r.service_name ?? "")}\n` +
    `希望日時: ${[r.pref1_at, r.pref2_at, r.pref3_at].filter(Boolean).map((v) => fmtJst(v as string)).join(" / ")}\n` +
    `氏名: ${String(r.name ?? "")} / 電話: ${String(r.phone ?? "")} / メール: ${String(r.email ?? "")}\n`;

  return sendEmail({
    to,
    subject: `【予約申込】${String(r.service_name ?? "")} ${String(r.name ?? "")}様（${seq}）`,
    html,
    text,
    replyTo: (r.email as string) || undefined,
  });
}

/** 申込直後にお客様へ受付確認（自動返信）。返信先はGOLF WINGのアドレス。 */
export async function ackCustomer(r: RequestRow): Promise<MailResult> {
  const to = r.email as string | undefined;
  if (!to) return { ok: false, skipped: true };
  const seq = fmtSeq(r.request_seq as number);
  const svc = esc(r.service_name);
  const html = `
  <div style="font-family:system-ui,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:640px;margin:0 auto;color:#1a1a17">
    <p style="letter-spacing:.3em;font-size:11px;color:#a9863f;margin:0 0 4px">GOLF WING</p>
    <h2 style="margin:0 0 16px;font-size:18px">${svc} のお申し込みを受け付けました</h2>
    <p style="margin:0 0 12px">${esc(r.name)} 様</p>
    <p style="margin:0 0 12px;line-height:1.8">この度はGOLF WINGへお申し込みいただきありがとうございます。<br>
    スタッフが空き状況を確認のうえ、<b>ご登録のお電話番号に折り返しご連絡し、ご予約を確定</b>いたします。今しばらくお待ちください。</p>
    <table style="border-collapse:collapse;font-size:14px;margin:12px 0"><tbody>${preferredRows(r)}</tbody></table>
    <p style="margin:16px 0 0;color:#6b6b63;font-size:13px">受付番号: ${seq}<br>
    ※本メールは送信専用ではありません。ご返信いただくとGOLF WING担当者へ届きます。</p>
  </div>`;
  const text =
    `${String(r.name ?? "")} 様\n\nこの度はGOLF WING ${String(r.service_name ?? "")}へお申し込みいただきありがとうございます。\n` +
    `スタッフが空き状況を確認のうえ、お電話で折り返しご連絡し、ご予約を確定いたします。\n受付番号: ${seq}\n`;

  return sendEmail({
    to,
    subject: `【GOLF WING】お申し込みを受け付けました（${seq}）`,
    html,
    text,
    replyTo: process.env.RESERVE_STAFF_EMAIL || undefined,
  });
}

/** 確定連絡（スタッフが管理画面から送信）。返信先はGOLF WING。 */
export async function sendConfirmation(r: RequestRow, slotISO: string, message?: string): Promise<MailResult> {
  const to = r.email as string | undefined;
  if (!to) return { ok: false, skipped: true };
  const seq = fmtSeq(r.request_seq as number);
  const html = `
  <div style="font-family:system-ui,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:640px;margin:0 auto;color:#1a1a17">
    <p style="letter-spacing:.3em;font-size:11px;color:#a9863f;margin:0 0 4px">GOLF WING</p>
    <h2 style="margin:0 0 16px;font-size:18px">${esc(r.service_name)} のご予約が確定しました</h2>
    <p style="margin:0 0 12px">${esc(r.name)} 様</p>
    <p style="margin:0 0 8px;line-height:1.8">下記の日時でご予約を確定いたしました。ご来店をお待ちしております。</p>
    <p style="font-size:18px;font-weight:700;color:#0f6b4f;margin:12px 0">${esc(fmtJst(slotISO))}</p>
    ${message ? `<p style="margin:12px 0;line-height:1.8;white-space:pre-wrap">${esc(message)}</p>` : ""}
    <p style="margin:16px 0 0;color:#6b6b63;font-size:13px">受付番号: ${seq}<br>ご変更・キャンセルは本メールへのご返信でご連絡ください。</p>
  </div>`;
  return sendEmail({
    to,
    subject: `【GOLF WING】ご予約が確定しました（${fmtJst(slotISO)}）`,
    html,
    replyTo: process.env.RESERVE_STAFF_EMAIL || undefined,
  });
}

/**
 * LINE通知フック（Phase後続 / NEXT_TASKS「LINE公式アカウント連携」）。
 * n8n Webhook or Messaging API push が整い次第、ここに実装を差し込む。現状はno-op。
 */
export async function notifyLine(_r: RequestRow): Promise<MailResult> {
  // TODO: DECISIONS #29 の n8n 統合ハブ経由でLINE通知を送る
  return { ok: false, skipped: true };
}
