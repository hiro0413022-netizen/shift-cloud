"use server";

import { headers } from "next/headers";
import { createAdmin } from "@/lib/db";
import { checkFormStamp, hashIp } from "@/lib/auth";
import { normalizeInquiry, type InquiryInput } from "@/lib/inquiry";

// ============================================================
// お問い合わせフォーム（控え）の送信（#235→#236）。
// ⚠ "use server" ファイルは async 関数しか export しない（同期exportでVercelビルドがERRORになる実例あり）。
//
// #236 で**メールは一切送らない**: 外部の送信サービス（Resend）の無料枠は全社共通で、
// プロのお問い合わせが増えるほど FRANK の予約確認・入会完了メールの枠を食う。
// ここは「メールアプリが開かない方」の控えなので、台帳に残してプロが管理画面で見る。
// ============================================================

export type ContactState = {
  ok: boolean;
  error: string | null;
  values: InquiryInput;
  /** フォームを作り直すための通し番号（React19のフォームリセットで入力が消えないように） */
  seq: number;
};

function s(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "");
}

export async function submitContactAction(prev: ContactState, fd: FormData): Promise<ContactState> {
  const seq = prev.seq + 1;
  const slug = s(fd, "slug");
  const { values, error } = normalizeInquiry({
    kind: s(fd, "kind"),
    name: s(fd, "name"),
    company: s(fd, "company"),
    email: s(fd, "email"),
    phone: s(fd, "phone"),
    message: s(fd, "message"),
  });
  const fail = (msg: string): ContactState => ({ ok: false, error: msg, values, seq });

  const admin = createAdmin();
  const { data: pro } = await admin
    .from("pgw_pros")
    .select("id, contact_email, contact_line_url, contact_phone, contact_ig_dm")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  // 窓口を1つも出していないプロは、フォームも受け付けない（届け先が無い）
  const open = Boolean(pro && (pro.contact_email || pro.contact_line_url || pro.contact_phone || pro.contact_ig_dm));
  if (!pro || !open) return fail("現在、お問い合わせの受け付けを停止しています。");

  // ハニーポット（人には見えない欄）が埋まっていたら機械。成功したふりをして何も残さない
  if (s(fd, "website").trim()) return { ok: true, error: null, values, seq };

  if (error) return fail(error);
  if (s(fd, "agree") !== "on") return fail("個人情報の取り扱いへの同意にチェックを入れてください。");

  const stamp = checkFormStamp(s(fd, "stamp"), pro.id);
  if (stamp === "invalid") return fail("ページの有効期限が切れました。お手数ですがページを再読み込みしてから送信してください。");
  if (stamp === "tooFast") return fail("送信が早すぎます。内容をご確認のうえ、もう一度「送信する」を押してください。");

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const ipHash = hashIp(ip);

  // 連投制限: 同じ回線から10分に3件・1日10件まで
  const since10m = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const since1d = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count: c10 }, { count: c1d }] = await Promise.all([
    admin.from("pgw_inquiries").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since10m),
    admin.from("pgw_inquiries").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", since1d),
  ]);
  if ((c10 ?? 0) >= 3 || (c1d ?? 0) >= 10) {
    return fail("短時間に続けて送信されています。しばらく時間をおいてからお試しください。");
  }

  const { error: insErr } = await admin.from("pgw_inquiries").insert({
    pro_id: pro.id,
    kind: values.kind,
    name: values.name,
    company: values.company || null,
    email: values.email,
    phone: values.phone || null,
    message: values.message,
    // メールは送らない運用（#236）。状態の列は「送っていない」と分かる値で埋めておく
    mail_status: "skipped",
    mail_error: "メール送信は使わない運用（#236）",
    ip_hash: ipHash,
    user_agent: (h.get("user-agent") ?? "").slice(0, 300) || null,
  });
  if (insErr) {
    console.error("[pro-site inquiry] 保存失敗:", insErr);
    return fail("送信に失敗しました。時間をおいてもう一度お試しください。");
  }

  return { ok: true, error: null, values: { kind: "", name: "", company: "", email: "", phone: "", message: "" }, seq };
}
