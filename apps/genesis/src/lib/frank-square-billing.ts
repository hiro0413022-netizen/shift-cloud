import "server-only";
import { randomUUID } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { authMember, type MemberAuth } from "@/lib/frank-booking";
import { monthlyFeeTaxIncluded, toE164Jp, JOIN_CHECKOUT_NOTE_PREFIX } from "@/lib/frank-pos-pure";
import { joinInitialTotal } from "@/lib/frank-join-pure";
import { jstYmd } from "@/lib/jst";
import { BILLING_DAY, resolveBillingStartDate, usageStartSchedule } from "@yozan/core/frank-billing-start";
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

/**
 * 決済リンクを作る。**お客様の連絡先が原因でリンク作成ごと失敗させない**（#208）。
 *
 * pre_populated_data（決済画面にメール・電話を入れておくだけの親切機能）は、
 * Square 側で厳しく検証される。2026-09-03、携帯なのに10桁の電話番号で申し込まれた入会が
 * "Invalid phone number." で弾かれ、**お客様が決済ページに一度も行けないまま
 * 「承認待ち」画面に落ちた**。入力の打ち間違いで決済が止まるのは割に合わない。
 *
 * そこで、prefill が原因と分かる失敗だけ、prefill を外してもう一度だけ作り直す。
 * （400 は注文が作られないので、作り直しても二重注文にはならない。
 *   それ以外のエラーは握りつぶさずそのまま投げる＝原因が見えなくなるのを防ぐ）
 */
