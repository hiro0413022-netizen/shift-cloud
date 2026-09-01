"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { generateToken, hashToken } from "@/lib/intake";
import { logAudit } from "@/lib/kernel";
import { FRUNK_STORE_CODE } from "@/lib/frunk";
import { requireStoreAccess, FRANK_STORE_ID } from "@/lib/store-scope";
import { buildApprovalMail, sendFrankMail } from "@/lib/frank-mail";
import {
  pauseSubscription,
  resumeSubscription,
  swapSubscriptionPlan,
  chargeCardOnFile,
  cancelSubscription,
  uncancelSubscription,
} from "@/lib/frank-square";
import {
  canLeaveOn,
  canSuspendFrom,
  earliestLeaveDate,
  earliestSuspendStart,
  monthEndLabel,
  monthFromLabel,
} from "@yozan/core/frank-membership";
import { planChangeProration } from "@/lib/frank-billing-pure";
import { jstYmd } from "@/lib/jst";
import { readName } from "@/lib/name";
import { normalizeAddress } from "@/lib/address";

const GENESIS_URL = process.env.GENESIS_URL || "https://yozan-genesis.vercel.app";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = str(v).replace(/[^\d-]/g, "");
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
// JST基準の「今日」。toISOString() は UTC のため JST 0:00〜9:00 に前日となるバグがあった（#136）
const today = () => jstYmd();

async function frunkStoreId(admin: ReturnType<typeof createAdmin>, companyId: string): Promise<string | null> {
  const { data } = await admin
    .from("stores").select("id").eq("company_id", companyId).eq("code", FRUNK_STORE_CODE).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** FRANK姫路に配属された人だけがこの画面を操作できる（#134・店舗またぎ廃止）。
 *  UIを隠すだけでは守れないので、全アクションの先頭で必ず通す。 */
async function requireFrankActor() {
  const actor = await requireReceptionActor();
  requireStoreAccess(actor, FRANK_STORE_ID);
  return actor;
}

/** 操作後に戻る画面（#139）。会員カード（/frunk/<id>）から操作したらそこへ返す。
 *  戻り先は必ず /frunk 配下に限定する（外部URLへ飛ばされないように）。 */
function backTo(formData: FormData): string {
  const b = str(formData.get("back"));
  return /^\/frunk(\/[0-9a-fA-F-]{36})?$/.test(b) ? b : "/frunk";
}

/** 一覧・会員カードの両方を作り直す（どちらから操作しても最新になる） */
function revalidateMember(id?: string) {
  revalidatePath("/frunk");
  if (id) revalidatePath(`/frunk/${id}`);
}

const GENDERS = ["male", "female", "other", "unknown"];
const PAYMENT_METHODS = ["cash", "credit", "bank", "sb_payment", "other"];

/** 会員カードのプロフィール編集（#139）。
 *  氏名・住所・生年月日は共通入力（NameFields / AddressFields / BirthDateInput）から受ける。 */
export async function updateMemberProfile(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;

  const { name, nameKana } = readName(formData);
  const addr = normalizeAddress(orNull(formData.get("prefecture")), orNull(formData.get("address1")));
  const gender = str(formData.get("gender"));
  const pay = str(formData.get("payment_method"));

  const patch: Record<string, unknown> = {
    name_kana: nameKana,
    birth_date: orNull(formData.get("birth_date")),
    gender: GENDERS.includes(gender) ? gender : null,
    postal_code: orNull(formData.get("postal_code")),
    // frunk_members は prefecture 列を持たない（住所1に都道府県から入れる）
    address1: `${addr.prefecture ?? ""}${addr.address1 ?? ""}`.trim() || null,
    phone: orNull(formData.get("phone")),
    email: orNull(formData.get("email")),
    occupation: orNull(formData.get("occupation")),
    contact_method: orNull(formData.get("contact_method")),
    payment_method: PAYMENT_METHODS.includes(pay) ? pay : null,
    note: orNull(formData.get("note")),
    updated_at: new Date().toISOString(),
  };
  if (name) patch.name = name; // NOT NULL列を空で潰さない

  const { error } = await admin
    .from("frunk_members")
    .update(patch)
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID); // 店舗スコープ（#134）
  await logAudit(actor, "frunk.member.update", "frunk_members", id, null, patch);
  revalidateMember(id);
  if (error) redirect(`/frunk/${id}?err=` + encodeURIComponent(`保存できませんでした: ${error.message}`));
  redirect(`/frunk/${id}?msg=` + encodeURIComponent("会員情報を保存しました"));
}

