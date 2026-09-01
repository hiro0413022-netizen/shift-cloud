import "server-only";
import { randomUUID } from "crypto";
import { squareOrderIdempotencyKey } from "@yozan/core/frank-portal";

/**
 * FRANK GOLF member-os → Square 操作（#124）
 *
 * スタッフ操作に紐づくSquare側の追従だけを担当する:
 *   - 休会 → サブスクの一時停止（月会費の自動課金を止める。休会費2,200円は店頭徴収）
 *   - 復帰 → 再開
 *   - プラン変更 → サブスクのプラン差し替え（翌請求から新額）＋当月差額のカード請求
 *
 * env（Vercel: member-os）: SQUARE_ACCESS_TOKEN（yozan-genesis と同じ値）
 * 未設定なら何もしないで {skipped:true} を返す（スタッフ操作自体は成立させる。
 * その場合のSquare側の追従は手動＝ダッシュボードで行う）。
 * 失敗しても throw しない（呼び出し側が結果メッセージでスタッフに伝える）。
 */

const BASE = "https://connect.squareup.com/v2";

export type SquareOpResult = { ok: boolean; skipped?: boolean; error?: string };

function token(): string | null {
  const t = process.env.SQUARE_ACCESS_TOKEN;
  return t && t.trim().length > 10 ? t.trim() : null;
}

async function sq(method: string, path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errs = (json.errors as Array<{ detail?: string; code?: string }> | undefined) ?? [];
    throw new Error(errs.map((e) => e.detail ?? e.code).join("; ") || `Square ${method} ${path} (${res.status})`);
  }
  return json;
}

/**
 * 休会: 月会費の自動課金を止める。
 *
 * effectiveDate（"YYYY-MM-DD"）を渡すと **その日から** 止まる（#192）。
 * 店のルールでは休会は必ず月初からなので、通常は "2026-10-01" のような月初が入る。
 * 省略すると Square は「次の請求サイクルの開始日」で止める。
 * ⚠ 未指定＝即時停止ではない。ここを取り違えると「止めたつもりで1回落ちる」事故になる。
 */
export async function pauseSubscription(subscriptionId: string, effectiveDate?: string | null): Promise<SquareOpResult> {
  if (!token()) return { ok: false, skipped: true };
  try {
    await sq("POST", `/subscriptions/${subscriptionId}/pause`, effectiveDate ? { pause_effective_date: effectiveDate } : {});
    return { ok: true };
  } catch (e) {
    console.error("[frank-square] pause failed:", e);
    return { ok: false, error: String(e) };
  }
}

/**
 * 退会: 月会費の自動課金を解約する（#192・2026-09-01）。
 *
 * これまで退会は Square を触らず「ダッシュボードで解約してください」と赤字を出すだけだった。
 * 見落とすと翌月も引き落とされるので、退会日に合わせてここで必ず止める。
 *
 * effectiveDate（"YYYY-MM-DD"）あり:
 *   PUT /subscriptions/{id} で canceled_date を入れる＝**その日で解約が予約される**。
 *   店のルールでは退会日は必ず月末なので、その月までは請求され、翌月から止まる。
 * effectiveDate なし:
 *   POST /subscriptions/{id}/cancel＝**現在の請求サイクルの終わり**で解約（Squareの仕様。即時ではない）。
 */
export async function cancelSubscription(subscriptionId: string, effectiveDate?: string | null): Promise<SquareOpResult> {
  if (!token()) return { ok: false, skipped: true };
  try {
    if (effectiveDate) {
      await sq("PUT", `/subscriptions/${subscriptionId}`, { subscription: { canceled_date: effectiveDate } });
    } else {
      await sq("POST", `/subscriptions/${subscriptionId}/cancel`, {});
    }
    return { ok: true };
  } catch (e) {
    console.error("[frank-square] cancel failed:", e);
    return { ok: false, error: String(e) };
  }
}

/** 退会の取り消し: 予約済みの解約日を消して自動課金を戻す */
export async function uncancelSubscription(subscriptionId: string): Promise<SquareOpResult> {
  if (!token()) return { ok: false, skipped: true };
  try {
    await sq("PUT", `/subscriptions/${subscriptionId}`, { subscription: { canceled_date: null } });
    return { ok: true };
  } catch (e) {
    console.error("[frank-square] uncancel failed:", e);
    return { ok: false, error: String(e) };
  }
}

