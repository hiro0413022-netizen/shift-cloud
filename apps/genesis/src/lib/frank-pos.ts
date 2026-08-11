import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import { FRANK_STORE_ID } from "@yozan/core/frank-booking";
import {
  classifySquareMonthlyPayment,
  exTax,
  isJoiningFeeNote,
  mapSquarePayment,
  mapSquareRefund,
  monthlyFeeTaxIncluded,
  verifySquareSignature,
  type SquarePayment,
  type SquareRefund,
} from "@/lib/frank-pos-pure";
import { chargeCardOnFile, pauseSubscriptionCycles, clearSubscriptionPriceOverride } from "@/lib/frank-square-billing";
import { activateWebJoin } from "@/lib/frank-join";
import { JOIN_PREPAID_MONTHS, joinInitialTotal } from "@/lib/frank-join-pure";

export { verifySquareSignature };

/**
 * FRANK GOLF Square連携 #118（店頭POS）＋ #123（月会費もSquareへ一本化）
 *
 * Square で店頭会計（物販・飲食・ビジター・レッスン単発・体験料。現金もレジ打ちすれば同経路）
 * → Webhook → mon_sales（Money OS）へ自動記録 → refresh_money_to_finance で
 * fin_entries／KPI／日次レポートへ既存パイプのまま流れる。
 *
 * #123から月会費も Square（サブスク決済リンク・frank-square-billing.ts）。
 * このWebhookが payment イベントを「月会費」か「店頭売上」かへ自動で振り分ける:
 *   1. payment.order_id が frunk_members.square_checkout_order_id に一致 → 初回の月会費
 *      （会員を active にし、Square顧客IDを控える）
 *   2. payment.customer_id が frunk_members.square_customer_id に一致し、金額がプランの
 *      税込月額と一致 → 継続課金の月会費
 *   3. どちらでもない → 店頭売上（従来どおり）
 * 判定は classifySquareMonthlyPayment（frank-pos-pure.ts・テストで固定）。
 * subscription.created/updated で解約・サブスクIDの追従、payment FAILED で past_due 化も行う。
 *
 * 純粋なマッピング・署名検証は frank-pos-pure.ts（tests/frank-pos.test.ts で固定）。
 *
 * 必要な環境変数（Vercel: yozan-genesis）:
 *   SQUARE_WEBHOOK_SIGNATURE_KEY … Square Developer > Webhooks の署名キー
 *   SQUARE_WEBHOOK_URL           … Webhookに登録したURL（署名の計算に必要）
 *                                  省略時: https://yozan-genesis.vercel.app/api/public/frank/pos/webhook
 * 未設定の間は 503 を返すだけでエラーにはしない（Stripeと同じ方針）。
 *
 * 設定手順の正典: docs/genesis/OPERATIONS.md §Square
 */

const SEGMENT_CODE_HIMEJI = "himeji"; // fin_segments.code（姫路インドアゴルフ）
export const DEFAULT_WEBHOOK_URL = "https://yozan-genesis.vercel.app/api/public/frank/pos/webhook";

type Admin = ReturnType<typeof createAdmin>;

async function frankStore(admin: Admin) {
  const { data: store } = await admin
    .from("stores")
    .select("id, company_id")
    .eq("id", FRANK_STORE_ID)
    .maybeSingle();
  if (!store) return null;
  const { data: seg } = await admin
    .from("fin_segments")
    .select("id")
    .eq("company_id", store.company_id)
    .eq("code", SEGMENT_CODE_HIMEJI)
    .is("deleted_at", null)
    .maybeSingle();
  return { storeId: String(store.id), companyId: String(store.company_id), segmentId: seg ? String(seg.id) : null };
}

/** 同じ支払い/返金を二重記録しない（Webhookは同一イベントが複数回届く） */
async function alreadyRecorded(admin: Admin, key: "square_payment_id" | "square_refund_id", id: string): Promise<boolean> {
  const { data } = await admin.from("mon_sales").select("id").eq(`detail->>${key}`, id).limit(1);
  return (data ?? []).length > 0;
}

