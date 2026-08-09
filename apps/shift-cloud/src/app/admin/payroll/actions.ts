"use server";

import { revalidatePath } from "next/cache";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { requireActor, loginIdToEmail } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { grantPayrollAccess, hasPayrollAccess } from "@/lib/reauth";
import { logAudit } from "@/lib/audit";
import { monthRange, calcMonthlyPayroll, type WageRow, type AllowanceRow } from "@/lib/payroll-calc";
import {
  PERSONAL_LESSON_UNIT_PRICE,
  splitLessonCounts,
  mergeByStaff,
  type LessonCountRow,
} from "@/lib/lesson-allowance";

/**
 * パーソナルレッスン手当を Money OS の売上台帳から取り込む（DECISIONS #105）。
 * 手入力していた kind='personal' を置き換える＝**売上台帳が唯一の入力元**。
 * 他の手当（コンペ/ラウンドレッスン/紹介料/交通費実費）は手入力のまま触らない。
 * 戻り値は取り込んだ件数（0でもエラーにしない＝レッスンが無い月がある）。
 */
async function syncPersonalAllowances(
  admin: ReturnType<typeof createAdmin>,
  companyId: string,
  periodId: string,
  from: string,
  to: string
): Promise<{ staff: number; qty: number; amount: number }> {
  const { data, error } = await admin.rpc("personal_lesson_counts", {
    p_company_id: companyId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`レッスン件数の集計に失敗しました: ${error.message}`);

  const split = splitLessonCounts((data ?? []) as LessonCountRow[]);
  // 卜部/春馬のような表記ゆれは1人に束ねてから1行で持つ
  const rows = mergeByStaff(split.payroll).filter((r) => r.amount > 0);

  // 既存の自動取込分を論理削除してから入れ直す（#5 物理削除禁止）
  await admin
    .from("payroll_allowances")
    .update({ deleted_at: new Date().toISOString() })
    .eq("period_id", periodId)
    .eq("kind", "personal")
    .is("deleted_at", null);

  if (rows.length > 0) {
    const { error: insErr } = await admin.from("payroll_allowances").insert(
      rows.map((r) => ({
        company_id: companyId,
        period_id: periodId,
        staff_id: r.staff_id!,
        kind: "personal" as const,
        unit_price: PERSONAL_LESSON_UNIT_PRICE,
        quantity: r.qty,
        amount: r.amount,
        memo: `パーソナル${r.qty}件（money-os売上台帳より自動取込）`,
      }))
    );
    if (insErr) throw new Error(`手当の取込に失敗しました: ${insErr.message}`);
  }

  return {
    staff: rows.length,
    qty: rows.reduce((s, r) => s + r.qty, 0),
    amount: rows.reduce((s, r) => s + r.amount, 0),
  };
}

/**
 * 業務委託プロ（mon_pros.payout_mode='outsourcing'）のレッスン手当を
 * money-os の外注費（mon_expense）へ計上する（DECISIONS #106）。
 * 給与には入れないが支払いは発生するので、給与集計と同じタイミングで経費側にも反映する。
 * DB関数側で冪等（source='lesson_allowance' の行を入れ直す）。
 */
async function syncOutsourcingExpense(
  admin: ReturnType<typeof createAdmin>,
  companyId: string,
  from: string,
  to: string
): Promise<{ payee: string; qty: number; amount: number }[]> {
  const { data, error } = await admin.rpc("sync_lesson_outsourcing_expense", {
    p_company_id: companyId,
    p_from: from,
    p_to: to,
    p_unit_price: PERSONAL_LESSON_UNIT_PRICE,
  });
  if (error) throw new Error(`業務委託分の外注費計上に失敗しました: ${error.message}`);
  return (data ?? []) as { payee: string; qty: number; amount: number }[];
}

/** 再認証: パスワードを確認して15分間の給与アクセスを付与 */
export async function verifyPayrollAccess(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const actor = await requireActor("view_payroll");
  const password = String(formData.get("password") ?? "");

  const admin = createAdmin();
  const { data: staff } = await admin.from("staff").select("email, login_id").eq("id", actor.staffId).single();
  const email = staff?.email || (staff?.login_id ? loginIdToEmail(staff.login_id) : null);
  if (!email) return { error: "認証情報が見つかりません" };

  // セッションに影響しない使い捨てクライアントで検証
  const bare = createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { error } = await bare.auth.signInWithPassword({ email, password });
  if (error) return { error: "パスワードが正しくありません" };

  await grantPayrollAccess(actor.staffId);
  await logAudit(actor, "payroll.reauth", "payroll_periods", null);
  revalidatePath("/admin/payroll");
  return {};
}

/** 給与集計を実行（attendance_days × staff_wages → payroll_items） */
export async function buildPayroll(formData: FormData): Promise<{ error?: string }> {
  const actor = await requireActor("manage_payroll");
  const admin = createAdmin();
  const ym = String(formData.get("ym"));
  // 旧: `${ym}-31` 固定 → 31日が無い月はdate型エラーで勤怠0件になるバグ（AUDIT_2026-07-11 D-1）
  const { from, to } = monthRange(ym);

  const { data: period } = await admin.from("payroll_periods")
    .upsert({ company_id: actor.companyId, target_month: from }, { onConflict: "company_id,target_month" })
    .select("*").single();
  if (!period) return { error: "期間の作成に失敗しました" };
  if (period.status === "locked") return { error: "この月は締め済みです" };

  // レッスン手当は money-os の売上台帳から毎回取り込む（手入力しない / DECISIONS #105）
  let lessonSync = { staff: 0, qty: 0, amount: 0 };
  let outsourcing: { payee: string; qty: number; amount: number }[] = [];
  try {
    lessonSync = await syncPersonalAllowances(admin, actor.companyId, period.id, from, to);
    // 業務委託プロ分は給与ではなく money-os の外注費へ（#106）
    outsourcing = await syncOutsourcingExpense(admin, actor.companyId, from, to);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "レッスン手当の取込に失敗しました" };
  }

  const [{ data: days }, { data: wages }, { data: company }, { data: allowances }] = await Promise.all([
    admin.from("attendance_days").select("staff_id, date, work_minutes, overtime_minutes")
      .eq("company_id", actor.companyId).gte("date", from).lte("date", to),
    admin.from("staff_wages")
      .select("staff_id, hourly_wage, commute_allowance, effective_from, wage_type, monthly_salary, created_at")
      .eq("company_id", actor.companyId).is("deleted_at", null).order("effective_from", { ascending: false }),
    admin.from("companies").select("settings").eq("id", actor.companyId).single(),
    // 月次の手当（パーソナル/紹介料/コンペ/RL/交通費実費 — DECISIONS #44）
    admin.from("payroll_allowances").select("staff_id, kind, amount")
      .eq("period_id", period.id).is("deleted_at", null),
  ]);

  const settings = (company?.settings ?? {}) as unknown as { rounding_minutes?: number; overtime_rate?: number };
  const rounding = settings.rounding_minutes ?? 0;
  const otRate = settings.overtime_rate ?? 1.25;

  // 月給者（役員・林さん等）は勤怠0日でも満額支給されるため、計算対象に明示的に含める（#44）
  const monthlyStaffIds = [
    ...new Set(
      ((wages ?? []) as WageRow[]).filter((w) => w.wage_type === "monthly").map((w) => w.staff_id)
    ),
  ];

  // 日付按分: 日ごとに「その日に有効な時給」で計算（月中の時給変更に対応 / DECISIONS #39）
  // 手当・月給は opts で反映（DECISIONS #44）
  const results = calcMonthlyPayroll(
    (days ?? []) as Array<{ staff_id: string; date: string; work_minutes: number; overtime_minutes: number }>,
    (wages ?? []) as WageRow[],
    rounding,
    otRate,
    {
      monthEnd: to,
      allowances: (allowances ?? []) as AllowanceRow[],
      includeStaffIds: monthlyStaffIds,
    }
  );

  const items = [...results.entries()].map(([staffId, r]) => {
    return {
      company_id: actor.companyId,
      period_id: period.id,
      staff_id: staffId,
      work_minutes: r.work,
      overtime_minutes: r.overtime,
      base_amount: r.base_amount,
      overtime_amount: r.overtime_amount,
      commute_amount: r.commute_amount,
      allowance_amount: r.allowance_amount,
      deduction_amount: 0,
      total_amount: r.total_amount,
      detail: {
        days_worked: r.daysWorked,
        wage_type: r.wage_type,
        // 互換: 従来の単一時給表示（複数レートの月は時系列で最後=最新レート）
        hourly_wage: r.periods.length ? r.periods[r.periods.length - 1].hourly_wage : 0,
        overtime_rate: otRate,
        rounding_minutes: rounding,
        // 月中の時給変更があった場合のレート別内訳（監査・説明可能性）
        wage_periods: r.periods,
      },
    };
  });

  if (items.length === 0) return { error: "対象月の勤怠データがありません" };

  const { error } = await admin.from("payroll_items").upsert(items, { onConflict: "period_id,staff_id" });
  if (error) return { error: error.message };

  await logAudit(actor, "payroll.build", "payroll_items", period.id, null, {
    ym,
    staff: items.length,
    lesson_allowance: lessonSync,
    lesson_outsourcing: outsourcing,
  });
  revalidatePath("/admin/payroll");
  return {};
}