/** 復帰: 自動課金を再開する */
export async function resumeSubscription(subscriptionId: string): Promise<SquareOpResult> {
  if (!token()) return { ok: false, skipped: true };
  try {
    await sq("POST", `/subscriptions/${subscriptionId}/resume`, {});
    return { ok: true };
  } catch (e) {
    console.error("[frank-square] resume failed:", e);
    return { ok: false, error: String(e) };
  }
}

/** プラン変更: 翌請求から新プラン額（入会金なしバリエーションへスワップ＝入会金を二重請求しない） */
export async function swapSubscriptionPlan(subscriptionId: string, newVariationId: string): Promise<SquareOpResult> {
  if (!token()) return { ok: false, skipped: true };
  try {
    await sq("POST", `/subscriptions/${subscriptionId}/swap-plan`, { new_plan_variation_id: newVariationId });
    return { ok: true };
  } catch (e) {
    console.error("[frank-square] swap-plan failed:", e);
    return { ok: false, error: String(e) };
  }
}

/**
 * 当月差額の即時請求（登録済みカードに課金）。
 * カード未登録なら {ok:false, error:'no_card'} ＝店頭で徴収してもらう。
 */
export async function chargeCardOnFile(input: {
  customerId: string;
  amountTaxIncluded: number; // 円
  note: string; // 例: プラン変更差額（FR0001）
}): Promise<SquareOpResult> {
  if (!token()) return { ok: false, skipped: true };
  try {
    const cards = await sq("GET", `/cards?customer_id=${encodeURIComponent(input.customerId)}`);
    const card = ((cards.cards as Array<{ id?: string; enabled?: boolean }> | undefined) ?? []).find((c) => c.enabled !== false);
    if (!card?.id) return { ok: false, error: "no_card" };
    await sq("POST", "/payments", {
      idempotency_key: randomUUID(),
      source_id: card.id,
      customer_id: input.customerId,
      amount_money: { amount: input.amountTaxIncluded, currency: "JPY" },
      note: input.note,
    });
    return { ok: true };
  } catch (e) {
    console.error("[frank-square] charge failed:", e);
    return { ok: false, error: String(e) };
  }
}

/**
 * モバイルオーダーの即時決済（#154）。
 *
 * chargeCardOnFile との違いは2つだけ:
 *   - **idempotency_key に注文IDを使う**。randomUUID だとリトライで二重課金になる。
 *     同じ注文は何度呼んでも Square 側で1回しか通らない。
 *     ⚠ ただし **Square の上限は45文字**。接頭辞を足すと簡単に超える（#161）。
 *   - payment.id を返す（frunk_orders.square_payment_id に入れて Webhook と突き合わせる）。
 *
 * 失敗しても throw しない。呼び出し側は「未決済のまま伝票に出す」で処理を続ける
 * ＝お客様の前で注文を失敗させない（構想 §2-4）。
 */
export async function chargeOrderOnFile(input: {
  customerId: string;
  amountTaxIncluded: number;
  note: string;
  idempotencyKey: string;
}): Promise<SquareOpResult & { paymentId?: string }> {
  if (!token()) return { ok: false, skipped: true, error: "no_token" };
  try {
    const cards = await sq("GET", `/cards?customer_id=${encodeURIComponent(input.customerId)}`);
    const card = ((cards.cards as Array<{ id?: string; enabled?: boolean }> | undefined) ?? []).find((c) => c.enabled !== false);
    if (!card?.id) return { ok: false, error: "no_card" };
    const res = await sq("POST", "/payments", {
      // ⚠ Square の idempotency_key は **45文字まで**（#161・本番で発覚）。
      //   長さの担保は core の純関数に寄せてテストで固定してある。ここで組み立て直さないこと。
      idempotency_key: squareOrderIdempotencyKey(input.idempotencyKey),
      source_id: card.id,
      customer_id: input.customerId,
      amount_money: { amount: input.amountTaxIncluded, currency: "JPY" },
      note: input.note,
    });
    const payment = (res.payment as { id?: string } | undefined) ?? undefined;
    return { ok: true, paymentId: payment?.id };
  } catch (e) {
    console.error("[frank-square] order charge failed:", e);
    return { ok: false, error: String(e) };
  }
}
