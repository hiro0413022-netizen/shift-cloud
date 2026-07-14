import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { hasPayrollAccess } from "@/lib/reauth";
import { logAudit } from "@/lib/audit";

export async function GET(request: Request) {
  const actor = await requireActor("view_payroll");
  if (!(await hasPayrollAccess(actor.staffId))) {
    return new NextResponse("再認証が必要です", { status: 403 });
  }

  const ym = new URL(request.url).searchParams.get("ym");
  if (!ym) return new NextResponse("ym required", { status: 400 });

  const admin = createAdmin();
  const { data: period } = await admin.from("payroll_periods")
    .select("id").eq("company_id", actor.companyId).eq("target_month", `${ym}-01`).maybeSingle();
  if (!period) return new NextResponse("データがありません", { status: 404 });

  const { data: items } = await admin.from("payroll_items")
    .select("*, staff(name, email, login_id, employment_type)")
    .eq("period_id", period.id).order("total_amount", { ascending: false });

  const EMP: Record<string, string> = { fulltime: "社員", parttime: "アルバイト", contractor: "業務委託", lesson_pro: "レッスンプロ" };
  const header = "氏名,雇用形態,勤務時間(分),残業時間(分),基本給,残業代,交通費,手当,控除,支給見込み";
  const lines = (items ?? []).map((i) => {
    const s = i.staff as unknown as { name: string; employment_type: string } | null;
    return [
      s?.name ?? "", EMP[s?.employment_type ?? ""] ?? "",
      i.work_minutes, i.overtime_minutes,
      i.base_amount, i.overtime_amount, i.commute_amount,
      i.allowance_amount, i.deduction_amount, i.total_amount,
    ].join(",");
  });
  const csv = "﻿" + [header, ...lines].join("\r\n"); // BOM付き（Excel対応）

  await logAudit(actor, "payroll.export_csv", "payroll_items", period.id, null, { ym });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payroll_${ym}.csv"`,
    },
  });
}
