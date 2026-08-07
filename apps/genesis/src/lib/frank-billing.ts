import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import { verifyMember } from "@/lib/frank-booking";
import { exTax } from "@/lib/frank-pos-pure";

/**
 * FRANK GOLF 月会費の継続課金（Stripe）#97 / migration 0087
 *
 * - 会員はサイト booking.html の「カードで継続課金を登録する」から
 *   Stripe Checkout(mode=subscription) へ。月会費（税抜×1.1=税込）を毎月自動課金。
 * - Stripe SDK は使わず fetch で REST を直接叩く（依存を増やさない）。
 * - 必要な環境変数（Vercel: yozan-genesis）:
 *     STRIPE_SECRET_KEY      sk_live_... / sk_test_...
 *     STRIPE_WEBHOOK_SECRET  whsec_...（/api/public/frank/billing/webhook 用）
 *   未設定の間はお客様に「店頭で手続き」を案内するだけで、エラーにはしない。
 * - 状態は frunk_members.billing_status（none/checkout/active/past_due/canceled）。
 * - モニター会員など月会費0円のプランは登録不要（弾く）。
 */

const STRIPE_API = "https://api.stripe.com/v1";
const SITE = "https://frankgolf.jp";
const TAX_RATE = 0.1;

type Admin = ReturnType<typeof createAdmin>;

function secretKey(): string | null {
  const k = process.env.STRIPE_SECRET_KEY;
  return k && k.startsWith("sk_") ? k : null;
}

async function stripePost(key: string, path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message ?? `Stripe API error (${res.status})`;
    throw new Error(err);
  }
  return json;
}

/** 会員認証→Stripe Checkout(subscription) のURLを返す */
export async function createBillingCheckout(
  memberNo: string,
  phoneLast4: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = createAdmin();
  const member = await verifyMember(admin, memberNo, phoneLast4);
  if (!member) return { ok: false, error: "会員番号または電話番号下4桁が一致しません（入会承認前はご登録いただけません）" };

  const key = secretKey();
  if (!key) return { ok: false, error: "カード払いの受付準備中です。恐れ入りますが店頭でお手続きください。" };

  // プラン・連絡先（verifyMember の select には無い列を取り直す）
  const { data: row } = await admin
    .from("frunk_members")
    .select("id, email, phone, stripe_customer_id, billing_status, frunk_plans(name, monthly_price)")
    .eq("id", member.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "会員情報を取得できませんでした" };
  const plan = (row as unknown as { frunk_plans: { name: string; monthly_price: number | null } | null }).frunk_plans;
  const priceExTax = Number(plan?.monthly_price ?? 0);
  if (!plan || priceExTax <= 0) return { ok: false, error: "このプランは月会費のお支払い登録が不要です（月会費0円）" };
  if (String(row.billing_status) === "active") return { ok: false, error: "すでにカードのご登録が完了しています（毎月自動でお支払いになります）" };

  const amount = Math.round(priceExTax * (1 + TAX_RATE)); // 税込・円

  try {
    // Stripe顧客（あれば再利用）
    let customerId = row.stripe_customer_id ? String(row.stripe_customer_id) : null;
    if (!customerId) {
      const customer = await stripePost(key, "/customers", {
        name: `${member.name}（${member.member_no}）`,
        ...(row.email ? { email: String(row.email) } : {}),
        ...(row.phone ? { phone: String(row.phone) } : {}),
        "metadata[frunk_member_id]": String(member.id),
        "metadata[member_no]": String(member.member_no ?? ""),
      });
      customerId = String(customer.id);
      await admin.from("frunk_members").update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() }).eq("id", member.id);
    }

    const session = await stripePost(key, "/checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      client_reference_id: String(member.id),
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "jpy",
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": `FRANK GOLF 月会費（${plan.name}・税込）`,
      "subscription_data[metadata][frunk_member_id]": String(member.id),
      "metadata[frunk_member_id]": String(member.id),
      success_url: `${SITE}/booking.html?billing=success`,
      cancel_url: `${SITE}/booking.html?billing=cancel`,
      locale: "ja",
    });

    await admin
      .from("frunk_members")
      .update({ billing_status: "checkout", updated_at: new Date().toISOString() })
      .eq("id", member.id)
      .neq("billing_status", "active");
    return { ok: true, url: String(session.url) };
  } catch (e) {
    console.error("[frank-billing] checkout failed:", e);
    return { ok: false, error: "登録ページの作成に失敗しました。時間をおいてお試しください。" };
  }
}

// ------------------------------------------------------------------
// Webhook
// ------------------------------------------------------------------

