import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { FRANK_STORE_ID } from "@yozan/core/frank-booking";
import { buildReminderMail, buildTrialConfirmMail } from "@/lib/frank-mail-pure";
import { trialCancelUrl } from "@yozan/core/frank-links";

export { buildTrialConfirmMail, buildReminderMail };

/**
 * FRANK GOLF お客様向けトランザクションメール（体験の予約確認＋前日リマインダー）#118
 *
 * 予約は画面で確定するが、画面を閉じるとキャンセルURLを失う＝確認メールが唯一の控えになる。
 * 前日リマインダーは無断キャンセル（no-show）対策。体験60件計画の歩留まりに直結する。
 *
 * env（Vercel: yozan-genesis）:
 *   RESEND_API_KEY    … Resend APIキー（未設定なら送信スキップ＝落ちない）
 *   FRANK_MAIL_FROM   … 送信元。例: "FRANK GOLF <info@frankgolf.jp>"
 *                       ※ Resendで frankgolf.jp のドメイン認証が必要（OPERATIONS 参照）
 *
 * 送信失敗で予約処理を落とさない（メールは控え。予約の成立が優先）。
 */

const FROM_DEFAULT = "FRANK GOLF <info@frankgolf.jp>";

/**
 * 送信結果。id は Resend のメッセージID（#188）。
 * 「送ったのに届いていない」の相談は、このIDで Resend のログを引けば
 * delivered / bounced / complained のどれなのかが一発で分かる。
 * IDを持ち帰らないと、毎回メールアドレスと時刻で探すことになる。
 */
export type MailResult = { ok: boolean; skipped?: boolean; error?: string; id?: string };
/** Resend の添付（content は base64 文字列）#129 */
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
 * 前日リマインダーの一括送信（日次cronから呼ぶ）。
 * 対象: 明日の 体験（mbr_trial_requests・メールあり）＋ 会員の打席予約（frunk_bookings・メールあり）。
 * 戻り値は送信件数（cronのログ用）。
 */
export async function runFrankReminders(): Promise<{ trial: number; booking: number; skipped: boolean }> {
  if (!process.env.RESEND_API_KEY) return { trial: 0, booking: 0, skipped: true };
  const admin = createAdmin();
  const tomorrow = new Date(Date.now() + 9 * 3600_000 + 86400_000).toISOString().slice(0, 10);
  let trial = 0;
  let booking = 0;

  const { data: trials } = await admin
    .from("mbr_trial_requests")
    .select("name, email, booked_date, start_time, end_time, cancel_token")
    .eq("store_id", FRANK_STORE_ID)
    .eq("status", "confirmed")
    .eq("booked_date", tomorrow)
    .not("email", "is", null)
    .is("deleted_at", null);
  for (const t of trials ?? []) {
    const m = buildReminderMail({
      name: String(t.name),
      kind: "体験レッスン",
      date: tomorrow,
      start: String(t.start_time ?? "").slice(0, 5),
      end: String(t.end_time ?? "").slice(0, 5),
      cancelUrl: t.cancel_token ? trialCancelUrl(String(t.cancel_token)) : undefined,
    });
    const r = await sendFrankMail({ to: String(t.email), ...m });
    if (r.ok) trial += 1;
  }

  const { data: bookings } = await admin
    .from("frunk_bookings")
    .select("booked_date, start_time, end_time, customer_kind, frunk_members(name, email)")
    .eq("store_id", FRANK_STORE_ID)
    .eq("customer_kind", "member")
    .eq("booked_date", tomorrow)
    .neq("status", "cancelled")
    .is("deleted_at", null);
  for (const b of bookings ?? []) {
    const member = (b as unknown as { frunk_members: { name?: string; email?: string } | null }).frunk_members;
    if (!member?.email) continue;
    const m = buildReminderMail({
      name: String(member.name ?? ""),
      kind: "打席のご予約",
      date: tomorrow,
      start: String(b.start_time ?? "").slice(0, 5),
      end: String(b.end_time ?? "").slice(0, 5),
    });
    const r = await sendFrankMail({ to: String(member.email), ...m });
    if (r.ok) booking += 1;
  }

  return { trial, booking, skipped: false };
}