async function insertSale(
  admin: Admin,
  ctx: { storeId: string; companyId: string; segmentId: string | null },
  row: {
    sold_on: string;
    category: string;
    amount: number;
    tax_included: number;
    pay_method?: string;
    memo: string | null;
    detail: Record<string, unknown>;
    customer_name?: string;
    member_kind?: string;
  },
): Promise<void> {
  const { data: sale, error } = await admin
    .from("mon_sales")
    .insert({
      company_id: ctx.companyId,
      store_id: ctx.storeId,
      segment_id: ctx.segmentId,
      sold_on: row.sold_on,
      category: row.category,
      amount: row.amount,
      tax_included: row.tax_included,
      pay_method: row.pay_method ?? "Square",
      memo: row.memo,
      detail: row.detail,
      ...(row.customer_name ? { customer_name: row.customer_name } : {}),
      ...(row.member_kind ? { member_kind: row.member_kind } : {}),
      entered_by: "Square(自動)",
      source: "square",
    })
    .select("id")
    .single();
  if (error) throw new Error(`mon_sales insert failed: ${error.message}`);

  // 現金はFRANK店舗の現金出納にも自動反映（Money OSの売上入力と同じ動き）
  if (row.pay_method === "現金" && row.amount > 0) {
    const { data: last } = await admin
      .from("mon_cash_ledger")
      .select("balance")
      .eq("company_id", ctx.companyId)
      .eq("store_id", ctx.storeId)
      .is("deleted_at", null)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const prev = Number(last?.balance ?? 0);
    await admin.from("mon_cash_ledger").insert({
      company_id: ctx.companyId,
      store_id: ctx.storeId,
      segment_id: ctx.segmentId,
      entry_date: row.sold_on,
      summary: row.category,
      description: row.memo ?? "Square現金売上",
      in_amount: row.tax_included,
      out_amount: 0,
      balance: prev + row.tax_included,
      memo: "Square Webhookから自動連携",
      entered_by: "Square(自動)",
      source: "sales",
      source_ref: sale?.id ?? null,
    });
  }
}

// ------------------------------------------------------------------
// 月会費（Squareサブスク #123）
// ------------------------------------------------------------------

type MemberRow = {
  id: unknown;
  company_id: unknown;
  name: unknown;
  member_no: unknown;
  status: unknown;
  billing_status: unknown;
  joining_fee_waived: boolean | null;
  joining_fee_charged_at: string | null;
  join_campaign: string | null;
  prepay_pause_done_at: string | null;
  frunk_plans: { monthly_price: number | null; joining_fee: number | null } | null;
};

const MEMBER_COLS =
  "id, company_id, name, member_no, status, billing_status, joining_fee_waived, joining_fee_charged_at, join_campaign, prepay_pause_done_at, frunk_plans(monthly_price, joining_fee)";

async function memberByCheckoutOrder(admin: Admin, orderId: string | null | undefined): Promise<MemberRow | null> {
  if (!orderId) return null;
  const { data } = await admin.from("frunk_members").select(MEMBER_COLS).eq("square_checkout_order_id", orderId).maybeSingle();
  return (data as unknown as MemberRow) ?? null;
}

async function memberBySquareCustomer(admin: Admin, customerId: string | null | undefined): Promise<MemberRow | null> {
  if (!customerId) return null;
  const { data } = await admin.from("frunk_members").select(MEMBER_COLS).eq("square_customer_id", customerId).maybeSingle();
  return (data as unknown as MemberRow) ?? null;
}

function planTaxIncludedOf(m: MemberRow | null): number | null {
  const price = Number(m?.frunk_plans?.monthly_price ?? 0);
  return price > 0 ? monthlyFeeTaxIncluded(price) : null;
}

