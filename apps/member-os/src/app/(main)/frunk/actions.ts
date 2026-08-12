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
import { pauseSubscription, resumeSubscription, swapSubscriptionPlan, chargeCardOnFile } from "@/lib/frank-square";
import { planChangeProration } from "@/lib/frank-billing-pure";

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
const today = () => new Date().toISOString().slice(0, 10);

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
  let memberNo = str(formData.get("member_no"));
  if (!memberNo) {
    const { count } = await admin
      .from("frunk_members").select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID).not("member_no", "is", null);
    memberNo = `FR${String((count ?? 0) + 1).padStart(4, "0")}`;
  }
  await admin.from("frunk_members").update({
    status: "active",
    member_no: memberNo,
    join_date: str(formData.get("start_date")) || today(),
    reviewed_by: actor.staffId,
    reviewed_at: new Date().toISOString(),
  }).eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID); // 店舗スコープ（#134）
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
    redirect("/frunk?err=" + encodeURIComponent("会員番号が未発行です。先に入会申込を承認してください"));
  }

  const r = await sendApprovalMailTo(admin, id, memberNo);
  await logAudit(actor, "frunk.approval_mail_resend", "frunk_members", null, null, { id, member_no: memberNo, ok: r.ok });
  redirect(
    r.ok
      ? "/frunk?msg=" + encodeURIComponent(`${String(m?.name ?? "")}様へ会員番号（${memberNo}）の案内メールを再送しました`)
      : "/frunk?err=" + encodeURIComponent(`再送できませんでした: ${r.reason ?? ""}`),
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
  revalidatePath("/frunk");
  revalidatePath("/dashboard");
}

// ---- 会員ステータス変更（休会・復帰・退会） ----
// 休会=Squareの月会費自動課金を一時停止（休会費2,200円税込は店頭で徴収）／復帰=再開（#124）
export async function setMemberStatus(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const to = str(formData.get("to"));
  if (!id || !["active", "suspended", "left"].includes(to)) return;
  // キャンペーン入会は6か月継続（#131）: 期間内の退会はスタッフに警告（ブロックはしない・特例対応可）
  let minTermWarn = "";
  if (to === "left") {
    const { data: pre } = await admin.from("frunk_members").select("min_term_until")
      .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID).maybeSingle(); // 店舗スコープ（#134）
    if (pre?.min_term_until && String(pre.min_term_until) > today()) {
      minTermWarn = `⚠ この会員はキャンペーン入会の継続期間中です（${String(pre.min_term_until)}まで）。`;
    }
  }

  const patch: Record<string, unknown> = { status: to };
  if (to === "suspended") patch.suspend_start = today();
  if (to === "active") patch.suspend_end = today();
  if (to === "left") patch.leave_date = today();
  await admin.from("frunk_members").update(patch)
    .eq("id", id).eq("company_id", actor.companyId).eq("store_id", FRANK_STORE_ID); // 店舗スコープ（#134）

  // Square側の追従（失敗してもステータス変更は成立。結果は画面のメッセージで伝える）
  const { data: m } = await admin
    .from("frunk_members")
    .select("member_no, square_subscription_id, billing_status")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID) // 店舗スコープ（#134）
    .maybeSingle();
  const subId = m?.square_subscription_id ? String(m.square_subscription_id) : null;
  if (subId) {
    const r =
      to === "suspended" ? await pauseSubscription(subId)
      : to === "active" ? await resumeSubscription(subId)
      : null; // 退会はお客様都合のタイミングがあるため自動解約しない（ダッシュボードで解約）
    await logAudit(actor, "frunk.square_follow", "frunk_members", null, null, { id, to, square: r });
    if (r && !r.ok && !r.skipped) {
      redirect("/frunk?err=" + encodeURIComponent(
        `ステータスは変更しましたが、Square側の${to === "suspended" ? "課金停止" : "課金再開"}に失敗しました。Squareダッシュボードで確認してください（${m?.member_no ?? ""}）`,
      ));
    }
    if (to === "left") {
      redirect("/frunk?err=" + encodeURIComponent(
        `${minTermWarn}退会にしました。月会費の自動課金は自動では止まりません。Squareダッシュボードでサブスクリプションを解約してください（${m?.member_no ?? ""}）`,
      ));
    }
  }
  if (minTermWarn) redirect("/frunk?err=" + encodeURIComponent(`${minTermWarn}退会にしました。`));
  revalidatePath("/frunk");
}

// ---- プラン変更（#124） ----
// 決定（2026-08-10）: 差額（税込）を4分割し、変更した週から月末までの残り週数分をその場でカードに請求。
// 翌請求から新プラン満額（Squareのスワップは入会金なしバリエーション＝入会金を二重請求しない）。
// 値下げは請求0円（返金しない）。カード未登録なら差額は店頭徴収の案内を出す。
export async function changePlan(formData: FormData) {
  const actor = await requireFrankActor();
  const admin = createAdmin();
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
  if (!m || !newPlan) redirect("/frunk?err=" + encodeURIComponent("会員またはプランが見つかりません"));
  if (String(m.plan_id) === String(newPlan.id)) redirect("/frunk?err=" + encodeURIComponent("同じプランです"));

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
  if (subId && newPlan.square_variation_nofee_id) {
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
  redirect(`/frunk?${param}=` + encodeURIComponent(notes.join(" ")));
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
