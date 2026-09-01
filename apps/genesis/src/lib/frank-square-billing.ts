import "server-only";
import { randomUUID } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { authMember, type MemberAuth } from "@/lib/frank-booking";
import { monthlyFeeTaxIncluded, toE164Jp, JOIN_CHECKOUT_NOTE_PREFIX } from "@/lib/frank-pos-pure";
import { joinInitialTotal } from "@/lib/frank-join-pure";
import { jstYmd } from "@/lib/jst";
import { FRANK_PORTAL } from "@yozan/core/frank-links";

/**
 * FRANK GOLF 月会費の継続課金（Square）#123 / migration 0105
 *
 * Stripe（#97）から Square へ一本化。理由: 店頭POS・物販・飲食も Square のため
 * 決済を1社にまとめる（入金・手数料・管理画面が1本になる）。
 *
 * 仕組み:
 * - 会員は booking.html の「カードで継続課金を登録する」から
 *   Square Checkout（サブスクプラン決済リンク）へ。初回決済と同時にカードが保存され、
 *   以後毎月自動課金される。
 * - 決済リンクは会員ごとにAPIで発行し、返ってきた order_id を
 *   frunk_members.square_checkout_order_id に控える。これが Webhook で
 *   「どの会員の初回決済か」を特定する唯一の鍵（Squareのリンク決済は
 *   顧客IDを事前に指定できないため、注文IDで結ぶ）。
 * - 入金の記録・会員状態の更新は /api/public/frank/pos/webhook（frank-pos.ts）が行う。
 *   店頭POSと同じエンドポイントで、月会費と店頭売上を自動で振り分ける。
 *
 * 必要な環境変数（Vercel: yozan-genesis）:
 *   SQUARE_ACCESS_TOKEN  … Square Developer の本番アクセストークン
 *   SQUARE_LOCATION_ID   … FRANK GOLF のロケーションID
 * 未設定の間はお客様に「店頭で手続き」を案内するだけで、エラーにはしない（Stripe時代と同じ方針）。
 *
 * プランとの対応: frunk_plans.square_variation_id（scripts/frank-square-setup.mjs が発行・登録）。
 * 設定手順の正典: docs/genesis/OPERATIONS.md §14-1
 */

const SQUARE_API = "https://connect.squareup.com/v2";
// カード登録後の戻り先はお客様の入口＝会員ポータル（#188）
const SITE = FRANK_PORTAL;

/**
 * 決済リンクの order_id を会員に控える（#136）。
 * square_checkout_order_id（最新）に加えて square_checkout_order_ids（履歴）へも追記する。
 * 再送信でリンクを作り直したあと、お客様が古いタブのリンクで支払っても
 * Webhook が履歴側で会員を特定できるようにするため（上書きだけだと迷子の入金になる）。
 */
async function recordCheckoutOrder(
  admin: ReturnType<typeof createAdmin>,
  memberId: string,
  orderId: string,
  breakdown?: Record<string, unknown>,
): Promise<void> {
  const { data: cur } = await admin
    .from("frunk_members")
    .select("square_checkout_order_ids")
    .eq("id", memberId)
    .maybeSingle();
  const history = Array.isArray(cur?.square_checkout_order_ids) ? (cur?.square_checkout_order_ids as unknown[]) : [];
  if (!history.includes(orderId)) history.push(orderId);
  await admin
    .from("frunk_members")
    .update({
      square_checkout_order_id: orderId,
      square_checkout_order_ids: history,
      ...(breakdown ? { square_checkout_breakdown: breakdown } : {}),
      billing_status: "checkout",
      updated_at: new Date().toISOString(),
    })
    .eq("id", memberId)
    .neq("billing_status", "active");
}

function accessToken(): string | null {
  const t = process.env.SQUARE_ACCESS_TOKEN;
  return t && t.trim().length > 10 ? t.trim() : null;
}

async function squarePost(token: string, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${SQUARE_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const errs = (json.errors as Array<{ detail?: string; code?: string }> | undefined) ?? [];
    throw new Error(errs.map((e) => e.detail ?? e.code).join("; ") || `Square API error (${res.status})`);
  }
  return json;
}