// ---- プラン管理 ----
export async function createPlan(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const name = str(formData.get("name"));
  if (!name) redirect("/frunk?err=" + encodeURIComponent("プラン名を入力してください"));
  await admin.from("frunk_plans").insert({
    company_id: actor.companyId,
    store_id: await frunkStoreId(admin, actor.companyId),
    name,
    monthly_price: intOrNull(formData.get("monthly_price")),
    joining_fee: intOrNull(formData.get("joining_fee")),
    max_bookings_per_day: intOrNull(formData.get("max_bookings_per_day")),
    max_bookings_per_week: intOrNull(formData.get("max_bookings_per_week")),
    sort_order: intOrNull(formData.get("sort_order")) ?? 0,
    note: orNull(formData.get("note")),
  });
  revalidatePath("/frunk");
}

export async function updatePlan(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await admin.from("frunk_plans").update({
    name: str(formData.get("name")) || "（無名プラン）",
    monthly_price: intOrNull(formData.get("monthly_price")),
    joining_fee: intOrNull(formData.get("joining_fee")),
    max_bookings_per_day: intOrNull(formData.get("max_bookings_per_day")),
    max_bookings_per_week: intOrNull(formData.get("max_bookings_per_week")),
    sort_order: intOrNull(formData.get("sort_order")) ?? 0,
    active: str(formData.get("active")) === "1",
    note: orNull(formData.get("note")),
  }).eq("id", id).eq("company_id", actor.companyId); // 会社スコープ（#134）
  revalidatePath("/frunk");
}

export async function deletePlan(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await admin.from("frunk_plans").update({ deleted_at: new Date().toISOString(), active: false })
    .eq("id", id).eq("company_id", actor.companyId); // 会社スコープ（#134）
  revalidatePath("/frunk");
}

/**
 * 会員番号の案内メールを送る（承認時と、あとからの再送で共用）。
 * 送れなかった理由を必ず返す＝スタッフが「送ったつもり」にならないようにする
 * （2026-08-11: frankgolf.jp のResend認証漏れでメールが1通も出ていなかった実例あり）。
 */
async function sendApprovalMailTo(
  admin: ReturnType<typeof createAdmin>,
  memberId: string,
  memberNo: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data: m } = await admin
    .from("frunk_members")
    .select("name, email, joining_fee_waived, frunk_plans(name, monthly_price, joining_fee)")
    .eq("id", memberId)
    .eq("store_id", FRANK_STORE_ID) // 店舗スコープ（#134）
    .maybeSingle();
  const email = (m?.email as string | null) ?? null;
  if (!email) return { ok: false, reason: "メールアドレスが登録されていないため送れません（電話・LINEでお伝えください）" };

  const plan = (m as unknown as {
    frunk_plans: { name: string; monthly_price: number | null; joining_fee: number | null } | null;
  } | null)?.frunk_plans;
  const price = Number(plan?.monthly_price ?? 0);
  const joinFee = m?.joining_fee_waived ? 0 : Number(plan?.joining_fee ?? 0);
  const mail = buildApprovalMail({
    name: String(m?.name ?? ""),
    memberNo,
    planName: plan?.name ?? null,
    monthlyFeeTaxIncluded: price > 0 ? Math.round(price * 1.1) : 0,
    joiningFeeTaxIncluded: joinFee > 0 ? Math.round(joinFee * 1.1) : 0,
  });
  const r = await sendFrankMail({ to: email, subject: mail.subject, text: mail.text });
  if (r.skipped) return { ok: false, reason: "メール送信が未設定です（Vercel member-os の RESEND_API_KEY / FRANK_MAIL_FROM）" };
  if (!r.ok) return { ok: false, reason: `送信に失敗しました（${r.error ?? "原因不明"}）` };
  return { ok: true };
}

