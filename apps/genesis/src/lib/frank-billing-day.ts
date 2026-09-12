import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import { jstYmd } from "@/lib/jst";
import {
  BILLING_DAY,
  addMonthsYmd,
  calendarMonthsBetween,
  rebaseStartDate,
  usageStartError,
  usageStartSchedule,
  monthLabel,
} from "@yozan/core/frank-billing-start";
import { squareCancelDateForLeave } from "@yozan/core/frank-membership";

/**
 * FRANK 月会費を「毎月10日に翌月分」に作り直す（#235・2026-09-11 ユーザー決定）
 *
 * ── なぜサブスクを作り直すのか ──
 * Web入会の決済リンク（サブスク付き）で作られるサブスクは「お支払いの日」が毎月の請求日になり、
 * 決済リンク側からは請求日を指定できない。Square の ChangeBillingAnchorDate は既定で日割りせず
 * 「すぐ満額をもう一度」請求しうる（公式docの注意書き）ので使わない。本番で使っている操作だけで組む:
 *   ① 今のサブスクを「今の支払い済み期間の終わり」で解約（POST /cancel・#192）
 *   ② 保存カードから、開始日＝最初の10日・請求日10日のサブスクを作る（POST /subscriptions・#233）
 *
 * ── お客様に二重請求しないための約束 ──
 *   - 同時に2本走らせない: claim（5分で失効）を全経路で取る。スタッフの再実行も同じ
 *   - 引退させるサブスクIDを先にDBへ控える（その後に届く Webhook を無視させる）
 *   - 解約に失敗したら「何も変えていない」状態に戻す。前取り分の休止を消したのに解約できなかったら休止を戻して確認する
 *   - 新しいサブスクの idempotency_key は「会員・旧サブスク・開始日」から決める（再送しても1本）
 *   - Square に「生きている・引退させていない」サブスクが2本以上あったら何もしない（人が確認）
 *   解約できたのに作成に失敗した場合は「引き落としが止まっている」（お客様は損しない）。
 *   billing_rebase_error に残して会員カードに赤で出し、再実行で作成から続ける。
 *
 * ── 入会の Webhook から ──
 *   入金で会員が active になってから動く（join_date＝入金日が決まってから。入会完了メールと同じ日付で数える）。
 *   作り直しに失敗し、決済リンクのサブスクがまだ生きている場合は、従来の保護（価格上書きの解除＋前取り分の休止）をかける
 *   ＝翌月に入会時の一括金額がもう一度引き落とされるのを防ぐ。
 */

const SQUARE_API = "https://connect.squareup.com/v2";
const CLAIM_TTL_MS = 5 * 60 * 1000;

function token(): string | null {
  const t = process.env.SQUARE_ACCESS_TOKEN;
  return t && t.trim().length > 10 ? t.trim() : null;
}

class SquareError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function sq(method: string, path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${SQUARE_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new SquareError(`network: ${String(e instanceof Error ? e.message : e)}`, 0);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errs = (json.errors as Array<{ detail?: string; code?: string }> | undefined) ?? [];
    throw new SquareError(errs.map((e) => `${e.code ?? ""} ${e.detail ?? ""}`.trim()).join("; ") || `Square ${method} ${path}`, res.status);
  }
  return json;
}

/** 一時的な失敗（再実行で通りうる）＝ここでは状態を変えずに止める */
const isTransient = (e: unknown) => e instanceof SquareError && (e.status === 0 || e.status === 429 || e.status >= 500);
const errText = (e: unknown) => String(e instanceof Error ? e.message : e).slice(0, 160);

export type SquareSub = {
  id: string;
  status: string;
  start_date: string | null;
  charged_through_date: string | null;
  canceled_date: string | null;
  monthly_billing_anchor_date: number | null;
  card_id: string | null;
  created_at: string | null;
  actions: Array<{ id: string; type: string; effective_date: string | null }>;
};