/**
 * サブスクを指定周期ぶんスキップ（#131・前取り用）。
 * 入会時に前取りした月数ぶんは自動課金を止める（止めないと二重取りになる）。
 * cycles 経過後は自動で再開される。
 */
export async function pauseSubscriptionCycles(
  subscriptionId: string,
  cycles: number,
): Promise<{ ok: boolean; error?: string }> {
  const token = accessToken();
  if (!token) return { ok: false, error: "square_env_missing" };
  try {
    await squarePost(token, `/subscriptions/${subscriptionId}/pause`, {
      pause_cycle_duration: cycles,
    });
    return { ok: true };
  } catch (e) {
    console.error("[frank-square-billing] pause cycles failed:", e);
    return { ok: false, error: String(e) };
  }
}

/**
 * Square顧客のメールアドレスを取得（#137・Web入会Webhookのフォールバック照合用）。
 * 決済リンク（サブスク付き）の入金 payment は、リンク作成時に控えた order_id と
 * 別の注文IDで届くことがあり、注文IDだけでは会員に結べない（2026-08-15のテスト入会で実証）。
 * pre_populated_data.buyer_email で作られる顧客のメールは申込フォームの値と同一なので、
 * これを第2の鍵にする。
 */
export async function getSquareCustomerEmail(customerId: string): Promise<string | null> {
  const token = accessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${SQUARE_API}/customers/${encodeURIComponent(customerId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json().catch(() => ({}))) as { customer?: { email_address?: string | null } };
    if (!res.ok) return null;
    const email = json.customer?.email_address;
    return email && email.trim() ? email.trim() : null;
  } catch (e) {
    console.error("[frank-square-billing] get customer failed:", e);
    return null;
  }
}

/**
 * 顧客の生きているサブスクを1件返す（#137）。
 * 初回入金の payment Webhook が subscription.created より先に処理を終えると、
 * 「前取り分のスキップ」と「価格上書きの解除」を行う相手（サブスクID）がまだDBに無い。
 * 入金側からも Square に問い合わせて後始末できるようにする。
 */
export async function findSubscriptionForCustomer(
  customerId: string,
): Promise<{ id: string; status: string; version?: number } | null> {
  const token = accessToken();
  if (!token) return null;
  try {
    const json = await squarePost(token, "/subscriptions/search", {
      query: { filter: { customer_ids: [customerId] } },
    });
    const subs =
      (json.subscriptions as Array<{ id?: string; status?: string; version?: number; created_at?: string }> | undefined) ?? [];
    const live = subs.filter((s) => s.id && !["CANCELED", "DEACTIVATED"].includes((s.status ?? "").toUpperCase()));
    live.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    const top = live[0];
    if (!top?.id) return null;
    return {
      id: String(top.id),
      status: String(top.status ?? ""),
      version: typeof top.version === "number" ? top.version : undefined,
    };
  } catch (e) {
    console.error("[frank-square-billing] subscription search failed:", e);
    return null;
  }
}

/**
 * サブスクの価格上書きを消してプラン価格に戻す（#131b）。
 *
 * 入会時は「入会金＋前取り月数分」を1回でお支払いいただくため、決済リンクの金額を
 * プラン月額と変えている。Squareはこの金額をサブスクの price_override_money として
 * 引き継ぐ（＝放置すると毎月その金額を請求してしまう）ので、初回入金を確認したら
 * null にしてプラン価格へ戻す。UpdateSubscription は「null を渡す＝その項目を消す」仕様。
 */
