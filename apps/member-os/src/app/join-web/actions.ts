"use server";

import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { resolveHimeji } from "@/lib/member";
import { logEvent } from "@/lib/kernel";
import { sendFrankMail, buildWebSignupReceiptMail } from "@/lib/frank-mail";
import { validCoupon, normalizeCoupon } from "@/lib/frank-billing-pure";
import { joinAddress } from "@/lib/address";
import { readName } from "@/lib/name";

export type WebSignupState = { ok?: boolean; error?: string };

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
const GENDERS = ["male", "female", "other", "unknown"];

const MEMBER_OS_URL = process.env.NEXT_PUBLIC_MEMBER_OS_URL || "https://member-os-tau.vercel.app";
const GENESIS_URL = process.env.GENESIS_URL || "https://yozan-genesis.vercel.app";

/**
 * FRANK GOLF 姫路 Web入会（即決済・#129。旧「申込→スタッフ承認」フローを置き換え）
 *
 * 流れ: 規約全文の表示＋同意＋電子サイン → status='pending' で登録
 *   → Square決済リンク（月会費サブスク）へリダイレクト
 *   → 初回決済のWebhook（genesis frank-pos.ts）が 会員番号発行・active化・入会金課金・
 *     控えPDFメール・レッスンカルテ作成 まで自動で行う。スタッフ承認は挟まない。
 *
 * Square env が無い環境（プレビュー等）では従来どおり承認待ち（pending）で受け付ける。
 */
export async function submitWebSignup(_prev: WebSignupState, formData: FormData): Promise<WebSignupState> {
  const store = await resolveHimeji();
  if (!store) return { error: "店舗情報が見つかりません。時間をおいて再度お試しください。" };

  const { name, nameKana } = readName(formData);
  if (!name) return { error: "お名前（姓・名）を入力してください" };
  if (!str(formData.get("plan_id"))) return { error: "ご希望のプランをお選びください" };
  const phone = str(formData.get("phone"));
  const email = str(formData.get("email"));
  if (!email) return { error: "メールアドレスをご入力ください（入会の控えとご案内をお送りします）" };
  if (!phone) return { error: "電話番号をご入力ください（会員ページのログインに下4桁を使用します）" };
  if (str(formData.get("consent_privacy")) !== "1") return { error: "個人情報の取扱いへの同意が必要です" };
  if (str(formData.get("consent_terms")) !== "1")
    return { error: "会員規約（休会・退会規定を含む）への同意が必要です" };
  const signature = str(formData.get("signature"));
  if (!signature.startsWith("data:image/")) return { error: "ご署名（電子サイン）をお願いします" };

  // 入会金無料クーポン（#124）。入力があるのに無効なら申込を止めて教える
  const couponInput = str(formData.get("coupon"));
  const coupon = validCoupon(couponInput);
  if (couponInput && !coupon) {
    return { error: `クーポンコード「${normalizeCoupon(couponInput)}」は無効です。綴りをご確認いただくか、空欄のまま送信してください。` };
  }

  const admin = createAdmin();

  const { data: plan } = await admin
    .from("frunk_plans")
    .select("id, name")
    .eq("id", str(formData.get("plan_id")))
    .eq("company_id", store.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!plan) return { error: "選択されたプランが無効です。画面を更新して再度お試しください。" };

  const values = {
    company_id: store.companyId,
    store_id: store.storeId,
    plan_id: plan.id,
    name,
    name_kana: nameKana,
    birth_date: orNull(formData.get("birth_date")),
    gender: GENDERS.includes(str(formData.get("gender"))) ? str(formData.get("gender")) : null,
    postal_code: orNull(formData.get("postal_code")),
    address1: joinAddress(
      formData.get("prefecture") as string | null,
      (formData.get("address1") as string | null) ?? (formData.get("address") as string | null),
      formData.get("building") as string | null
    ),
    phone,
    email,
    payment_method: "credit",
    start_date: orNull(formData.get("start_date")),
    consent_privacy: true,
    consent_terms: true,
    signature,
    joining_fee_coupon: coupon,
    joining_fee_waived: !!coupon,
    note: coupon ? `Web入会（即決済）クーポン適用: ${coupon}` : "Web入会（即決済）",
    status: "pending" as const,
  };

  // 決済未完了の申込が残っていれば行を使い回す（同じ人が2行にならないように）
  let memberId: string | null = null;
  {
    const { data: existing } = await admin
      .from("frunk_members")
      .select("id")
      .eq("company_id", store.companyId)
      .eq("status", "pending")
      .eq("phone", phone)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      const { error } = await admin
        .from("frunk_members")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) return { error: `送信に失敗しました: ${error.message}` };
      memberId = existing.id;
    }
  }
  if (!memberId) {
    const { data: inserted, error } = await admin.from("frunk_members").insert(values).select("id").single();
    if (error || !inserted) return { error: `送信に失敗しました: ${error?.message ?? "unknown"}` };
    memberId = inserted.id;
  }

  await logEvent(store.companyId, {
    event_type: "frunk.signup",
    title: `Web入会（即決済）: ${name} 様`,
    source: "web",
    source_type: "external",
    severity: "info",
  });

  // Square決済リンクを genesis 経由で発行（Square env は yozan-genesis のみに設定）
  let checkoutUrl: string | null = null;
  try {
    const res = await fetch(`${GENESIS_URL}/api/public/frank/join-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        member_id: memberId,
        redirect_url: `${MEMBER_OS_URL}/join-web/complete?sid=${memberId}`,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
    if (json.ok && json.url) checkoutUrl = json.url;
    else console.error("[join-web] checkout link failed:", json.error);
  } catch (e) {
    console.error("[join-web] checkout link failed:", e);
  }

  if (!checkoutUrl) {
    // Square未設定・失敗時のフォールバック: 従来の承認待ちフロー（申込は成立させる）
    const mail = buildWebSignupReceiptMail({ name, planName: plan.name ?? null });
    await sendFrankMail({ to: email, subject: mail.subject, text: mail.text });
    return { ok: true };
  }

  redirect(checkoutUrl);
}

/** 完了画面のポーリング用: 決済（Webhook処理）が終わったかを見る */
export async function checkJoinStatus(sid: string): Promise<{
  status: "invalid" | "waiting" | "done";
  memberNo?: string;
  name?: string;
}> {
  if (!/^[0-9a-f-]{36}$/i.test(sid)) return { status: "invalid" };
  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_members")
    .select("status, member_no, name")
    .eq("id", sid)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { status: "invalid" };
  if (data.status === "active" && data.member_no) {
    return { status: "done", memberNo: String(data.member_no), name: String(data.name) };
  }
  return { status: "waiting", name: String(data.name ?? "") };
}