function toSub(raw: Record<string, unknown>, actionsRaw?: unknown): SquareSub {
  const acts = ((actionsRaw ?? raw.actions ?? []) as Array<Record<string, unknown>>).map((a) => ({
    id: String(a.id ?? ""),
    type: String(a.type ?? "").toUpperCase(),
    effective_date: a.effective_date ? String(a.effective_date) : null,
  }));
  return {
    id: String(raw.id ?? ""),
    status: String(raw.status ?? "").toUpperCase(),
    start_date: raw.start_date ? String(raw.start_date) : null,
    charged_through_date: raw.charged_through_date ? String(raw.charged_through_date) : null,
    canceled_date: raw.canceled_date ? String(raw.canceled_date) : null,
    monthly_billing_anchor_date: typeof raw.monthly_billing_anchor_date === "number" ? raw.monthly_billing_anchor_date : null,
    card_id: raw.card_id ? String(raw.card_id) : null,
    created_at: raw.created_at ? String(raw.created_at) : null,
    actions: acts,
  };
}

async function getSub(id: string): Promise<SquareSub> {
  const json = await sq("GET", `/subscriptions/${encodeURIComponent(id)}?include=actions`);
  const raw = (json.subscription ?? {}) as Record<string, unknown>;
  return toSub(raw, json.actions ?? raw.actions);
}

async function searchSubs(customerId: string): Promise<SquareSub[]> {
  const json = await sq("POST", "/subscriptions/search", { query: { filter: { customer_ids: [customerId] } } });
  return ((json.subscriptions ?? []) as Array<Record<string, unknown>>).map((s) => toSub(s));
}

const isLive = (s: SquareSub) => !["CANCELED", "DEACTIVATED"].includes(s.status);
const hasCancel = (s: SquareSub) => !!s.canceled_date || s.actions.some((a) => a.type === "CANCEL");

export type RebaseResult =
  | {
      ok: true;
      noop?: boolean;
      startDate: string;
      billedMonth: string;
      oldSubscriptionId: string | null;
      newSubscriptionId: string | null;
      oldEndsOn: string | null;
      message: string;
    }
  | { ok: false; error: string; detail?: string; refused?: boolean };

/**
 * 解約が「もう請求しない」形で入ったか。
 * canceled_date が付いただけでは足りない（まだ始まっていないサブスクで、開始日より後に解約日が付くと開始日に1回請求される）。
 */
function cancelVerified(s: SquareSub): boolean {
  if (s.status === "CANCELED" || s.status === "DEACTIVATED") return true;
  if (!s.canceled_date) return false;
  const edge = s.status === "PENDING"
    ? s.start_date
    : (s.charged_through_date ?? (s.start_date ? addMonthsYmd(s.start_date, 1) : null));
  return !!edge && s.canceled_date <= edge;
}

type MemberRow = {
  id: string;
  company_id: string;
  name: string | null;
  member_no: string | null;
  status: string;
  join_date: string | null;
  join_campaign: string | null;
  billing_registered_at: string | null;
  square_customer_id: string | null;
  square_subscription_id: string | null;
  square_checkout_breakdown: Record<string, unknown> | null;
  scheduled_leave_date: string | null;
  scheduled_suspend_start: string | null;
  billing_rebased_at: string | null;
  billing_rebase_error: string | null;
  square_retired_subscription_ids: string[] | null;
  prepay_pause_done_at: string | null;
  frunk_plans: {
    name: string | null;
    monthly_price: number | null;
    square_variation_id: string | null;
    square_variation_nofee_id: string | null;
  } | null;
};

const MEMBER_SELECT =
  "id, company_id, name, member_no, status, join_date, join_campaign, billing_registered_at, square_customer_id, square_subscription_id, square_checkout_breakdown, scheduled_leave_date, scheduled_suspend_start, billing_rebased_at, billing_rebase_error, square_retired_subscription_ids, prepay_pause_done_at, frunk_plans(name, monthly_price, square_variation_id, square_variation_nofee_id)";

const slash = (ymd: string) => ymd.replaceAll("-", "/");

/**
 * 1人ぶんを10日払いに作り直す。
 * - source 'webhook': まだ作り直していない active の会員だけ（入会・カード登録の直後）
 * - source 'staff' / 'bulk': 済んでいても今の状態から見直す（開始日が合っていれば何もしない）
 * - usageStart: ご利用開始日の変更（#234）。成功したときだけ start_date / 継続期限 / 内訳に書く
 */