/** Stripe-Signature ヘッダの検証（t=..,v1=.. / HMAC-SHA256、許容ずれ5分） */
export function verifyStripeSignature(payload: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false;
  const parts = new Map(sigHeader.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function memberByRef(admin: Admin, memberId: string | null, customerId: string | null) {
  if (memberId) {
    const { data } = await admin.from("frunk_members").select("id, company_id, name, member_no").eq("id", memberId).maybeSingle();
    if (data) return data;
  }
  if (customerId) {
    const { data } = await admin.from("frunk_members").select("id, company_id, name, member_no").eq("stripe_customer_id", customerId).maybeSingle();
    if (data) return data;
  }
  return null;
}

/** 税込→税抜。Checkout作成時の unit_amount = round(税抜×1.1) の逆算（9,800/13,800/19,800円で往復一致・tests/frank-pos.test.tsで固定） */
const monthlyFeeExTax = exTax;

/** 月会費入金を mon_sales（FRANK店舗・姫路セグメント・category=月会費）へ1回だけ記録 */
async function recordMonthlyFeeSale(
  admin: Admin,
  member: { id: unknown; company_id: unknown; name: unknown; member_no: unknown },
  invoiceId: string,
  paidTaxIncluded: number,
): Promise<void> {
  // Webhookは同一イベントが複数回届くことがある＝invoice idで冪等に
  const { data: dup } = await admin.from("mon_sales").select("id").eq("detail->>stripe_invoice_id", invoiceId).limit(1);
  if ((dup ?? []).length > 0) return;

  const companyId = String(member.company_id);
  const { data: store } = await admin.from("stores").select("id").eq("code", "frunk_himeji").maybeSingle();
  const { data: seg } = await admin
    .from("fin_segments")
    .select("id")
    .eq("company_id", companyId)
    .eq("code", "himeji")
    .is("deleted_at", null)
    .maybeSingle();

  const { error } = await admin.from("mon_sales").insert({
    company_id: companyId,
    store_id: store?.id ?? null,
    segment_id: seg?.id ?? null,
    sold_on: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10), // JSTの入金日
    category: "月会費",
    customer_name: String(member.name ?? ""),
    member_kind: "会員",
    amount: monthlyFeeExTax(paidTaxIncluded),
    tax_included: paidTaxIncluded,
    pay_method: "カード",
    memo: `Stripe自動課金（${String(member.member_no ?? "")}）`,
    detail: { stripe_invoice_id: invoiceId, frunk_member_id: String(member.id) },
    entered_by: "Stripe(自動)",
    source: "stripe",
  });
  if (error) throw new Error(`mon_sales insert failed: ${error.message}`);
  await admin.rpc("refresh_money_to_finance", { p_company_id: companyId });
}

/** Webhook本体。ルートは署名検証済みの payload(JSON文字列) を渡す */
export async function handleStripeEvent(payload: string): Promise<void> {
  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
  const admin = createAdmin();
  const obj = event.data.object;

  if (event.type === "checkout.session.completed") {
    const memberId = (obj.client_reference_id as string | null) ?? ((obj.metadata as Record<string, string> | null)?.frunk_member_id ?? null);
    const customerId = (obj.customer as string | null) ?? null;
    const member = await memberByRef(admin, memberId, customerId);
    if (!member) return;
    await admin
      .from("frunk_members")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: (obj.subscription as string | null) ?? null,
        billing_status: "active",
        billing_registered_at: new Date().toISOString(),
        payment_method: "card",
        updated_at: new Date().toISOString(),
      })
      .eq("id", member.id);
    await logEvent(String(member.company_id), {
      event_type: "billing.registered",
      title: `月会費カード登録: ${member.name}様（${member.member_no}）継続課金が有効になりました`.slice(0, 120),
      source: "frank_billing",
      source_type: "system",
    });
    return;
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    // 月会費の入金を Money OS（mon_sales）へ自動計上（#118 / 実行計画§3-2「売上はMoney OSへ自動連携」）
    const invoiceId = String(obj.id ?? "");
    const paid = Number((obj.amount_paid as number | undefined) ?? 0); // 税込・円
    if (!invoiceId || paid <= 0) return;
    const customerId = (obj.customer as string | null) ?? null;
    const member = await memberByRef(admin, null, customerId);
    if (!member) return;
    await recordMonthlyFeeSale(admin, member, invoiceId, paid);
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const customerId = (obj.customer as string | null) ?? null;
    const member = await memberByRef(admin, null, customerId);
    if (!member) return;
    await admin.from("frunk_members").update({ billing_status: "past_due", updated_at: new Date().toISOString() }).eq("id", member.id);
    await logEvent(String(member.company_id), {
      event_type: "billing.payment_failed",
      title: `月会費の支払い失敗: ${member.name}様（${member.member_no}）カード決済に失敗しました`.slice(0, 120),
      source: "frank_billing",
      source_type: "system",
    });
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    const customerId = (obj.customer as string | null) ?? null;
    const member = await memberByRef(admin, null, customerId);
    if (!member) return;
    await admin
      .from("frunk_members")
      .update({ billing_status: "canceled", stripe_subscription_id: null, updated_at: new Date().toISOString() })
      .eq("id", member.id);
    await logEvent(String(member.company_id), {
      event_type: "billing.canceled",
      title: `月会費の継続課金が解約: ${member.name}様（${member.member_no}）`.slice(0, 120),
      source: "frank_billing",
      source_type: "system",
    });
  }
}