// ---- 入会申込の承認 / 却下 ----
export async function approveSignup(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  // 採番と更新（genesis assignMemberNo と同様、unique index 衝突は次番号でリトライ #136）。
  // 番号の母数は genesis と同じ company 単位で数える（store で数えると2つの実装が同じ番号を発行しうる）
  const manualNo = str(formData.get("member_no"));
  let memberNo = "";
  let updateErr: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (manualNo) {
      memberNo = manualNo;
    } else {
      const { count } = await admin
        .from("frunk_members").select("id", { count: "exact", head: true })
        .eq("company_id", actor.companyId).not("member_no", "is", null);
      memberNo = `FR${String((count ?? 0) + 1 + attempt).padStart(4, "0")}`;
    }
    const { error } = await admin.from("frunk_members").update({
      status: "active",
      member_no: memberNo,
      join_date: str(formData.get("start_date")) || today(),
      reviewed_by: actor.staffId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID); // 店舗スコープ（#134）
    if (!error) { updateErr = null; break; }
    updateErr = error.message;
    // 一意制約（同じ番号を並行採番）だけリトライ。手入力番号の衝突はそのまま伝える
    if (manualNo || !String(error.code ?? "").includes("23505")) break;
  }
  if (updateErr) {
    redirect("/frunk?err=" + encodeURIComponent(
      `承認に失敗しました（${memberNo ? `会員番号 ${memberNo} で` : ""}保存できませんでした: ${updateErr}）。もう一度お試しください。`,
    ));
  }
  await logAudit(actor, "frunk.signup_approve", "frunk_members", null, null, { id, member_no: memberNo });

  // 承認メール（会員番号の通知＋カード登録の案内 #123）。送信失敗で承認は落とさないが、
  // 「送れていない」ことは画面で必ず伝える（黙って落とすと会員番号が誰にも届かない）
  const mail = await sendApprovalMailTo(admin, id, memberNo);
  if (!mail.ok) {
    redirect("/frunk?err=" + encodeURIComponent(
      `${memberNo} で承認しました。ただし会員番号のメールは${mail.reason} 会員番号を口頭・LINEでお伝えいただくか、原因を直してから「承認メール再送」を押してください。`,
    ));
  }
  revalidatePath("/frunk");
}

/** 承認メール（会員番号の案内）の再送。承認は1回きりなので、届かなかった時の救済用 */
export async function resendApprovalMail(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const dest = backTo(formData); // 会員カードから操作したらそこへ戻す（#139）
  const id = str(formData.get("id"));
  if (!id) return;

  const { data: m } = await admin
    .from("frunk_members")
    .select("member_no, name, status")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID) // 店舗スコープ（#134）
    .maybeSingle();
  const memberNo = m?.member_no ? String(m.member_no) : "";
  if (!memberNo) {
    redirect(`${dest}?err=` + encodeURIComponent("会員番号が未発行です。先に入会申込を承認してください"));
  }

  const r = await sendApprovalMailTo(admin, id, memberNo);
  await logAudit(actor, "frunk.approval_mail_resend", "frunk_members", null, null, { id, member_no: memberNo, ok: r.ok });
  redirect(
    r.ok
      ? `${dest}?msg=` + encodeURIComponent(`${String(m?.name ?? "")}様へ会員番号（${memberNo}）の案内メールを再送しました`)
      : `${dest}?err=` + encodeURIComponent(`再送できませんでした: ${r.reason ?? ""}`),
  );
}

export async function rejectSignup(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await admin.from("frunk_members").update({
    status: "rejected", reviewed_by: actor.staffId, reviewed_at: new Date().toISOString(),
  }).eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID); // 店舗スコープ（#134）
  revalidatePath("/frunk");
}