export async function rebaseToBillingDay(
  memberId: string,
  opts: { source: "webhook" | "staff" | "bulk"; usageStart?: string | null },
): Promise<RebaseResult> {
  if (!token() || !process.env.SQUARE_LOCATION_ID) return { ok: false, error: "square_env_missing", refused: true };
  const locationId = String(process.env.SQUARE_LOCATION_ID);
  const admin = createAdmin();
  const today = jstYmd();

  // ---- 同時に2本走らせない（Webhook 2本・スタッフの二度押し・一括ボタンの再押し） ----
  const cutoff = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  const { data: claimed } = await admin
    .from("frunk_members")
    .update({ billing_rebase_claimed_at: new Date().toISOString() })
    .eq("id", memberId)
    .or(`billing_rebase_claimed_at.is.null,billing_rebase_claimed_at.lt.${cutoff}`)
    .select("id");
  if (!claimed || claimed.length === 0) return { ok: false, error: "already_claimed", refused: true };
  const release = async (patch: Record<string, unknown> = {}) => {
    await admin
      .from("frunk_members")
      .update({ ...patch, billing_rebase_claimed_at: null, updated_at: new Date().toISOString() })
      .eq("id", memberId);
  };

  // claim を取ってから読む（前の実行が書いた引退リスト・サブスクIDを必ず見る）
  const { data } = await admin.from("frunk_members").select(MEMBER_SELECT).eq("id", memberId).is("deleted_at", null).maybeSingle();
  const m = data as unknown as MemberRow | null;

  /** 何も変えずに断る（会員カードに赤は出さない） */
  const refuse = async (error: string, detail?: string): Promise<RebaseResult> => {
    await release();
    return { ok: false, error, detail, refused: true };
  };
  if (!m) return refuse("member_not_found");

  /** Square を触ったあとの失敗。会員カードに赤で出し、イベントに残す */
  const fail = async (error: string, detail?: string, severity: "warning" | "critical" = "warning"): Promise<RebaseResult> => {
    await release({ billing_rebase_error: `${error}${detail ? `: ${detail}` : ""}`.slice(0, 500) });
    await logEvent(m.company_id, {
      event_type: "billing.rebase_failed",
      title: `10日払いへの切り替えに失敗: ${m.name ?? ""}様（${m.member_no ?? ""}）${error}`.slice(0, 120),
      description: detail,
      source: "frank_billing",
      source_type: "system",
      severity,
      raw_payload: { member_id: m.id, error, detail, source: opts.source },
    });
    return { ok: false, error, detail };
  };

  if (opts.source === "webhook" && m.billing_rebased_at) return refuse("already_rebased");
  // 一度失敗した方は自動では再挑戦しない（Square の変更が Webhook を呼び、また失敗する、の繰り返しを防ぐ）。スタッフが再実行する
  if (opts.source === "webhook" && m.billing_rebase_error) return refuse("needs_staff", m.billing_rebase_error);
  // 入会日（＝入金日）が決まってから数える。入会完了メールと同じ日付になる
  if (m.status !== "active" || !m.join_date) return refuse("not_active_yet");
  const plan = m.frunk_plans;
  if (!plan || Number(plan.monthly_price ?? 0) <= 0) return refuse("plan_free");
  const variationId = plan.square_variation_nofee_id ?? plan.square_variation_id;
  if (!variationId) return refuse("plan_no_variation");
  if (!m.square_customer_id) return refuse("no_customer");
  // 休会の予約がある方は、停止の予約ごと作り直すことになるので自動ではやらない
  if (m.scheduled_suspend_start) return refuse("suspend_scheduled", `休会予約（${m.scheduled_suspend_start}〜）があります`);

  // ---- 開始日（最初の10日） ----
  const bd = (m.square_checkout_breakdown ?? {}) as Record<string, unknown>;
  const prepaid = Number(bd.prepaidMonths ?? 0);
  const joinYmd = String(m.join_date);
  // ⚠ ご利用開始日は「内訳に控えたもの」だけ。#234 より前の入会は入会月無料で決済済みなので、
  //   フォームの start_date を後から当てはめると1か月タダになる
  let usageStartYmd = bd.usageStartYmd ? String(bd.usageStartYmd) : null;
  if (opts.usageStart) {
    const err = usageStartError({ applyDateYmd: joinYmd, usageStartYmd: opts.usageStart });
    if (err) return refuse("usage_start_invalid", err);
    usageStartYmd = opts.usageStart;
  }
  const registeredYmd = m.billing_registered_at ? jstYmd(new Date(m.billing_registered_at)) : null;
  const start = rebaseStartDate({ joinDateYmd: joinYmd, usageStartYmd, prepaidMonths: prepaid, todayYmd: today, registeredYmd });
  if (!start.ok) return refuse("past_date", `最初の引き落とし日 ${slash(start.date)} が過ぎています`);
  const target = start.date;
  const sch = usageStartYmd ? usageStartSchedule({ applyDateYmd: joinYmd, usageStartYmd, prepaidMonths: prepaid }) : null;

  const usagePatch = (): Record<string, unknown> => {
    if (!opts.usageStart || !sch) return {};
    return { start_date: sch.usageStartYmd, ...(m.join_campaign ? { min_term_until: sch.minTermUntilYmd } : {}) };
  };
  const breakdownPatch = () => ({
    ...bd,
    ...(usageStartYmd ? { usageStartYmd } : {}),
    nextBillingYmd: target,
    billingDay: BILLING_DAY,
  });

  const markDone = async (subId: string | null, oldId: string | null, oldEnds: string | null, noop: boolean, note?: string): Promise<RebaseResult> => {
    await release({
      ...(subId ? { square_subscription_id: subId } : {}),
      billing_day: BILLING_DAY,
      billing_rebased_at: new Date().toISOString(),
      billing_rebase_error: null,
      prepay_pause_done_at: m.prepay_pause_done_at ?? new Date().toISOString(),
      square_checkout_breakdown: breakdownPatch(),
      ...usagePatch(),
    });
    const message = note
      ?? (noop
        ? `10日払いです（次回 ${slash(target)} に${monthLabel(start.billedMonthYmd)}分）`
        : `10日払いに切り替えました。次回 ${slash(target)} に${monthLabel(start.billedMonthYmd)}分${oldEnds ? `（これまでのサブスクは ${slash(oldEnds)} で終了）` : ""}`);
    if (!noop) {
      await logEvent(m.company_id, {
        event_type: "billing.rebased",
        title: `月会費を10日払いに: ${m.name ?? ""}様（${m.member_no ?? ""}）次回 ${slash(target)}（${monthLabel(start.billedMonthYmd)}分）`.slice(0, 120),
        source: "frank_billing",
        source_type: "system",
        raw_payload: { member_id: m.id, old_subscription_id: oldId, new_subscription_id: subId, start_date: target, source: opts.source },
      });
    }
    return { ok: true, noop, startDate: target, billedMonth: start.billedMonthYmd, oldSubscriptionId: oldId, newSubscriptionId: subId, oldEndsOn: oldEnds, message };
  };

  const retiredBefore = (m.square_retired_subscription_ids ?? []).map(String);
  let cancelTouched = false; // 解約（または休止の削除）に手を付けたか＝保護をかけてはいけない

  /** 入会直後の Webhook で作り直せなかったとき、決済リンクのサブスクに従来の保護をかける（翌月の一括金額の再請求を防ぐ） */
  const protectCheckoutSub = async (sub: SquareSub | null) => {
    if (opts.source !== "webhook" || !sub || cancelTouched || sub.status !== "ACTIVE" || hasCancel(sub)) return;
    if (sub.actions.some((a) => a.type === "PAUSE")) return;
    const firstBilled = sch?.firstBilledMonthYmd ?? usageStartSchedule({ applyDateYmd: joinYmd, prepaidMonths: prepaid }).firstBilledMonthYmd;
    const cycles = Math.max(0, calendarMonthsBetween(joinYmd, firstBilled) - 1);
    try {
      await sq("PUT", `/subscriptions/${encodeURIComponent(sub.id)}`, { subscription: { price_override_money: null } });
      if (cycles > 0) await sq("POST", `/subscriptions/${encodeURIComponent(sub.id)}/pause`, { pause_cycle_duration: cycles });
      await admin.from("frunk_members").update({ prepay_pause_done_at: new Date().toISOString(), square_subscription_id: sub.id }).eq("id", m.id);
    } catch (e) {
      await logEvent(m.company_id, {
        event_type: "billing.prepay_setup_failed",
        title: `⚠入会時のサブスクの保護に失敗: ${m.name ?? ""}様（${m.member_no ?? ""}）翌月の引き落としをSquareで止めてください`.slice(0, 120),
        description: errText(e),
        source: "frank_billing",
        source_type: "system",
        severity: "critical",
      });
    }
  };

  let current: SquareSub | null = null;
  try {
    // ---- Square の今の状態 ----
    const all = await searchSubs(m.square_customer_id);
    const retired = new Set(retiredBefore);
    const liveMine = all
      .filter((s) => isLive(s) && !retired.has(s.id))
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
    if (liveMine.length > 1) {
      const d = liveMine.map((s) => `${s.id.slice(0, 8)}:${s.status}:${s.start_date ?? ""}`).join(" / ");
      if (opts.source === "webhook") await protectCheckoutSub(null);
      return fail("multiple_subscriptions", `Squareに有効なサブスクが${liveMine.length}本あります（${d}）。二重引き落としにならないようSquareで確認してください`, "critical");
    }
    current = liveMine[0] ? await getSub(liveMine[0].id) : null;

    let oldId: string | null = null;
    let oldEnds: string | null = null;
    let cardId: string | null = current?.card_id ?? null;

    if (current) {
      // すでに「10日払い・まだ始まっていない・開始日が合っている」
      if (current.status === "PENDING" && current.start_date === target && !hasCancel(current)) {
        return markDone(current.id, null, null, true);
      }
      if (current.status === "PAUSED") return refuse("paused", "休止中のサブスクは自動では作り直せません");
      if (current.status === "ACTIVE" && current.monthly_billing_anchor_date === BILLING_DAY && m.billing_rebased_at) {
        if (current.charged_through_date === target) return markDone(current.id, null, null, true);
        return refuse("already_charging", `すでに10日払いで引き落としが始まっています（次回 ${slash(String(current.charged_through_date ?? ""))}）`);
      }
      if (hasCancel(current)) {
        return refuse("cancel_scheduled", `このサブスクには解約の予約があります（${current.canceled_date ?? "予約あり"}）。退会・解約の手続きを確認してください`);
      }
      if (prepaid > 0 && current.status === "ACTIVE" && current.charged_through_date && target < current.charged_through_date) {
        return refuse("overlap", `今のサブスクは ${slash(current.charged_through_date)} まで支払い済みで、新しい開始日 ${slash(target)} と重なります`);
      }

      // ---- 1. 引退させるIDを先に控える ----
      const retiredList = Array.from(new Set([...retiredBefore, current.id]));
      const { error: retireErr } = await admin.from("frunk_members").update({ square_retired_subscription_ids: retiredList }).eq("id", m.id);
      if (retireErr) return refuse("db_error", String(retireErr.message ?? retireErr));
      const unretire = async () => {
        const { error } = await admin.from("frunk_members").update({ square_retired_subscription_ids: retiredBefore }).eq("id", m.id);
        if (error) console.error("[frank-billing-day] unretire failed:", error);
      };

      // ---- 2. 解約 ----
      try {
        await sq("POST", `/subscriptions/${encodeURIComponent(current.id)}/cancel`, {});
        cancelTouched = true;
      } catch (e1) {
        // 時間切れ等でも Square 側では解約が入っていることがある。読み直して、確かに入っていればそのまま進む
        let landed = false;
        if (isTransient(e1)) {
          try {
            landed = cancelVerified(await getSub(current.id));
          } catch {
            landed = false;
          }
        }
        if (landed) {
          cancelTouched = true;
        } else if (isTransient(e1) || current.actions.length === 0) {
          await unretire();
          if (opts.source === "webhook") await protectCheckoutSub(current);
          return fail("cancel_failed", `解約できませんでした（何も変えていません）: ${errText(e1)}`);
        } else {
        // 予約済みの休止などが解約を邪魔している可能性 → 消して再挑戦。だめなら休止を戻して確かめる
        const pause = current.actions.find((a) => a.type === "PAUSE")?.effective_date ?? null;
        const resume = current.actions.find((a) => a.type === "RESUME")?.effective_date ?? null;
        cancelTouched = true;
        try {
          for (const t of ["RESUME", "PAUSE", "SWAP_PLAN", "CHANGE_BILLING_ANCHOR_DATE"]) {
            for (const a of current.actions.filter((x) => x.type === t && x.id)) {
              await sq("DELETE", `/subscriptions/${encodeURIComponent(current.id)}/actions/${encodeURIComponent(a.id)}`);
            }
          }
          await sq("POST", `/subscriptions/${encodeURIComponent(current.id)}/cancel`, {});
        } catch (e2) {
          let restoredText = "休止の予約はありませんでした";
          let severity: "warning" | "critical" = "warning";
          if (pause && resume) {
            const cycles = calendarMonthsBetween(pause, resume);
            try {
              const now = await getSub(current.id);
              if (!now.actions.some((a) => a.type === "PAUSE") && cycles > 0) {
                await sq("POST", `/subscriptions/${encodeURIComponent(current.id)}/pause`, { pause_cycle_duration: cycles });
              }
              const check = await getSub(current.id);
              const back = check.actions.find((a) => a.type === "RESUME")?.effective_date ?? null;
              if (back === resume) restoredText = `休止（${slash(pause)}〜${slash(resume)}）を元に戻しました`;
              else {
                restoredText = `⚠休止が元どおりか確認できません（再開 ${back ?? "なし"}／元 ${resume}）。${slash(pause)}の引き落としをSquareで必ず止めてください`;
                severity = "critical";
              }
            } catch (e3) {
              restoredText = `⚠休止を戻せませんでした（${errText(e3)}）。${slash(pause)}の引き落としをSquareで必ず止めてください`;
              severity = "critical";
            }
          }
          await unretire();
          return fail("cancel_failed", `${errText(e1)} / ${errText(e2)} / ${restoredText}`, severity);
        }
        }
      }

      // 解約を確かめる（もう請求しない日付で解約日が付いたか）
      const after = await getSub(current.id);
      if (!cancelVerified(after)) {
        await unretire();
        return fail(
          "cancel_unverified",
          `解約後も請求が残る形です（status=${after.status}・解約日 ${after.canceled_date ?? "なし"}・開始 ${after.start_date ?? "-"}・支払済 ${after.charged_through_date ?? "-"}）。新しいサブスクは作っていません。Squareで確認してください`,
          "critical",
        );
      }
      for (const a of after.actions.filter((x) => ["RESUME", "SWAP_PLAN"].includes(x.type) && x.id)) {
        try {
          await sq("DELETE", `/subscriptions/${encodeURIComponent(after.id)}/actions/${encodeURIComponent(a.id)}`);
        } catch {
          /* 解約日が先に来るので害はない */
        }
      }
      oldId = current.id;
      oldEnds = after.canceled_date;
    } else {
      // 生きているサブスクが無い: 前回「解約はできたが作成に失敗」なら、作成から続ける。
      // ⚠ 続けてよいのは「いちばん新しいサブスクが、自分で引退させて・確かに解約済み」のときだけ。
      //   スタッフが止めたサブスク（引退リストに無い）が一番新しいなら、勝手に引き落としを復活させない
      const newest = [...all].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))[0];
      if (!newest || !retired.has(newest.id)) {
        return refuse(opts.source === "webhook" ? "no_subscription_yet" : "no_subscription", "Squareにこの方の有効なサブスクがありません");
      }
      const ours = await getSub(newest.id);
      if (!cancelVerified(ours) || (ours.canceled_date && ours.canceled_date > target)) {
        return fail(
          "retired_not_canceled",
          `引退させたサブスクがまだ請求する形です（status=${ours.status}・解約日 ${ours.canceled_date ?? "なし"}）。新しいサブスクは作っていません。Squareで確認してください`,
          "critical",
        );
      }
      oldId = ours.id;
      oldEnds = ours.canceled_date;
      cardId = cardId ?? ours.card_id;
      cancelTouched = true;
    }

    // ---- 3. 新しいサブスク ----
    const leaveCancel = m.scheduled_leave_date ? squareCancelDateForLeave(m.scheduled_leave_date) : null;
    if (leaveCancel && leaveCancel <= target) {
      // 最初の引き落としより前に退会する＝新しいサブスクは要らない
      return markDone(null, oldId, oldEnds, false, `退会予定のため新しい自動引き落としは作りませんでした${oldEnds ? `（これまでのサブスクは ${slash(oldEnds)} で終了）` : ""}`);
    }
    if (!cardId) {
      const cards = (await sq("GET", `/cards?customer_id=${encodeURIComponent(m.square_customer_id)}`)).cards as
        | Array<{ id?: string; enabled?: boolean }>
        | undefined;
      cardId = (cards ?? []).find((c) => c.enabled !== false)?.id ?? null;
    }
    if (!cardId) return fail("no_card", "保存カードが見つかりません（これまでのサブスクは解約済み・引き落としは止まっています）");

    let newId = "";
    try {
      const json = await sq("POST", "/subscriptions", {
        // 同じ会員・同じ旧サブスク・同じ開始日なら何度送っても1本（Squareの上限45文字に収まる長さ）
        idempotency_key: `rb10-${m.id.slice(0, 8)}-${(oldId ?? "none").slice(0, 10)}-${target}`,
        location_id: locationId,
        plan_variation_id: variationId,
        customer_id: m.square_customer_id,
        card_id: cardId,
        start_date: target,
        monthly_billing_anchor_date: BILLING_DAY,
        timezone: "Asia/Tokyo",
        ...(leaveCancel ? { canceled_date: leaveCancel } : {}),
        source: { name: "FRANK GOLF 10日払い" },
      });
      const created = (json.subscription ?? {}) as Record<string, unknown>;
      newId = String(created.id ?? "");
      // 同じ idempotency_key の古い応答（すでに解約されたサブスク）が返ってきたら成功にしない
      if (newId && (String(created.status ?? "").toUpperCase() === "CANCELED" || (!leaveCancel && created.canceled_date))) {
        return fail("create_returned_canceled", `作成したはずのサブスク ${newId.slice(0, 8)} が解約済みで返りました。Squareで確認してください`, "critical");
      }
    } catch (e) {
      return fail("create_failed", `新しいサブスクを作れませんでした（これまでのサブスクは解約済み・引き落としは止まっています。再実行で作成から続けます）: ${errText(e)}`);
    }
    if (!newId) return fail("create_failed", "サブスクIDが返りませんでした（再実行で作成から続けます）");
    return markDone(newId, oldId, oldEnds, false);
  } catch (e) {
    console.error("[frank-billing-day] rebase failed:", e);
    if (opts.source === "webhook") await protectCheckoutSub(current);
    return fail("square_error", errText(e));
  }
}

