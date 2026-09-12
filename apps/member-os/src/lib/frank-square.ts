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
 * 10日払い（#235）では「休会開始月の分を引き落とす前月10日」を渡す（squarePauseDateForSuspend）。
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
 *   10日払い（#235）では「退会月の10日」を渡す（squareCancelDateForLeave）＝翌月分をその日に引き落とさない。
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

/**
 * 復帰: 自動課金を再開する。
 * effectiveDate（必ず10日・#235）を渡すとその日に再開＝その日に翌月分が引き落とされる。
 * 10日に再開するので、請求日（10日）がずれない。
 */
export async function resumeSubscription(subscriptionId: string, effectiveDate?: string | null): Promise<SquareOpResult> {
  if (!token()) return { ok: false, skipped: true };
  try {
    await sq(
      "POST",
      `/subscriptions/${subscriptionId}/resume`,
      effectiveDate ? { resume_effective_date: effectiveDate, resume_change_timing: "IMMEDIATE" } : {},
    );
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

/* ============================================================================
 * サブスクの状態を読む（#234・#235）
 *   会員カードに「Square上の次回の引き落とし日」をそのまま出すため。
 *   作り直し（10日払い）は Genesis 側（SQUARE_LOCATION_ID がある）: apps/genesis/src/lib/frank-billing-day.ts
 * ========================================================================== */

export type SubscriptionAction = { id: string; type: string; effective_date?: string | null };
export type SubscriptionDetail = {
  id: string;
  status: string;
  start_date: string | null;
  charged_through_date: string | null;
  canceled_date: string | null;
  monthly_billing_anchor_date: number | null;
  actions: SubscriptionAction[];
};

/** サブスク1件を「予約済みアクションつき」で読む */
export async function getSubscriptionDetail(
  subscriptionId: string,
): Promise<{ ok: true; sub: SubscriptionDetail } | { ok: false; skipped?: boolean; error: string }> {
  if (!token()) return { ok: false, skipped: true, error: "no_token" };
  try {
    const json = await sq("GET", `/subscriptions/${encodeURIComponent(subscriptionId)}?include=actions`);
    const raw = (json.subscription ?? {}) as Record<string, unknown>;
    const actions = ((json.actions ?? raw.actions ?? []) as Array<Record<string, unknown>>).map((a) => ({
      id: String(a.id ?? ""),
      type: String(a.type ?? "").toUpperCase(),
      effective_date: a.effective_date ? String(a.effective_date) : null,
    }));
    return {
      ok: true,
      sub: {
        id: String(raw.id ?? subscriptionId),
        status: String(raw.status ?? "").toUpperCase(),
        start_date: raw.start_date ? String(raw.start_date) : null,
        charged_through_date: raw.charged_through_date ? String(raw.charged_through_date) : null,
        canceled_date: raw.canceled_date ? String(raw.canceled_date) : null,
        monthly_billing_anchor_date: typeof raw.monthly_billing_anchor_date === "number" ? raw.monthly_billing_anchor_date : null,
        actions,
      },
    };
  } catch (e) {
    console.error("[frank-square] get subscription failed:", e);
    return { ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }
}

/** Square上で次に引き落とされる日（無ければ null）。休止中は再開の予約日 */
export function nextInvoiceDateOf(sub: SubscriptionDetail): string | null {
  if (["CANCELED", "DEACTIVATED"].includes(sub.status)) return null;
  const firstOf = (t: string) =>
    sub.actions.filter((a) => a.type === t && a.effective_date).map((a) => String(a.effective_date)).sort()[0] ?? null;
  if (sub.status === "PAUSED") return firstOf("RESUME");
  const next = sub.status === "PENDING" ? sub.start_date : sub.charged_through_date;
  if (!next) return null;
  if (sub.canceled_date && sub.canceled_date <= next) return null;
  const pause = firstOf("PAUSE");
  if (pause && pause <= next) return firstOf("RESUME");
  return next;
}

/**
 * 休会の停止予約を消す（#235・休会予約の取り消し用）。
 * まだ始まっていない休会を取り消すのに resume を呼ぶと Square は受け付けないことがあるので、予約そのものを消す。
 * ⚠ 消すのは「その休会の停止日（pauseYmd）」の PAUSE と、それより後の RESUME だけ。
 *   入会時の前取り分の休止（10日払いに切り替える前の会員）まで消すと、前取りした月に引き落とされる。
 */
export async function clearPendingPause(subscriptionId: string, pauseYmd: string): Promise<SquareOpResult> {
  if (!token()) return { ok: false, skipped: true };
  try {
    const d = await getSubscriptionDetail(subscriptionId);
    if (!d.ok) return { ok: false, error: d.error };
    if (d.sub.status === "PAUSED") {
      // すでに休止に入っている＝予約を消すのではなく再開（次の10日から）
      return { ok: false, error: "already_paused" };
    }
    const pauses = d.sub.actions.filter((x) => x.type === "PAUSE" && x.id && x.effective_date === pauseYmd);
    if (pauses.length === 0) return { ok: true }; // 予約が無い（Square未反映・すでに消えている）＝何もしない
    const resumes = d.sub.actions.filter((x) => x.type === "RESUME" && x.id && String(x.effective_date ?? "") > pauseYmd);
    for (const a of [...resumes, ...pauses]) {
      await sq("DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}/actions/${encodeURIComponent(a.id)}`);
    }
    return { ok: true };
  } catch (e) {
    console.error("[frank-square] clear pending pause failed:", e);
    return { ok: false, error: String(e) };
  }
}