// ============================================================
// レッスン手当の「担当プロ未紐付け」をその場で直す（2026-08-10 ユーザー要望）
// 警告を出すだけでは money-os を探し回ることになるため、給与画面から直接修正する。
// 対象データは money-os の売上台帳 / 担当プロ名簿（同一DB・service_roleで更新）。
// ============================================================

/** 未紐付けの売上明細に担当プロを設定する（mon_sales_lines.pro を埋める） */
export async function assignLessonPro(formData: FormData): Promise<void> {
  const actor = await requireActor("manage_payroll");
  // 給与画面の再認証（15分）を通っていない場合は何もしない
  if (!(await hasPayrollAccess(actor.staffId))) return;

  const lineId = String(formData.get("line_id") ?? "").trim();
  const pro = String(formData.get("pro") ?? "").trim();
  const ym = String(formData.get("ym") ?? "");
  if (!lineId || !pro) return;

  const admin = createAdmin();
  const { data: before } = await admin
    .from("mon_sales_lines")
    .select("id, pro, sold_on, customer_name")
    .eq("id", lineId)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!before) return;

  await admin
    .from("mon_sales_lines")
    .update({ pro, updated_at: new Date().toISOString() })
    .eq("id", lineId)
    .eq("company_id", actor.companyId);

  await logAudit(actor, "payroll.lesson_pro_assign", "mon_sales_lines", lineId, null, {
    ym,
    sold_on: before.sold_on,
    customer: before.customer_name,
    before: before.pro,
    after: pro,
  });
  revalidatePath("/admin/payroll");
}

