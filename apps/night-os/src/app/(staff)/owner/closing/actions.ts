"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { castMonthLines, getActiveRules, monthRange, resolveNightStore } from "@/lib/night";

/**
 * 締める。この時点の金額を nite_payroll_lines に焼き付けてロックする。
 * あとで設定を変えても、この月の支給額は動かない（ここが「確定」の意味）。
 * 直したいときは削除・上書きではなく nite_payroll_adjustments に訂正を1行足す。
 */
export async function confirmClosing(formData: FormData) {
  const actor = await requireActor();
  const store = await resolveNightStore();
  if (!store) throw new Error("店舗が見つかりません");
  const month = String(formData.get("month") ?? "");
  const { from } = monthRange(month);

  const active = await getActiveRules(store.id);
  const lines = await castMonthLines(store.id, month, active.rules);
  const admin = createAdmin();

  const totals = {
    gross: lines.reduce((s, l) => s + l.line.gross, 0),
    net: lines.reduce((s, l) => s + l.line.net, 0),
    advance: lines.reduce((s, l) => s + l.line.advanceTotal, 0),
    casts: lines.length,
  };

  const { data: closing, error } = await admin
    .from("nite_closings")
    .upsert(
      {
        company_id: store.companyId,
        store_id: store.id,
        target_month: from,
        status: "confirmed",
        ruleset_id: active.id,
        totals,
        confirmed_at: new Date().toISOString(),
        confirmed_by: actor.staffId,
      },
      { onConflict: "store_id,target_month" }
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  for (const l of lines) {
    await admin.from("nite_payroll_lines").upsert(
      {
        company_id: store.companyId,
        closing_id: closing.id,
        cast_id: l.cast.id,
        work_days: l.line.workDays,
        work_minutes: l.line.workMinutes,
        hourly_total: l.line.hourlyTotal,
        back_total: l.line.backTotal,
        allowance_total: l.line.allowanceTotal,
        deduction_total: l.line.deductionTotal,
        advance_total: l.line.advanceTotal,
        gross: l.line.gross,
        net: l.line.net,
        needs_review: l.line.needsReview,
        breakdown: { days: l.days.map((d) => ({ date: d.date, net: d.pay.net, minutes: d.pay.minutes })) },
      },
      { onConflict: "closing_id,cast_id" }
    );
  }

  revalidatePath("/owner/closing");
}

/** 確定後の訂正。上書きせず1行足す（あとで「なぜこの額か」を説明できるように） */
export async function addAdjustment(formData: FormData) {
  const actor = await requireActor();
  const store = await resolveNightStore();
  if (!store) throw new Error("店舗が見つかりません");
  const month = String(formData.get("month") ?? "");
  const castId = String(formData.get("castId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!amount || !reason) throw new Error("金額と理由を入れてください");
  const { from } = monthRange(month);

  const admin = createAdmin();
  const { data: closing } = await admin
    .from("nite_closings")
    .select("id")
    .eq("store_id", store.id)
    .eq("target_month", from)
    .maybeSingle();
  if (!closing) throw new Error("先に締めを作成してください");

  await admin.from("nite_payroll_adjustments").insert({
    company_id: store.companyId,
    closing_id: closing.id,
    cast_id: castId,
    amount,
    reason,
    created_by: actor.staffId,
  });
  revalidatePath("/owner/closing");
}