async function createPaymentLink(
  token: string,
  body: Record<string, unknown>,
  prePopulated: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const hasPrefill = Object.keys(prePopulated).length > 0;
  try {
    return await squarePost(token, "/online-checkout/payment-links", {
      ...body,
      ...(hasPrefill ? { pre_populated_data: prePopulated } : {}),
    });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).toLowerCase();
    const prefillFault = /phone|email|address/.test(msg);
    if (!hasPrefill || !prefillFault) throw e;
    console.warn("[frank-square-billing] prefill rejected, retrying without it:", msg);
    return await squarePost(token, "/online-checkout/payment-links", {
      ...body,
      idempotency_key: randomUUID(),
    });
  }
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
    .select("id, name, email, phone, status, billing_status, joining_fee_waived, start_date, frunk_plans(name, monthly_price, joining_fee, square_variation_id)")
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
  // 決済リンクで作られるサブスクは、入金Webhookが「10日払い」のサブスクに作り直す（#235・lib/frank-billing-day.ts）。
  // 決済リンク側の金額（price_override）は作り直しで解約されるので、以後の請求には使われない。
  const applyDateYmd = jstYmd();
  const est = joinInitialTotal({
    monthlyExTax: priceExTax,
    joiningFeeExTax: Number(plan.joining_fee ?? 0),
    applyDateYmd,
    joiningFeeWaived: !!row.joining_fee_waived,
  });
  const amount = est.total;
  // ご利用開始日（#234）。金額は変わらない（前取り月数は同じ）が、無料月と最初の10日の引き落とし（#235）が変わる。
  // ⚠ usageStartYmd は「この入会は開始月無料で決済した」という控え。10日払いへの作り直しはこれだけを見る
  const schedule = usageStartSchedule({
    applyDateYmd,
    usageStartYmd: row.start_date ? String(row.start_date) : null,
    prepaidMonths: est.prepaidMonths,
  });
  try {
    // 電話番号は「国内番号として成り立つとき」だけ渡す（@yozan/core/jp-phone が判定・#208）
    const phone = toE164Jp(row.phone ? String(row.phone) : null);
    const json = await createPaymentLink(
      token,
      {
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
        payment_note: `${JOIN_CHECKOUT_NOTE_PREFIX} ${String(row.name ?? "")}`,
      },
      {
        ...(row.email ? { buyer_email: String(row.email) } : {}),
        ...(phone ? { buyer_phone_number: phone } : {}),
      },
    );
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
      usageStartYmd: schedule.usageStartYmd,
      deferredMonths: schedule.deferredMonths,
      nextBillingYmd: schedule.nextBillingYmd,
    });
    return { ok: true, url: String(link.url) };
  } catch (e) {
    console.error("[frank-square-billing] join checkout failed:", e);
    // 理由をそのまま返す。呼び出し元（member-os）が events に残し、
    // スタッフが「決済ページに行けなかった申込」に気づけるようにするため（#208）
    const detail = String(e instanceof Error ? e.message : e).slice(0, 160);
    return { ok: false, error: `checkout_failed: ${detail}` };
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
    const json = await createPaymentLink(
      token,
      {
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
        payment_note: `FRANK月会費 ${String(member.member_no ?? "")}`,
      },
      {
        ...(row.email ? { buyer_email: String(row.email) } : {}),
        ...(phone ? { buyer_phone_number: phone } : {}),
      },
    );
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

/**
 * 保存カードから月会費の自動課金だけを立てる（#233・2026-09-10）
 *
 * 発端: 中尾様（FR0047）— 入会の決済でカード会社の3Dセキュア（ワンタイムパスワード）が
 * もう使っていないメールアドレスに送られて受信できず、決済リンクを完走できなかった。
 * 店側で Square の顧客にカードを保存し、前取り分は「一回きりの決済」で受領したので、
 * **入金は済み・会員にもなっている・サブスクだけ無い** 状態が残った。
 *
 * この状態は既存の導線では救えない:
 *   - 会員カードの【💳 このiPadで決済ページを開く】(#217) は billing_status='active' には出さない
 *     （出すと二重契約になる）
 *   - Square ダッシュボードからも作れない。プランは scripts/frank-square-setup.mjs が API で
 *     作っているため「サードパーティを介して作成されたプラン」扱いになり、
 *     ダッシュボードのサブスク作成でプランが選べない（2026-09-10 実機で確認）
 * ＝ **API から作るしかない**。その入口がここ。
 *
 * やること:
 *   1. 顧客に保存されているカードを1枚選ぶ（無ければ何もしない）
 *   2. 「10日払いで作った」印を先に立てる ★
 *   3. POST /v2/subscriptions（開始日 = 次に引き落とす10日・請求日10日）
 *   4. 会員行にサブスクIDを控える
 *
 * ★ 2 が肝。subscription.created の Webhook は「10日払いへの作り直し」（frank-billing-day.ts）を呼ぶ。
 *   印が無いと、スタッフが選んだ開始日のサブスクを解約して別の日で作り直してしまう。
 */
export async function startSubscriptionOnFile(
  memberId: string,
  requestedStartYmd?: string | null,
): Promise<
  | { ok: true; subscriptionId: string; startDate: string; planName: string; monthlyTaxIncluded: number }
  | { ok: false; error: string; suggested?: string }
> {
  const token = accessToken();
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!token || !locationId) return { ok: false, error: "square_env_missing" };

  const admin = createAdmin();
  const { data: row } = await admin
    .from("frunk_members")
    .select(
      "id, name, member_no, status, join_date, start_date, square_customer_id, square_subscription_id, square_checkout_breakdown, prepay_pause_done_at, frunk_plans(name, monthly_price, square_variation_id, square_variation_nofee_id)",
    )
    .eq("id", memberId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { ok: false, error: "member_not_found" };
  if (!["pending", "active"].includes(String(row.status))) return { ok: false, error: "invalid_status" };
  if (row.square_subscription_id) return { ok: false, error: "already_subscribed" };

  const customerId = row.square_customer_id ? String(row.square_customer_id) : null;
  if (!customerId) return { ok: false, error: "no_customer" };

  const plan = (row as unknown as {
    frunk_plans: {
      name: string;
      monthly_price: number | null;
      square_variation_id: string | null;
      square_variation_nofee_id: string | null;
    } | null;
  }).frunk_plans;
  const priceExTax = Number(plan?.monthly_price ?? 0);
  if (!plan || priceExTax <= 0) return { ok: false, error: "plan_free" };
  // 入会金なしバリエーションを優先する（入会金は入会時に精算済み＝二重請求しない）
  const variationId = plan.square_variation_nofee_id ?? plan.square_variation_id;
  if (!variationId) return { ok: false, error: "plan_no_variation" };

  const breakdown = (row.square_checkout_breakdown ?? {}) as { prepaidMonths?: number; usageStartYmd?: string };
  // 既定の開始日＝前取りの次の月の分を引き落とす10日（#235）。ご利用開始月は内訳の控えだけを見る（#234）
  const resolved = resolveBillingStartDate({
    startDateYmd: String(row.join_date ?? row.start_date ?? jstYmd()),
    usageStartYmd: breakdown.usageStartYmd ?? null,
    prepaidMonths: Number(breakdown.prepaidMonths ?? 0),
    todayYmd: jstYmd(),
    requestedYmd: requestedStartYmd ?? null,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error, suggested: resolved.suggested };

  try {
    // 1. 保存カード
    const cardsRes = await fetch(`${SQUARE_API}/cards?customer_id=${encodeURIComponent(customerId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cardsJson = (await cardsRes.json().catch(() => ({}))) as { cards?: Array<{ id?: string; enabled?: boolean }> };
    const card = (cardsJson.cards ?? []).find((c) => c.enabled !== false);
    if (!card?.id) return { ok: false, error: "no_card" };

    // 2. ★ Square に投げる前に「10日払いで作った」印を立てる（#235）
    //    subscription.created の Webhook が先に届くと、作り直し（lib/frank-billing-day.ts）が
    //    スタッフの選んだ開始日を無視して作り直してしまう。作成に失敗したら下で戻す
    const claimCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: claimed } = await admin
      .from("frunk_members")
      .update({
        prepay_pause_done_at: row.prepay_pause_done_at ?? new Date().toISOString(),
        billing_rebased_at: new Date().toISOString(),
        billing_rebase_claimed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", memberId)
      .or(`billing_rebase_claimed_at.is.null,billing_rebase_claimed_at.lt.${claimCutoff}`)
      .select("id");
    // 作り直しが走っている最中なら触らない（数分おいてもう一度）
    if (!claimed || claimed.length === 0) return { ok: false, error: "busy" };

    // 3. サブスク作成
    const json = await squarePost(token, "/subscriptions", {
      idempotency_key: randomUUID(),
      location_id: locationId,
      plan_variation_id: variationId,
      customer_id: customerId,
      card_id: card.id,
      start_date: resolved.date,
      // 毎月10日に翌月分（#235）。開始日も必ず10日（resolveBillingStartDate が10日以外を弾く）
      monthly_billing_anchor_date: BILLING_DAY,
      timezone: "Asia/Tokyo",
      source: { name: "FRANK GOLF member-os" },
    });
    const sub = (json.subscription as { id?: string } | undefined) ?? undefined;
    if (!sub?.id) throw new Error("subscription missing id");

    // 4. 会員行に控える（Webhook より先にここで確定させる＝画面がすぐ「稼働中」になる）
    await admin
      .from("frunk_members")
      .update({
        square_subscription_id: sub.id,
        billing_status: "active",
        billing_day: BILLING_DAY,
        billing_rebase_claimed_at: null,
        billing_rebase_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", memberId);

    return {
      ok: true,
      subscriptionId: sub.id,
      startDate: resolved.date,
      planName: String(plan.name ?? ""),
      monthlyTaxIncluded: monthlyFeeTaxIncluded(priceExTax),
    };
  } catch (e) {
    console.error("[frank-square-billing] start subscription failed:", e);
    // 作れなかった＝印を戻す（次に押したとき・Webhook がまた動けるように）
    await admin
      .from("frunk_members")
      .update({ billing_rebased_at: null, billing_rebase_claimed_at: null })
      .eq("id", memberId)
      .is("square_subscription_id", null);
    const detail = String(e instanceof Error ? e.message : e).slice(0, 160);
    return { ok: false, error: `subscription_failed: ${detail}` };
  }
}