/** 月会費入金の記録＋会員状態の更新。月会費でなければ false（＝店頭売上としてPOS経路へ） */
async function tryRecordMonthlyFee(
  admin: Admin,
  ctx: { storeId: string; companyId: string; segmentId: string | null },
  raw: SquarePayment,
  mapped: { sold_on: string; amount: number; tax_included: number; square_payment_id: string },
): Promise<boolean> {
  const byOrder = await memberByCheckoutOrder(admin, raw.order_id);
  const member = byOrder ?? (await memberBySquareCustomer(admin, raw.customer_id));
  const kind = classifySquareMonthlyPayment({
    orderMatched: !!byOrder,
    customerMatched: !byOrder && !!member,
    amount: mapped.tax_included,
    planTaxIncluded: planTaxIncludedOf(member),
  });
  if (!kind || !member) return false;

  // Web入会（/join-web）からの初回入金か。activateWebJoin が status を active に変えてしまうので先に控える
  const wasWebJoin = kind === "initial" && String(member.status) === "pending";

  // 会員状態の更新（初回＝カード登録完了）。記録の冪等チェックより先でも害はない（updateは何度でも同じ結果）
  if (kind === "initial") {
    await admin
      .from("frunk_members")
      .update({
        square_customer_id: raw.customer_id ?? null,
        billing_status: "active",
        billing_registered_at: new Date().toISOString(),
        payment_method: "card",
        updated_at: new Date().toISOString(),
      })
      .eq("id", member.id);

    // Web入会（即決済・#129）: pending のままの初回入金＝入会の確定。
    // 会員番号の採番・カルテ作成・控えPDFメールまで activateWebJoin が行う。
    if (String(member.status) === "pending") {
      try {
        const issued = await activateWebJoin(admin, String(member.id));
        if (issued) member.member_no = issued; // 以降の売上メモ・入会金noteに新番号を使う
      } catch (e) {
        console.error("[frank-pos] activateWebJoin failed:", e);
      }
    }
    if (String(member.billing_status) !== "active") {
      await logEvent(String(member.company_id), {
        event_type: "billing.registered",
        title: `月会費カード登録: ${member.name}様（${member.member_no}）継続課金が有効になりました（Square）`.slice(0, 120),
        source: "frank_billing",
        source_type: "system",
      });
    }
  } else if (String(member.billing_status) === "past_due") {
    // 失敗後の再課金成功＝復帰
    await admin.from("frunk_members").update({ billing_status: "active", updated_at: new Date().toISOString() }).eq("id", member.id);
  }

  // ---- 売上への記帳 ----
  // Web入会の初回は「入会金＋月会費×前取り月数」の一括入金（#131b）。
  // 1行の「月会費」で丸ごと記帳すると入会金が売上分類から消えるので、内訳に割って入れる。
  const est = wasWebJoin
    ? joinInitialTotal({
        monthlyExTax: Number(member.frunk_plans?.monthly_price ?? 0),
        joiningFeeExTax: Number(member.frunk_plans?.joining_fee ?? 0),
        applyDateYmd: mapped.sold_on,
        joiningFeeWaived: !!member.joining_fee_waived,
      })
    : null;
  const splitOk = !!est && est.total === mapped.tax_included && est.monthly > 0;

  if (splitOk && est) {
    const memberNo = String(member.member_no ?? "");
    if (est.joiningFee > 0) {
      await insertSale(admin, ctx, {
        sold_on: mapped.sold_on,
        category: "入会金",
        amount: Math.round(est.joiningFee / 1.1),
        tax_included: est.joiningFee,
        pay_method: "カード",
        memo: `Web入会 初回一括の内訳（${memberNo}）`,
        customer_name: String(member.name ?? ""),
        member_kind: "会員",
        detail: { square_payment_id: mapped.square_payment_id, frunk_member_id: String(member.id), part: "joining_fee" },
      });
    }
    await insertSale(admin, ctx, {
      sold_on: mapped.sold_on,
      category: "月会費",
      amount: Math.round((est.monthly * est.prepaidMonths) / 1.1),
      tax_included: est.monthly * est.prepaidMonths,
      pay_method: "カード",
      memo: `Web入会 前取り${est.prepaidMonths}か月分（${memberNo}）`,
      customer_name: String(member.name ?? ""),
      member_kind: "会員",
      detail: { square_payment_id: mapped.square_payment_id, frunk_member_id: String(member.id), part: "prepaid_months" },
    });
    // 入会金は初回一括に含めて頂戴済み＝あとから別途請求しない
    await admin
      .from("frunk_members")
      .update({ joining_fee_charged_at: new Date().toISOString(), prepay_charged_at: new Date().toISOString() })
      .eq("id", member.id);
  } else {
    await insertSale(admin, ctx, {
      sold_on: mapped.sold_on,
      category: "月会費",
      amount: mapped.amount,
      tax_included: mapped.tax_included,
      pay_method: "カード",
      memo: `Square自動課金（${String(member.member_no ?? "")}）`,
      customer_name: String(member.name ?? ""),
      member_kind: "会員",
      detail: { square_payment_id: mapped.square_payment_id, frunk_member_id: String(member.id) },
    });
  }

  // 入会金の後追い請求（#124の旧経路）。Web入会は初回一括に含むので対象外。
  // 店頭タブレット入会→booking.htmlでカード登録、のような経路だけがここに来る。
  if (kind === "initial" && !wasWebJoin && !member.joining_fee_waived && !member.joining_fee_charged_at) {
    const feeExTax = Number(member.frunk_plans?.joining_fee ?? 0);
    if (feeExTax > 0 && raw.customer_id) {
      const feeTax = monthlyFeeTaxIncluded(feeExTax);
      const r = await chargeCardOnFile({
        customerId: raw.customer_id,
        amountTaxIncluded: feeTax,
        note: `FRANK入会金（${String(member.member_no ?? "")}）`,
      });
      if (r.ok) {
        await admin.from("frunk_members").update({ joining_fee_charged_at: new Date().toISOString() }).eq("id", member.id);
      } else {
        await logEvent(String(member.company_id), {
          event_type: "billing.joining_fee_failed",
          title: `入会金の自動請求に失敗: ${member.name}様（${member.member_no}）${feeTax.toLocaleString()}円を店頭で徴収してください`.slice(0, 120),
          source: "frank_billing",
          source_type: "system",
          severity: "warning",
        });
      }
    }
  }
  return true;
}