/** 重要説明事項（#129）: 入力があると予約カレンダーの予約セルに⚠が付く。空で保存=解除 */
export async function saveAlertNote(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const dest = backTo(formData); // 会員カードから操作したらそこへ戻す（#139）
  const id = str(formData.get("id"));
  if (!id) return;
  const note = str(formData.get("alert_note"));
  await admin
    .from("frunk_members")
    .update({ alert_note: note || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID); // 店舗スコープ（#134）
  await logAudit(actor, "frunk.alert_note.save", "frunk_members", id, null, { alert_note: note || null });
  revalidateMember(id);
  revalidatePath("/dashboard");
  redirect(`${dest}?msg=` + encodeURIComponent(note ? "重要説明事項を保存しました（カレンダーに⚠が付きます）" : "重要説明事項を解除しました"));
}

// ---- 会員ステータス変更（休会・復帰・退会） ----
//
// 【2026-09-01 ユーザー確定・#192】退会と休会は「先の日付で受け付ける」。
//   退会 = 月末。申込月の翌月末より前は選べない（9月末退会なら8月末までの申し出）
//   休会 = 月初。当月10日までの申し出で翌月から、11日以降は翌々月から
//   受付日の判定は @yozan/core/frank-membership に置いてある。画面もサーバーも同じ関数を通すこと。
//
// 【お金】以前は退会してもSquareの自動課金が止まらず「ダッシュボードで解約してください」と
//   出すだけだった。見落とすと翌月も引き落とされるので、受付と同時に Square にも
//   同じ日付で解約/停止を予約する。cronが遅れてもお金は正しい日付で止まる。
//
//   退会 → canceled_date = 退会日（その月まで請求・翌月から停止）
//   休会 → pause_effective_date = 休会開始日（休会費2,200円税込は店頭徴収）
//   復帰 → resume（即時）
export async function setMemberStatus(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const dest = backTo(formData); // 会員カードから操作したらそこへ戻す（#139）
  const id = str(formData.get("id"));
  const to = str(formData.get("to"));
  if (!id || !["active", "suspended", "left"].includes(to)) return;
  const now = today();

  const { data: m } = await admin
    .from("frunk_members")
    .select("member_no, name, status, min_term_until, square_subscription_id, billing_status")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID) // 店舗スコープ（#134）
    .maybeSingle();
  if (!m) redirect(`${dest}?err=` + encodeURIComponent("会員が見つかりません"));
  const subId = m.square_subscription_id ? String(m.square_subscription_id) : null;
  const who = `${String(m.name ?? "")}様`;

  // ---- 復帰（即時） ----
  if (to === "active") {
    await admin
      .from("frunk_members")
      .update({ status: "active", suspend_end: now, scheduled_suspend_start: null, updated_at: new Date().toISOString() })
      .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID);
    const r = subId ? await resumeSubscription(subId) : null;
    await logAudit(actor, "frunk.status.active", "frunk_members", id, null, { square: r });
    revalidateMember(id);
    if (r && !r.ok && !r.skipped) {
      redirect(`${dest}?err=` + encodeURIComponent(
        `${who}を復帰させましたが、Squareの課金再開に失敗しました。ダッシュボードで確認してください（${m.member_no ?? ""}）`,
      ));
    }
    redirect(`${dest}?msg=` + encodeURIComponent(`${who}を復帰させました。${subId ? "月会費の自動課金も再開します。" : ""}`));
  }

  // ---- 休会（開始月を指定して予約） ----
  if (to === "suspended") {
    const from = str(formData.get("suspend_start")) || earliestSuspendStart(now);
    if (!canSuspendFrom(now, from)) {
      redirect(`${dest}?err=` + encodeURIComponent(
        `その休会開始日は受け付けられません。10日までの申し出で翌月から、11日以降は翌々月からです（最短 ${monthFromLabel(earliestSuspendStart(now))}）`,
      ));
    }
    await admin
      .from("frunk_members")
      .update({ scheduled_suspend_start: from, scheduled_leave_date: null, updated_at: new Date().toISOString() })
      .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID);

    const r = subId ? await pauseSubscription(subId, from) : null;
    await logAudit(actor, "frunk.status.suspend_reserve", "frunk_members", id, null, { from, square: r });
    revalidateMember(id);

    const tail = !subId
      ? "（カード自動課金は未登録の会員です）"
      : r?.ok
        ? `月会費の自動課金は ${monthFromLabel(from)} 停止します。`
        : r?.skipped
          ? "⚠Square未接続のため、課金停止はダッシュボードで行ってください。"
          : "⚠Squareの課金停止に失敗しました。ダッシュボードで確認してください。";
    const param = tail.startsWith("⚠") ? "err" : "msg";
    redirect(`${dest}?${param}=` + encodeURIComponent(
      `${who}の休会を ${monthFromLabel(from)} で受け付けました。それまでは通常どおりご利用いただけます。${tail} 休会費2,200円（税込）は店頭で申し受けます。`,
    ));
  }

  // ---- 退会（退会日＝月末を指定して予約） ----
  const on = str(formData.get("leave_date")) || earliestLeaveDate(now);
  if (!canLeaveOn(now, on)) {
    redirect(`${dest}?err=` + encodeURIComponent(
      `その退会日は受け付けられません。退会は月末で、申し出の翌月末からです（最短 ${monthEndLabel(earliestLeaveDate(now))}）`,
    ));
  }
  // キャンペーン入会は6か月継続（#131）: 期間内の退会はスタッフに警告（ブロックはしない・特例対応可）
  const minTermWarn =
    m.min_term_until && String(m.min_term_until) > on
      ? `⚠ この会員はキャンペーン入会の継続期間中です（${String(m.min_term_until)}まで）。`
      : "";

  await admin
    .from("frunk_members")
    .update({ scheduled_leave_date: on, scheduled_suspend_start: null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID);

  const r = subId ? await cancelSubscription(subId, on) : null;
  await logAudit(actor, "frunk.status.leave_reserve", "frunk_members", id, null, { on, square: r });
  revalidateMember(id);

  const tail = !subId
    ? "（カード自動課金は未登録の会員です）"
    : r?.ok
      ? `月会費の自動課金は ${monthEndLabel(on)} で解約されます（その月までは請求されます）。`
      : r?.skipped
        ? "⚠Square未接続のため、解約はダッシュボードで行ってください。"
        : "⚠Squareの解約に失敗しました。ダッシュボードで解約してください。";
  const param = tail.startsWith("⚠") || minTermWarn ? "err" : "msg";
  redirect(`${dest}?${param}=` + encodeURIComponent(
    `${minTermWarn}${who}の退会を ${monthEndLabel(on)} で受け付けました。それまでは通常どおりご利用いただけます。${tail}`,
  ));
}

