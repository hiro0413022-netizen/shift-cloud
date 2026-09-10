"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireCast } from "@/lib/cast";
import { businessDate, castMonthLines, getActiveRules, resolveNightStore } from "@/lib/night";

/**
 * 日払いの申請。
 * 「今月ここまでの支給見込み − すでに受け取った分」を超える金額は受け付けない。
 * （超えたまま渡すと月末に支給がマイナスになり、返してもらう話になってしまう）
 */
export async function requestAdvance(formData: FormData) {
  const me = await requireCast();
  const store = await resolveNightStore();
  if (!store) throw new Error("店舗が見つかりません");

  const amount = Math.floor(Number(formData.get("amount") ?? 0));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("金額を入れてください");

  const date = businessDate();
  const { rules } = await getActiveRules(store.id);
  if (!rules.advance.enabled) throw new Error("日払いは受け付けていません");

  const lines = await castMonthLines(store.id, `${date.slice(0, 7)}-01`, rules);
  const mine = lines.find((l) => l.cast.id === me.castId);
  const available = Math.max(0, (mine?.line.gross ?? 0) - (mine?.line.advanceTotal ?? 0));
  if (amount > available) throw new Error("受け取れる残高を超えています");

  const admin = createAdmin();
  const { error } = await admin.from("nite_advances").insert({
    company_id: store.companyId,
    store_id: store.id,
    cast_id: me.castId,
    business_date: date,
    amount,
    fee: rules.advance.fee,
    status: "requested",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/cast");
}

/**
 * シフトの提出。
 * 送られてくるのは「出勤の日だけ」。残りは休みとして入れ直す（部分提出で穴が残らないように）。
 */
export async function submitShift(formData: FormData) {
  const me = await requireCast();
  const store = await resolveNightStore();
  if (!store) throw new Error("店舗が見つかりません");

  const periodId = String(formData.get("periodId") ?? "");
  const dates = String(formData.get("dates") ?? "").split(",").filter(Boolean);
  const admin = createAdmin();

  const rows = dates.map((d) => {
    const wish = String(formData.get(`w_${d}`) ?? "");
    const start = String(formData.get(`t_${d}`) ?? "") || null;
    const douhan = formData.get(`d_${d}`) === "on";
    return { d, wish, start, douhan };
  });

  for (const r of rows) {
    if (r.wish !== "work" && r.wish !== "off") continue;
    await admin.from("nite_shift_requests").upsert(
      {
        company_id: store.companyId,
        store_id: store.id,
        period_id: periodId,
        cast_id: me.castId,
        work_date: r.d,
        wish: r.wish,
        start_time: r.wish === "work" ? r.start : null,
        douhan_planned: r.wish === "work" ? r.douhan : false,
      },
      { onConflict: "cast_id,work_date" }
    );
  }

  await admin.from("nite_shift_submissions").upsert(
    {
      company_id: store.companyId,
      period_id: periodId,
      cast_id: me.castId,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "period_id,cast_id" }
  );

  revalidatePath("/cast/shift");
}