/**
 * 売上台帳に出てくるプロ表記を名簿へ紐付ける。
 *  target = "alias:<mon_pros.id>" … 既存プロの別名（表記ゆれ）として登録
 *  target = "staff:<staff.id>"    … 新しい担当プロとして登録し、そのスタッフに紐付け
 */
export async function linkLessonPro(formData: FormData): Promise<void> {
  const actor = await requireActor("manage_payroll");
  if (!(await hasPayrollAccess(actor.staffId))) return;

  const proName = String(formData.get("pro_name") ?? "").trim();
  const target = String(formData.get("target") ?? "").trim();
  const storeId = String(formData.get("store_id") ?? "").trim();
  const mode = String(formData.get("payout_mode") ?? "payroll");
  const ym = String(formData.get("ym") ?? "");
  if (!proName || !target) return;
  // CHECK制約に落とさない保険（0094）
  const payoutMode = ["payroll", "outsourcing", "none"].includes(mode) ? mode : "payroll";

  const admin = createAdmin();

  if (target.startsWith("alias:")) {
    const proId = target.slice("alias:".length);
    const { data: pro } = await admin
      .from("mon_pros")
      .select("id, name, aliases")
      .eq("id", proId)
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!pro) return;
    const aliases = [...new Set([...(pro.aliases ?? []), proName])];
    await admin
      .from("mon_pros")
      .update({ aliases, updated_at: new Date().toISOString() })
      .eq("id", pro.id)
      .eq("company_id", actor.companyId);
    await logAudit(actor, "payroll.lesson_pro_alias", "mon_pros", pro.id, null, { ym, alias: proName, pro: pro.name });
    revalidatePath("/admin/payroll");
    return;
  }

  if (target.startsWith("staff:") && storeId) {
    const staffId = target.slice("staff:".length);
    // 同名が既にある場合は作らずスタッフを紐付ける（uq_mon_pros_name の衝突回避）
    const { data: exists } = await admin
      .from("mon_pros")
      .select("id")
      .eq("company_id", actor.companyId)
      .eq("store_id", storeId)
      .eq("name", proName)
      .is("deleted_at", null)
      .maybeSingle();

    if (exists) {
      await admin
        .from("mon_pros")
        .update({ staff_id: staffId, payout_mode: payoutMode, updated_at: new Date().toISOString() })
        .eq("id", exists.id)
        .eq("company_id", actor.companyId);
      await logAudit(actor, "payroll.lesson_pro_link", "mon_pros", exists.id, null, { ym, pro: proName, staffId, payoutMode });
    } else {
      const { data: created } = await admin
        .from("mon_pros")
        .insert({
          company_id: actor.companyId,
          store_id: storeId,
          name: proName,
          staff_id: staffId,
          payout_mode: payoutMode,
        })
        .select("id")
        .maybeSingle();
      await logAudit(actor, "payroll.lesson_pro_create", "mon_pros", created?.id ?? null, null, {
        ym,
        pro: proName,
        staffId,
        payoutMode,
      });
    }
    revalidatePath("/admin/payroll");
  }
}

export async function lockPayroll(formData: FormData) {
  const actor = await requireActor("manage_payroll");
  const admin = createAdmin();
  const periodId = String(formData.get("period_id"));
  await admin.from("payroll_periods")
    .update({ status: "locked", locked_by: actor.staffId, locked_at: new Date().toISOString() })
    .eq("id", periodId).eq("company_id", actor.companyId);
  await logAudit(actor, "payroll.lock", "payroll_periods", periodId);
  revalidatePath("/admin/payroll");
}