/** 入会金の自動課金（noteの接頭辞で判定）を category=入会金 で記録する。対象外は false */
async function tryRecordJoiningFee(
  admin: Admin,
  ctx: { storeId: string; companyId: string; segmentId: string | null },
  raw: SquarePayment,
  mapped: { sold_on: string; tax_included: number; square_payment_id: string },
): Promise<boolean> {
  if (!isJoiningFeeNote(raw.note)) return false;
  const member = await memberBySquareCustomer(admin, raw.customer_id);
  await insertSale(admin, ctx, {
    sold_on: mapped.sold_on,
    category: "入会金",
    amount: exTax(mapped.tax_included),
    tax_included: mapped.tax_included,
    pay_method: "カード",
    memo: `Square自動課金・${String(raw.note ?? "入会金")}`,
    customer_name: member ? String(member.name ?? "") : undefined,
    member_kind: member ? "会員" : undefined,
    detail: {
      square_payment_id: mapped.square_payment_id,
      ...(member ? { frunk_member_id: String(member.id) } : {}),
    },
  });
  return true;
}

/** カード決済失敗→past_due（会員のプラン額と一致する失敗だけ。店頭決済の失敗で誤爆しない） */
async function markPastDueOnFailure(admin: Admin, raw: SquarePayment): Promise<void> {
  if (raw.status !== "FAILED") return;
  const member = await memberBySquareCustomer(admin, raw.customer_id);
  const planTax = planTaxIncludedOf(member);
  if (!member || planTax === null || Number(raw.amount_money?.amount ?? 0) !== planTax) return;
  await admin.from("frunk_members").update({ billing_status: "past_due", updated_at: new Date().toISOString() }).eq("id", member.id);
  await logEvent(String(member.company_id), {
    event_type: "billing.payment_failed",
    title: `月会費の支払い失敗: ${member.name}様（${member.member_no}）カード決済に失敗しました（Square）`.slice(0, 120),
    source: "frank_billing",
    source_type: "system",
    severity: "notice",
  });
}

