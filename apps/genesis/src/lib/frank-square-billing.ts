import "server-only";
import { randomUUID } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { verifyMember } from "@/lib/frank-booking";
import { monthlyFeeTaxIncluded, toE164Jp } from "@/lib/frank-pos-pure";

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
const SITE = "https://frankgolf.jp";

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

/** 会員認証→Squareサブスク決済リンクのURLを返す（Stripe版 createBillingCheckout の置き換え） */
export async function createSquareBillingCheckout(
  memberNo: string,
  phoneLast4: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const admin = createAdmin();
  const member = await verifyMember(admin, memberNo, phoneLast4);
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
        redirect_url: `${SITE}/booking.html?billing=success`,
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
    await admin
      .from("frunk_members")
      .update({ square_checkout_order_id: link.order_id, billing_status: "checkout", updated_at: new Date().toISOString() })
      .eq("id", member.id)
      .neq("billing_status", "active");
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