export async function clearSubscriptionPriceOverride(
  subscriptionId: string,
  version?: number,
): Promise<{ ok: boolean; error?: string }> {
  const token = accessToken();
  if (!token) return { ok: false, error: "square_env_missing" };
  try {
    const body: Record<string, unknown> = { price_override_money: null };
    if (typeof version === "number") body.version = version;
    const res = await fetch(`${SQUARE_API}/subscriptions/${subscriptionId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: body }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const errs = (json.errors as Array<{ detail?: string; code?: string }> | undefined) ?? [];
      throw new Error(errs.map((e) => e.detail ?? e.code).join("; ") || `Square PUT /subscriptions (${res.status})`);
    }
    return { ok: true };
  } catch (e) {
    console.error("[frank-square-billing] clear price override failed:", e);
    return { ok: false, error: String(e) };
  }
}

/**
 * Web入会（即決済・#129）用: 会員ID直接指定で決済リンクを作る。
 * /join-web が申込行（status='pending'）を作った直後に呼ぶ。member_no はまだ無い。
 * redirect_url は member-os の完了画面（決済後に会員番号を表示する）。
 */
export async function createJoinCheckoutForMember(
  memberId: string,
  redirectUrl: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = createAdmin();
  const token = accessToken();
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!token || !locationId) return { ok: false, error: "square_env_missing" };

  const { data: row } = await admin
    .from("frunk_members")
    .select("id, name, email, phone, status, billing_status, joining_fee_waived, frunk_plans(name, monthly_price, joining_fee, square_variation_id)")
    .eq("id", memberId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { ok: false, error: "member_not_found" };
  if (!["pending", "active"].includes(String(row.status))) return { ok: false, error: "invalid_status" };
  if (String(row.billing_status) === "active") return { ok: false, error: "already_active" };

  const plan = (row as unknown as {
    frunk_plans: { name: string; monthly_price: number | null; joining_fee: number | null; square_variation_id: string | null } | null;
  }).frunk_plans;
  const priceExTax = Number(plan?.monthly_price ?? 0);
  if (!plan || priceExTax <= 0) return { ok: false, error: "plan_free" };
  const variationId = plan.square_variation_id;
  if (!variationId) return { ok: false, error: "square_env_missing" };

  // 入会時のお支払いは「入会金＋月会費×前取り月数」の1回払い（#131b）。
  // 決済リンクの金額をプラン月額と変えると、Squareはそれをサブスクの price_override_money
  // として引き継ぐため、初回入金のWebhookで必ず null に戻す（frank-pos.ts）。
  const applyDateYmd = jstYmd();
  const est = joinInitialTotal({
    monthlyExTax: priceExTax,
    joiningFeeExTax: Number(plan.joining_fee ?? 0),
    applyDateYmd,
    joiningFeeWaived: !!row.joining_fee_waived,
  });
  const amount = est.total;
  try {
    const phone = toE164Jp(row.phone ? String(row.phone) : null);
    const json = await squarePost(token, "/online-checkout/payment-links", {
      idempotency_key: randomUUID(),
      quick_pay: {
        name: `FRANK GOLF ご入会（${plan.name}）初回一括・税込`,
        price_money: { amount, currency: "JPY" },
        location_id: locationId,
      },
      checkout_options: {
        subscription_plan_id: variationId,
        redirect_url: redirectUrl,
        ask_for_shipping_address: false,
      },
      pre_populated_data: {
        ...(row.email ? { buyer_email: String(row.email) } : {}),
        ...(phone ? { buyer_phone_number: phone } : {}),
      },
      payment_note: `${JOIN_CHECKOUT_NOTE_PREFIX} ${String(row.name ?? "")}`,
    });
    const link = json.payment_link as { url?: string; order_id?: string } | undefined;
    if (!link?.url || !link.order_id) throw new Error("payment_link missing url/order_id");

    // 内訳も一緒に保存: Webhook・控えPDFは「入金日で再計算」せずこれを正とする（#136）
    await recordCheckoutOrder(admin, memberId, link.order_id, {
      total: est.total,
      joiningFee: est.joiningFee,
      monthly: est.monthly,
      prepaidMonths: est.prepaidMonths,
      campaign: est.campaign,
      applyDateYmd,
    });
    return { ok: true, url: String(link.url) };
  } catch (e) {
    console.error("[frank-square-billing] join checkout failed:", e);
    return { ok: false, error: "checkout_failed" };
  }
}

/** 会員認証→Squareサブスク決済リンクのURLを返す（Stripe版 createBillingCheckout の置き換え） */
export async function createSquareBillingCheckout(
  auth: MemberAuth,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = createAdmin();
  // 会員ポータルから来たお客様は署名付きトークンを持っている（#152）。
  // 予約と同じ入口で認証し、カード登録のためだけに会員番号を打ち直させない。
  const member = await authMember(admin, auth);
  if (!member) return { ok: false, error: "会員番号または電話番号下4桁が一致しません（入会承認前はご登録いただけません）" };

  const token = accessToken();
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!token || !locationId) return { ok: false, error: "カード払いの受付準備中です。恐れ入りますが店頭でお手続きください。" };

  const { data: row } = await admin
    .from("frunk_members")
    .select("id, email, phone, billing_status, frunk_plans(name, monthly_price, square_variation_id)")
    .eq("id", member.id)
    .maybeSingle();
  if (!row) return { ok: false, error: "会員情報を取得できませんでした" };
  const plan = (row as unknown as {
    frunk_plans: { name: string; monthly_price: number | null; square_variation_id: string | null } | null;
  }).frunk_plans;
  const priceExTax = Number(plan?.monthly_price ?? 0);
  if (!plan || priceExTax <= 0) return { ok: false, error: "このプランは月会費のお支払い登録が不要です（月会費0円）" };
  if (String(row.billing_status) === "active") return { ok: false, error: "すでにカードのご登録が完了しています（毎月自動でお支払いになります）" };

  // 入会金（#124）は決済リンクに乗せない。
  // Squareの決済リンクは「有料フェーズ1つ」のバリエーションしか受け付けないため、
  // 初回だけ金額を変えるプランが組めない。入会金11,000円（税込）は、初回決済のWebhookが
  // 保存されたカードへ続けて自動請求する（frank-pos.ts・クーポン適用会員は請求しない）。
  const variationId = plan.square_variation_id;
  if (!variationId) return { ok: false, error: "カード払いの受付準備中です。恐れ入りますが店頭でお手続きください。" };

  const amount = monthlyFeeTaxIncluded(priceExTax); // 月会費（税込・円）＝バリエーション価格と一致

  try {
    const phone = toE164Jp(row.phone ? String(row.phone) : null);
    const json = await squarePost(token, "/online-checkout/payment-links", {
      idempotency_key: randomUUID(),
      quick_pay: {
        name: `FRANK GOLF 月会費（${plan.name}・税込）`,
        price_money: { amount, currency: "JPY" },
        location_id: locationId,
      },
      checkout_options: {
        subscription_plan_id: variationId,
        redirect_url: `${SITE}/member/settings?billing=success`,
        ask_for_shipping_address: false,
      },
      pre_populated_data: {
        ...(row.email ? { buyer_email: String(row.email) } : {}),
        ...(phone ? { buyer_phone_number: phone } : {}),
      },
      payment_note: `FRANK月会費 ${String(member.member_no ?? "")}`,
    });
    const link = json.payment_link as { url?: string; order_id?: string } | undefined;
    if (!link?.url || !link.order_id) throw new Error("payment_link missing url/order_id");

    // 注文IDを控える＝Webhookで初回決済を会員に結ぶ鍵。billing_statusはWebhookでactiveへ。
    await recordCheckoutOrder(admin, String(member.id), link.order_id);
    return { ok: true, url: String(link.url) };
  } catch (e) {
    console.error("[frank-square-billing] checkout failed:", e);
    return { ok: false, error: "登録ページの作成に失敗しました。時間をおいてお試しください。" };
  }
}

/**
 * 保存カードへの即時課金（#124・入会金用）。
 * Webhookが初回の月会費入金を確認した直後に呼ぶ。noteの先頭は必ず "FRANK入会金" にする
 * （Webhookがこのnoteで「入会金の入金」と判定して mon_sales の category=入会金 に記録するため）。
 */
export async function chargeCardOnFile(input: {
  customerId: string;
  amountTaxIncluded: number;
  note: string;
}): Promise<{ ok: boolean; error?: string }> {
  const token = accessToken();
  if (!token) return { ok: false, error: "no_token" };
  try {
    const res = await fetch(`${SQUARE_API}/cards?customer_id=${encodeURIComponent(input.customerId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { cards?: Array<{ id?: string; enabled?: boolean }> };
    const card = (json.cards ?? []).find((c) => c.enabled !== false);
    if (!card?.id) return { ok: false, error: "no_card" };
    await squarePost(token, "/payments", {
      idempotency_key: randomUUID(),
      source_id: card.id,
      customer_id: input.customerId,
      amount_money: { amount: input.amountTaxIncluded, currency: "JPY" },
      note: input.note,
    });
    return { ok: true };
  } catch (e) {
    console.error("[frank-square-billing] charge failed:", e);
    return { ok: false, error: String(e) };
  }
}