/** subscription.created/updated: サブスクIDの追従と解約の反映 */
async function handleSubscriptionEvent(admin: Admin, obj: Record<string, unknown>): Promise<void> {
  const sub = (obj.subscription ?? obj) as { id?: string; status?: string; customer_id?: string | null };
  if (!sub?.id) return;
  const member = await memberBySquareCustomer(admin, sub.customer_id);
  if (!member) return; // 初回決済のWebhookが先に届いて顧客IDが入ってから追従できる（順序は保証されない）
  const status = (sub.status ?? "").toUpperCase();
  const patch: Record<string, unknown> = { square_subscription_id: sub.id, updated_at: new Date().toISOString() };
  if (status === "CANCELED" || status === "DEACTIVATED") {
    patch.billing_status = "canceled";
    await admin.from("frunk_members").update(patch).eq("id", member.id);
    if (String(member.billing_status) !== "canceled") {
      await logEvent(String(member.company_id), {
        event_type: "billing.canceled",
        title: `月会費の継続課金が解約: ${member.name}様（${member.member_no}）（Square）`.slice(0, 120),
        source: "frank_billing",
        source_type: "system",
        severity: "notice",
      });
    }
    return;
  }
  await admin.from("frunk_members").update(patch).eq("id", member.id);

  // Web入会の後始末（#131b）。入会時は「入会金＋前取り月数分」を1回でお支払いいただくため、
  // 決済リンクの金額＝総額。Squareはこれをサブスクの price_override_money として引き継ぐので、
  //   (1) 価格上書きを消してプラン月額に戻す（放置すると毎月その総額を請求してしまう）
  //   (2) 前取りした月数ぶんは自動課金をスキップ（二重取りの防止）
  // をこの1か所で行う。prepay_pause_done_at で1回だけ実行する。
  if (!member.prepay_pause_done_at && ["ACTIVE", "PENDING"].includes(status)) {
    const version = typeof (sub as { version?: number }).version === "number" ? (sub as { version?: number }).version : undefined;
    const cleared = await clearSubscriptionPriceOverride(sub.id, version);
    const paused = await pauseSubscriptionCycles(sub.id, JOIN_PREPAID_MONTHS);
    if (cleared.ok && paused.ok) {
      await admin
        .from("frunk_members")
        .update({ prepay_pause_done_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", member.id);
    } else {
      await logEvent(String(member.company_id), {
        event_type: "billing.prepay_setup_failed",
        title: `入会後の継続課金の設定に失敗: ${member.name}様（${member.member_no}）${cleared.ok ? "" : "月額が初回一括の金額のままです。"}${paused.ok ? "" : "前取り分の停止ができていません。"}Squareで確認してください`.slice(0, 120),
        source: "frank_billing",
        source_type: "system",
        severity: "warning",
      });
    }
  }
}

/** Webhook本体。ルートは署名検証済みの payload(JSON文字列) を渡す */
export async function handleSquareEvent(payload: string): Promise<void> {
  const event = JSON.parse(payload) as {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  const type = event.type ?? "";
  const admin = createAdmin();
  const obj = event.data?.object ?? {};

  if (type === "subscription.created" || type === "subscription.updated") {
    await handleSubscriptionEvent(admin, obj);
    return;
  }
  if (type !== "payment.updated" && type !== "payment.created" && type !== "refund.updated" && type !== "refund.created") return;

  const ctx = await frankStore(admin);
  if (!ctx) return;

  if (type.startsWith("payment.")) {
    const raw = (obj.payment ?? obj) as SquarePayment;
    await markPastDueOnFailure(admin, raw); // COMPLETED以外はここで終わる
    const mapped = mapSquarePayment(raw);
    if (!mapped) return;
    if (await alreadyRecorded(admin, "square_payment_id", mapped.square_payment_id)) return;
    // 入会金の自動課金（note接頭辞）→ category=入会金
    if (await tryRecordJoiningFee(admin, ctx, raw, mapped)) {
      await admin.rpc("refresh_money_to_finance", { p_company_id: ctx.companyId });
      return;
    }
    // 月会費（サブスク）なら月会費として記録し、店頭売上には入れない
    if (await tryRecordMonthlyFee(admin, ctx, raw, mapped)) {
      await admin.rpc("refresh_money_to_finance", { p_company_id: ctx.companyId });
      return;
    }
    await insertSale(admin, ctx, {
      ...mapped,
      detail: { square_payment_id: mapped.square_payment_id },
    });
  } else {
    const mapped = mapSquareRefund((obj.refund ?? obj) as SquareRefund);
    if (!mapped) return;
    if (await alreadyRecorded(admin, "square_refund_id", mapped.square_refund_id)) return;
    await insertSale(admin, ctx, {
      ...mapped,
      pay_method: "Square",
      detail: { square_refund_id: mapped.square_refund_id },
    });
    await logEvent(ctx.companyId, {
      event_type: "pos.refund",
      title: `FRANK 店頭返金: ${Math.abs(mapped.tax_included).toLocaleString()}円（Square）`.slice(0, 120),
      source: "frank_pos",
      source_type: "system",
      severity: "notice",
    });
  }

  await admin.rpc("refresh_money_to_finance", { p_company_id: ctx.companyId });
}
