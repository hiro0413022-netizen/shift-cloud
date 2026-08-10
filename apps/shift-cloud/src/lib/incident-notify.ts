import { createAdmin } from "@/lib/supabase/admin";
import { incidentCategoryLabel } from "@yozan/core/incidents";

/**
 * 重大イレギュラー報告の即時LINE通知（DECISIONS #125）
 *
 * 宛先は gn_line_contacts の person_name='古川博庸'（0107でシード済み）。
 * 本人がYOZAN公式LINEへ1回話しかけると webhook が line_user_id を埋める仕組み（0103）なので、
 * それまでは送れない。**送れなかったことを黙って捨てず reason を返して画面に出す**
 * ＝「送ったつもりで届いていない」を作らない（[[line-reply-pipeline]] の再発防止）。
 *
 * トークンは gn_line_channels（service_role専用）にのみ存在する。コードに書かない。
 */
export async function notifySevereIncident(
  incidentId: string,
  companyId: string
): Promise<{ sent: boolean; reason?: string }> {
  const admin = createAdmin();

  const { data: inc } = await admin
    .from("sp_incidents")
    .select("id, category, severity, occurred_at, place, involved, body, action_taken, notified_at, store_id, staff:staff_id(name), stores:store_id(name)")
    .eq("id", incidentId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!inc) return { sent: false, reason: "報告が見つかりません" };
  if (inc.notified_at) return { sent: false, reason: "通知済み" };

  const { data: channel } = await admin
    .from("gn_line_channels")
    .select("access_token")
    .eq("company_id", companyId)
    .eq("code", "staff")
    .eq("enabled", true)
    .maybeSingle();
  if (!channel?.access_token) return { sent: false, reason: "スタッフ用LINEチャネルが未設定" };

  const { data: contact } = await admin
    .from("gn_line_contacts")
    .select("line_user_id, person_name")
    .eq("company_id", companyId)
    .eq("person_name", "古川博庸")
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact?.line_user_id) {
    return { sent: false, reason: "宛先未リンク（YOZAN公式LINEに一度メッセージを送ると自動で紐づきます）" };
  }

  const staffName = (inc.staff as unknown as { name: string } | null)?.name ?? "不明";
  const storeName = (inc.stores as unknown as { name: string } | null)?.name ?? "店舗未設定";
  const when = new Date(inc.occurred_at).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const text = [
    "【重大】イレギュラー報告",
    `分類: ${incidentCategoryLabel(inc.category)}`,
    `いつ: ${when}`,
    `どこ: ${storeName}${inc.place ? ` / ${inc.place}` : ""}`,
    inc.involved ? `だれ: ${inc.involved}` : null,
    `内容: ${String(inc.body).slice(0, 800)}`,
    inc.action_taken ? `対応: ${String(inc.action_taken).slice(0, 400)}` : null,
    `報告者: ${staffName}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.access_token}` },
      body: JSON.stringify({ to: contact.line_user_id, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { sent: false, reason: `LINE API HTTP ${res.status} ${detail.slice(0, 120)}` };
    }
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "送信に失敗しました" };
  }

  await admin.from("sp_incidents").update({ notified_at: new Date().toISOString() }).eq("id", inc.id);
  return { sent: true };
}