/**
 * 月会費の自動課金だけを解約する（#192）。
 *
 * 退会でもプラン変更でもなく「この人のカード引き落としだけ止めたい」場面がある
 * （スタッフ・モニターなど0円扱いに切り替えたのにサブスクだけ残っている等）。
 * Square の解約は即時ではなく **現在の請求サイクルの終わり** で効く。
 */
export async function stopSquareBilling(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const dest = backTo(formData);
  const id = str(formData.get("id"));
  if (!id) return;

  const { data: m } = await admin
    .from("frunk_members")
    .select("name, member_no, square_subscription_id")
    .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID).maybeSingle();
  if (!m) redirect(`${dest}?err=` + encodeURIComponent("会員が見つかりません"));
  const subId = m.square_subscription_id ? String(m.square_subscription_id) : null;
  if (!subId) redirect(`${dest}?err=` + encodeURIComponent("この会員にはカードの自動課金が登録されていません"));

  const r = await cancelSubscription(subId);
  await logAudit(actor, "frunk.square.stop_billing", "frunk_members", id, null, { square: r });
  revalidateMember(id);
  if (r.ok) {
    redirect(`${dest}?msg=` + encodeURIComponent(
      `${String(m.name ?? "")}様の月会費の自動課金を解約しました（現在の請求期間の終わりで停止します）。`,
    ));
  }
  redirect(`${dest}?err=` + encodeURIComponent(
    r.skipped
      ? "Square未接続のため解約できませんでした。ダッシュボードで解約してください。"
      : `解約できませんでした。Squareダッシュボードで確認してください（${m.member_no ?? ""}）`,
  ));
}

