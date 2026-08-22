import { NextResponse } from "next/server";
import { requireActor, isOwner, scopedStoreIds, NO_STORE } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { hasPayrollAccess } from "@/lib/reauth";
import { logAudit } from "@/lib/audit";
import { monthRange } from "@/lib/payroll-calc";
import { todayJST } from "@/lib/util";
import { buildSheetDays, type SheetAttendanceDay, type SheetShift } from "@/lib/payslip-sheet";
import { buildPayslipPdf, type PayslipStaffInput } from "@/lib/payslip-pdf";

/**
 * 給与明細（日別出勤簿つき）PDF — /admin/payroll の「明細PDF」ボタン
 *
 * 1スタッフ=1ページで全員分を1つのPDFにまとめる。金額は payroll_items をそのまま印字。
 * 認可はCSVと同じ（view_payroll＋パスワード再認証）に加えて、
 * 非オーナーは自店舗配属スタッフの明細だけに絞る（#134・page.tsxと同じ考え方。
 * UI非表示ではなくサーバー側で絞るのがルール / store-scope-lockdown）。
 */

const EMP: Record<string, string> = {
  fulltime: "社員",
  parttime: "アルバイト",
  contractor: "業務委託",
  lesson_pro: "レッスンプロ",
};

type ItemDetail = {
  days_worked?: number;
  wage_type?: "hourly" | "monthly";
  hourly_wage?: number;
  wage_periods?: unknown[];
};

export async function GET(request: Request) {
  const actor = await requireActor("view_payroll");
  if (!(await hasPayrollAccess(actor.staffId))) {
    return new NextResponse("再認証が必要です", { status: 403 });
  }

  const ym = new URL(request.url).searchParams.get("ym");
  if (!ym) return new NextResponse("ym required", { status: 400 });
  let range: { from: string; to: string };
  try {
    range = monthRange(ym);
  } catch {
    return new NextResponse("不正な年月です", { status: 400 });
  }

  const admin = createAdmin();
  const { data: period } = await admin.from("payroll_periods")
    .select("id").eq("company_id", actor.companyId).eq("target_month", `${ym}-01`).maybeSingle();
  if (!period) return new NextResponse("データがありません", { status: 404 });

  // 非オーナーは自店舗配属スタッフのみ（page.tsx と同じスコープ / #134）
  let scopedStaffIds: string[] | null = null;
  if (!isOwner(actor)) {
    const storeIds = await scopedStoreIds(actor);
    const { data: assigns } = await admin
      .from("staff_store_assignments")
      .select("staff_id")
      .eq("company_id", actor.companyId)
      .in("store_id", storeIds)
      .is("deleted_at", null);
    const ids = [...new Set((assigns ?? []).map((a) => a.staff_id))];
    scopedStaffIds = ids.length > 0 ? ids : [NO_STORE];
  }

  let itemsQuery = admin.from("payroll_items")
    .select("*, staff(name, employment_type)")
    .eq("period_id", period.id);
  if (scopedStaffIds) itemsQuery = itemsQuery.in("staff_id", scopedStaffIds);
  const { data: items } = await itemsQuery.order("total_amount", { ascending: false });
  if (!items?.length) return new NextResponse("データがありません", { status: 404 });

  const staffIds = items.map((i) => i.staff_id);
  const [{ data: days }, { data: shifts }, { data: company }] = await Promise.all([
    admin.from("attendance_days")
      .select("staff_id, date, clock_in, clock_out, break_minutes, break_override_minutes, work_minutes, late_minutes, early_leave_minutes, overtime_minutes, is_missing_clock, status")
      .eq("company_id", actor.companyId)
      .in("staff_id", staffIds)
      .gte("date", range.from).lte("date", range.to),
    // 打刻なし日の検出とシフト列の表示用（published のみ / 休みも取り出してbuild側で除外）
    admin.from("shifts")
      .select("staff_id, date, start_time, end_time, is_day_off")
      .eq("company_id", actor.companyId)
      .in("staff_id", staffIds)
      .eq("status", "published")
      .is("deleted_at", null)
      .gte("date", range.from).lte("date", range.to),
    admin.from("companies").select("name, settings").eq("id", actor.companyId).single(),
  ]);

  const rounding =
    ((company?.settings ?? {}) as { rounding_minutes?: number }).rounding_minutes ?? 0;
  const today = todayJST();

  const staff: PayslipStaffInput[] = items.map((i) => {
    const st = i.staff as unknown as { name: string; employment_type: string } | null;
    const detail = (i.detail ?? {}) as ItemDetail;
    const wageLabel =
      detail.wage_type === "monthly"
        ? "月給"
        : detail.hourly_wage
          ? `時給 ${detail.hourly_wage.toLocaleString("ja-JP")}円${(detail.wage_periods?.length ?? 0) > 1 ? "（月中改定あり）" : ""}`
          : "";
    return {
      name: st?.name ?? "—",
      employmentLabel: EMP[st?.employment_type ?? ""] ?? "",
      wageLabel,
      daysWorked: detail.days_worked ?? 0,
      workMinutes: i.work_minutes,
      overtimeMinutes: i.overtime_minutes,
      baseAmount: i.base_amount,
      overtimeAmount: i.overtime_amount,
      commuteAmount: i.commute_amount,
      allowanceAmount: i.allowance_amount,
      deductionAmount: i.deduction_amount,
      totalAmount: i.total_amount,
      days: buildSheetDays(
        (days ?? []) as SheetAttendanceDay[],
        (shifts ?? []) as SheetShift[],
        i.staff_id,
        today
      ),
    };
  });

  const [yy, mm] = ym.split("-");
  const pdf = await buildPayslipPdf({
    companyName: company?.name ?? "",
    ymLabel: `${yy}年${Number(mm)}月度`,
    generatedOn: today.replaceAll("-", "/"),
    roundingMinutes: rounding,
    staff,
  });

  await logAudit(actor, "payroll.export_pdf", "payroll_items", period.id, null, {
    ym,
    staff: staff.length,
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="payslip_${ym}.pdf"`,
    },
  });
}