/**
 * 取りこぼしの拾い直し（10分ごとの cron・#235）
 *
 * 入会の Webhook は応答後に作り直しを走らせるので、関数が途中で止まる・Square 側の反映が遅い等で
 * 「入会したのに10日払いになっていない」方が残りうる。その方だけを1回あたり少人数ずつ拾う。
 *
 * 対象: active・カード自動課金あり・まだ作り直していない・失敗の記録なし・直近14日にカード登録
 *       ・prepay_pause_done_at が空（＝10日払い導入後の入会。導入前の会員は店舗画面の一括ボタンで切り替える）
 */
export async function runBillingDaySweep(limit = 2): Promise<Record<string, unknown>> {
  if (!token()) return { skipped: "square_env_missing" };
  const admin = createAdmin();
  const cutoff = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("frunk_members")
    .select("id")
    .eq("status", "active")
    .eq("billing_status", "active")
    .not("square_customer_id", "is", null)
    .is("billing_rebased_at", null)
    .is("billing_rebase_error", null)
    .is("prepay_pause_done_at", null)
    .is("deleted_at", null)
    .gte("billing_registered_at", since)
    .or(`billing_rebase_claimed_at.is.null,billing_rebase_claimed_at.lt.${cutoff}`)
    .order("billing_registered_at", { ascending: true })
    .limit(limit);
  if (error) return { error: error.message };
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  // 何度やっても断られる理由（人が見るもの）は記録して、次から拾わない（2枠を14日間ふさがない）
  const PERMANENT = new Set(["paused", "suspend_scheduled", "cancel_scheduled", "plan_no_variation", "plan_free", "no_customer", "past_date", "overlap", "already_charging"]);
  for (const row of (data ?? []) as Array<{ id: string }>) {
    try {
      const r = await rebaseToBillingDay(String(row.id), { source: "webhook" });
      results.push({ id: row.id, ok: r.ok, ...(r.ok ? {} : { error: r.error }) });
      if (!r.ok && PERMANENT.has(r.error)) {
        await admin
          .from("frunk_members")
          .update({ billing_rebase_error: `自動では10日払いにできません（${r.error}${r.detail ? `: ${r.detail}` : ""}）`.slice(0, 500) })
          .eq("id", row.id);
      }
    } catch (e) {
      results.push({ id: row.id, ok: false, error: errText(e) });
    }
  }
  return { checked: results.length, results };
}