/** 退会・休会の予約を取り消す（お客様の気が変わった／入力ミス） */
export async function cancelScheduledChange(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const dest = backTo(formData);
  const id = str(formData.get("id"));
  const kind = str(formData.get("kind")); // "leave" | "suspend"
  if (!id || !["leave", "suspend"].includes(kind)) return;

  const { data: m } = await admin
    .from("frunk_members")
    .select("name, square_subscription_id")
    .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID).maybeSingle();
  if (!m) redirect(`${dest}?err=` + encodeURIComponent("会員が見つかりません"));
  const subId = m.square_subscription_id ? String(m.square_subscription_id) : null;

  await admin
    .from("frunk_members")
    .update(
      kind === "leave"
        ? { scheduled_leave_date: null, updated_at: new Date().toISOString() }
        : { scheduled_suspend_start: null, updated_at: new Date().toISOString() },
    )
    .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID);

  // Square側の予約も戻す（退会=解約日を消す／休会=停止を取り消して再開）
  const r = subId ? (kind === "leave" ? await uncancelSubscription(subId) : await resumeSubscription(subId)) : null;
  await logAudit(actor, "frunk.status.schedule_cancel", "frunk_members", id, null, { kind, square: r });
  revalidateMember(id);

  const bad = r && !r.ok && !r.skipped;
  redirect(
    `${dest}?${bad ? "err" : "msg"}=` +
      encodeURIComponent(
        `${String(m.name ?? "")}様の${kind === "leave" ? "退会" : "休会"}予約を取り消しました。` +
          (bad ? "⚠Square側の自動課金が戻っているかダッシュボードで確認してください。" : subId ? "月会費の自動課金も元に戻します。" : ""),
      ),
  );
}

