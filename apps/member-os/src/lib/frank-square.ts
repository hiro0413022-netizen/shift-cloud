import "server-only";
import { randomUUID } from "crypto";
import { squareOrderIdempotencyKey } from "@yozan/core/frank-portal";
import { calendarMonthsBetween } from "@yozan/core/frank-billing-start";

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

/* ============================================================================
 * ご利用開始月に合わせて「前取り分の休止」を組み直す（#234・2026-09-11）
 *
 * Web入会の決済でサブスクは「入会日」から始まり、Webhook が
 * 「前取り月数ぶん（＋ご利用開始月までの月数ぶん）」の休止を Square に予約する（genesis frank-pos.ts）。
 * 入会後に「ご利用開始は11月から」と分かった方（尾内様・大江様）は、この休止を長くすればよい。
 * 請求日（毎月◯日）は動かさない＝サブスクを作り直さない・請求日の基準日も触らない（ユーザー決定）。
 *
 * Square の休止は「予約済みの PAUSE / RESUME アクション」として持たれている。
 * 予約を上書きする API は無いので、①予約を消す ②周期数を指定して休止を予約し直す ③読み直して確かめる。
 * ②が失敗したら元の周期数で予約し直す（消したままだと、止めるはずの月にそのまま引き落とされる）。
 * ========================================================================== */

export type SubscriptionAction = { id: string; type: string; effective_date?: string | null };
export type SubscriptionDetail = {
  id: string;
  status: string;
  start_date: string | null;
  charged_through_date: string | null;
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
        actions,
      },
    };
  } catch (e) {
    console.error("[frank-square] get subscription failed:", e);
    return { ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }
}

/** 予約中の休止（PAUSE の日＝止まる最初の請求日／RESUME の日＝次に請求される日）。無ければ null */
export function pendingPauseWindow(sub: SubscriptionDetail): { pause: string | null; resume: string | null } {
  const pause = sub.actions.filter((a) => a.type === "PAUSE" && a.effective_date).map((a) => String(a.effective_date)).sort()[0] ?? null;
  const resume = sub.actions.filter((a) => a.type === "RESUME" && a.effective_date).map((a) => String(a.effective_date)).sort()[0] ?? null;
  return { pause, resume };
}

export type ReschedulePauseResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  /** 変更前の Square の予定 */
  before?: { pause: string | null; resume: string | null };
  /** 変更後に読み直した Square の予定 */
  after?: { pause: string | null; resume: string | null };
  /** 新しく予約した休止の周期数 */
  cycles?: number;
  /** ②が失敗して元の周期数で予約し直したか */
  restored?: boolean;
};

/**
 * 次に自動課金される日が targetYmd になるように、前取り分の休止を予約し直す。
 *
 * 前提（満たさなければ何もしないで理由を返す）:
 *   - サブスクが ACTIVE（休止がまだ始まっていない）。PAUSED＝休止に入っている・PENDING＝開始日指定のサブスク（#233）は対象外
 *   - targetYmd が「次の請求サイクルの開始日」以降
 *
 * fallbackRestoreCycles: Square が RESUME の予約日を返さなかったときに、元に戻す周期数（DBの控え）
 */
export async function reschedulePrepayPause(
  subscriptionId: string,
  input: { targetYmd: string; fallbackRestoreCycles: number },
): Promise<ReschedulePauseResult> {
  if (!token()) return { ok: false, skipped: true };
  const first = await getSubscriptionDetail(subscriptionId);
  if (!first.ok) return { ok: false, skipped: first.skipped, error: first.error };
  const sub = first.sub;
  const before = pendingPauseWindow(sub);
  if (sub.status === "PAUSED") return { ok: false, before, error: "already_paused" };
  if (sub.status !== "ACTIVE") return { ok: false, before, error: `status_${sub.status || "unknown"}` };

  // 次の請求サイクルの開始日。予約中の PAUSE があればその日（Square自身が決めた日）を正とする
  const nextCycle = before.pause ?? sub.charged_through_date;
  if (!nextCycle) return { ok: false, before, error: "no_next_cycle" };
  const cycles = calendarMonthsBetween(nextCycle, input.targetYmd);
  if (cycles < 0) return { ok: false, before, error: "target_before_next_cycle" };

  const restoreCycles =
    before.pause && before.resume
      ? Math.max(0, calendarMonthsBetween(before.pause, before.resume))
      : before.pause
        ? Math.max(0, Math.trunc(input.fallbackRestoreCycles))
        : 0;

  try {
    // ① 予約を消す（RESUME を先に。PAUSE を先に消して RESUME の削除に失敗すると、変な再開予約だけが残る）
    const toDelete = [...sub.actions.filter((a) => a.type === "RESUME"), ...sub.actions.filter((a) => a.type === "PAUSE")];
    for (const a of toDelete) {
      if (!a.id) continue;
      await sq("DELETE", `/subscriptions/${encodeURIComponent(subscriptionId)}/actions/${encodeURIComponent(a.id)}`);
    }
  } catch (e) {
    console.error("[frank-square] delete subscription action failed:", e);
    const again = await getSubscriptionDetail(subscriptionId);
    return {
      ok: false,
      before,
      after: again.ok ? pendingPauseWindow(again.sub) : undefined,
      error: `delete_failed: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`,
    };
  }

  let restored = false;
  let pauseError: string | null = null;
  if (cycles > 0) {
    try {
      // ② 周期数で予約（開始日を省略＝次の請求サイクルの開始日から止まり、cycles 回ぶん後に自動で再開）
      await sq("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/pause`, {
        pause_cycle_duration: cycles,
        pause_reason: "FRANK: ご利用開始月に合わせて前取り分の休止を組み直し（#234）",
      });
    } catch (e) {
      pauseError = String(e instanceof Error ? e.message : e).slice(0, 160);
      console.error("[frank-square] re-pause failed:", e);
      if (restoreCycles > 0) {
        try {
          await sq("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/pause`, { pause_cycle_duration: restoreCycles });
          restored = true;
        } catch (e2) {
          console.error("[frank-square] restore pause failed:", e2);
        }
      }
    }
  }

  // ③ 読み直して、実際に Square に入っている予定を返す（画面にそのまま出す）
  const again = await getSubscriptionDetail(subscriptionId);
  const after = again.ok ? pendingPauseWindow(again.sub) : undefined;
  if (pauseError) return { ok: false, before, after, cycles, restored, error: `pause_failed: ${pauseError}` };
  return { ok: true, before, after, cycles };
}