// ---- プラン変更（#124） ----
// 決定（2026-08-10）: 差額（税込）を4分割し、変更した週から月末までの残り週数分をその場でカードに請求。
// 翌請求から新プラン満額（Squareのスワップは入会金なしバリエーション＝入会金を二重請求しない）。
// 値下げは請求0円（返金しない）。カード未登録なら差額は店頭徴収の案内を出す。
export async function changePlan(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const dest = backTo(formData); // 会員カードから操作したらそこへ戻す（#139）
  const id = str(formData.get("id"));
  const newPlanId = str(formData.get("plan_id"));
  if (!id || !newPlanId) return;

  const [{ data: m }, { data: newPlan }] = await Promise.all([
    admin.from("frunk_members")
      .select("id, member_no, name, plan_id, square_subscription_id, square_customer_id, billing_status, frunk_plans(monthly_price)")
      .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID).maybeSingle(), // 店舗スコープ（#134）
    admin.from("frunk_plans")
      .select("id, name, monthly_price, square_variation_nofee_id")
      .eq("id", newPlanId).eq("company_id", actor.companyId).is("deleted_at", null).maybeSingle(),
  ]);
  if (!m || !newPlan) redirect(`${dest}?err=` + encodeURIComponent("会員またはプランが見つかりません"));
  if (String(m.plan_id) === String(newPlan.id)) redirect(`${dest}?err=` + encodeURIComponent("同じプランです"));

  const oldPrice = Number((m as unknown as { frunk_plans: { monthly_price: number | null } | null }).frunk_plans?.monthly_price ?? 0);
  const newPrice = Number(newPlan.monthly_price ?? 0);
  const jstDay = Number(new Date(Date.now() + 9 * 3600_000).toISOString().slice(8, 10));
  const pro = planChangeProration({ oldMonthlyExTax: oldPrice, newMonthlyExTax: newPrice, jstDayOfMonth: jstDay });

  await admin.from("frunk_members").update({ plan_id: newPlan.id, updated_at: new Date().toISOString() })
    .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID); // 店舗スコープ（#134）
  await logAudit(actor, "frunk.plan_change", "frunk_members", null, null, {
    id, from: m.plan_id, to: newPlan.id, charge: pro.chargeTaxIncluded, weeks: pro.weeks,
  });

  const notes: string[] = [`${String(m.name)}様を「${String(newPlan.name)}」に変更しました。`];

  // Square: 翌請求から新プラン額へ
  const subId = m.square_subscription_id ? String(m.square_subscription_id) : null;
  if (subId && newPrice === 0) {
    // 0円プラン（スタッフ・モニター等）に変えたら、月会費の自動課金そのものを解約する（#192）。
    // ここを swap で済ませると 0円のバリエーションが無いので **旧プランの金額のまま落ち続ける**。
    const r = await cancelSubscription(subId);
    if (r.ok) notes.push("月会費の自動課金を解約しました（現在の請求期間の終わりで停止します）。");
    else if (r.skipped) notes.push("⚠Square未接続のため、自動課金の解約はダッシュボードで行ってください。");
    else notes.push("⚠Squareの自動課金を解約できませんでした。ダッシュボードで解約してください。");
  } else if (subId && newPlan.square_variation_nofee_id) {
    const r = await swapSubscriptionPlan(subId, String(newPlan.square_variation_nofee_id));
    if (r.ok) notes.push("翌月から新プランの月会費が自動課金されます。");
    else if (r.skipped) notes.push("⚠Square未接続のため、プラン差し替えはダッシュボードで行ってください。");
    else notes.push("⚠Squareのプラン差し替えに失敗しました。ダッシュボードで確認してください。");
  } else if (subId) {
    notes.push("⚠新プランのSquare設定（入会金なしバリエーション）が未登録のため、差し替えはダッシュボードで行ってください。");
  } else {
    notes.push("カード自動課金は未登録です（店頭払いの会員）。");
  }

  // 当月差額（アップグレードのみ・週割4分割×残り週数）
  if (pro.chargeTaxIncluded > 0) {
    const custId = m.square_customer_id ? String(m.square_customer_id) : null;
    const label = `差額 ${pro.chargeTaxIncluded.toLocaleString()}円（税込・残り${pro.weeks}週分）`;
    if (custId) {
      const r = await chargeCardOnFile({
        customerId: custId,
        amountTaxIncluded: pro.chargeTaxIncluded,
        note: `プラン変更差額 残${pro.weeks}週（${String(m.member_no ?? "")}）`,
      });
      if (r.ok) notes.push(`当月の${label}を登録カードに請求しました。`);
      else notes.push(`⚠カード請求できませんでした。当月の${label}を店頭で徴収してください。`);
    } else {
      notes.push(`当月の${label}を店頭で徴収してください。`);
    }
  }

  const param = notes.some((n) => n.startsWith("⚠")) ? "err" : "msg";
  redirect(`${dest}?${param}=` + encodeURIComponent(notes.join(" ")));
}

// ---- 入会フォームURL発行 ----
export async function issueSignupToken(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const storeId = await frunkStoreId(admin, actor.companyId);
  await admin.from("frunk_signup_tokens").update({ active: false })
    .eq("company_id", actor.companyId).eq("active", true);
  const raw = generateToken();
  await admin.from("frunk_signup_tokens").insert({
    company_id: actor.companyId, store_id: storeId,
    token_hash: hashToken(raw), label: orNull(formData.get("label")) ?? "FRANK 入会タブレット",
  });
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  redirect(`/frunk?signup_url=${encodeURIComponent(`${proto}://${host}/join/${raw}`)}`);
}

// ---- 入会申込の決済確認（#188） ----
//
// 「承認して会員化」は決済が済んでいるかに関係なく押せた。Web入会（#129）は入金Webhookで
// 自動的に確定するので、ここに残っている pending は「まだ払っていない人」か
// 「Webhookが届かなかった人」のどちらかで、**画面では見分けが付かなかった**（2026-09-01 ユーザー指摘）。
// Square の取引そのものを見に行き、結果を必ず画面に返す。
// Square env は yozan-genesis にしかないので、照会は genesis の公開APIに投げる。

type JoinPayment = { orderId: string; amount: number; at: string | null; via: string };
type JoinPaymentStatus = {
  ok?: boolean;
  checked?: boolean;
  paid?: boolean;
  payments?: JoinPayment[];
  expected?: number;
  amountMatches?: boolean;
  memberNo?: string | null;
  hint?: string;
  error?: string;
};

const yen = (n: number) => `${Number(n).toLocaleString()}円`;
const jstAt = (iso: string | null) =>
  iso ? new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 16) : "";

function describePayments(st: JoinPaymentStatus): string {
  const list = st.payments ?? [];
  const total = list.reduce((a, p) => a + p.amount, 0);
  const detail = list.map((p) => `${jstAt(p.at)} ${yen(p.amount)}`).join(" / ");
  const expected = Number(st.expected ?? 0);
  const gap =
    expected > 0 && total !== expected
      ? `　⚠ 請求予定額（${yen(expected)}）と一致しません。Squareでご確認ください。`
      : "";
  return `${detail}${gap}`;
}

async function askGenesis(memberId: string, confirm: boolean): Promise<JoinPaymentStatus & { status?: JoinPaymentStatus }> {
  try {
    const res = await fetch(`${GENESIS_URL}/api/public/frank/admin/join-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: memberId, ...(confirm ? { confirm: true } : {}) }),
      cache: "no-store",
    });
    return (await res.json().catch(() => ({}))) as JoinPaymentStatus;
  } catch (e) {
    console.error("[frunk] join-payment lookup failed:", e);
    return { ok: false, error: "決済の照会に失敗しました（通信）" };
  }
}

/** Squareの入金を照会して結果を表示するだけ（何も書き換えない） */
export async function checkJoinPayment(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const dest = backTo(formData);
  const id = str(formData.get("id"));
  if (!id) return;
  // 他店・他社の申込を照会させない（画面を隠すだけでは守れない・#134）
  const { data: m } = await admin
    .from("frunk_members").select("id, name")
    .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID).maybeSingle();
  if (!m) redirect(`${dest}?err=` + encodeURIComponent("対象の申込が見つかりません"));

  const st = await askGenesis(id, false);
  await logAudit(actor, "frunk.join_payment.check", "frunk_members", id, null, { paid: !!st.paid });
  if (st.error) redirect(`${dest}?err=` + encodeURIComponent(`決済を確認できませんでした: ${st.error}`));
  if (st.paid) {
    redirect(
      `${dest}?msg=` +
        encodeURIComponent(`✅ Squareで入金を確認しました（${describePayments(st)}）。「入金を確認して入会を確定」を押すと会員番号を発行します。`),
    );
  }
  redirect(
    `${dest}?err=` +
      encodeURIComponent(
        st.checked
          ? `Squareに入金が見つかりませんでした。${st.hint ?? ""} 現金・振込でお受けした場合は「承認して会員化」で進めてください。`
          : `Squareに照会できませんでした。${st.hint ?? ""}`,
      ),
  );
}

/** 入金が確認できたときだけ、Web入会と同じ手順（会員番号・控えPDF・完了メール）で確定する */
export async function confirmJoinPayment(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const dest = backTo(formData);
  const id = str(formData.get("id"));
  if (!id) return;
  const { data: m } = await admin
    .from("frunk_members").select("id, name")
    .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID).maybeSingle();
  if (!m) redirect(`${dest}?err=` + encodeURIComponent("対象の申込が見つかりません"));

  const r = (await askGenesis(id, true)) as { ok?: boolean; memberNo?: string | null; error?: string; status?: JoinPaymentStatus };
  await logAudit(actor, "frunk.join_payment.confirm", "frunk_members", id, null, { ok: !!r.ok, member_no: r.memberNo ?? null });
  revalidateMember(id);
  if (r.ok) {
    redirect(
      `${dest}?msg=` +
        encodeURIComponent(
          `${String((m as Record<string, unknown>).name ?? "")}様の入金を確認し、${r.memberNo} で入会を確定しました（控えPDF付きの完了メールを送信）。Squareのサブスク設定（価格・次回請求日）もあわせてご確認ください。`,
        ),
    );
  }
  redirect(`${dest}?err=` + encodeURIComponent(`確定できませんでした: ${r.error ?? "原因不明"}`));
}
