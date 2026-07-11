"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@yozan/core/supabase/admin";

/* 派遣の登録・更新・削除（Server Action。書き込みは service_role のみ / RLS標準 #3） */

const dispatchSchema = z.object({
  id: z.string().uuid().optional(),
  dispatch_date: z.string().min(10),
  kind: z.enum(["dispatch", "training", "other"]).default("dispatch"),
  client_id: z.string().uuid().nullable(),
  sales_amount: z.coerce.number().int().min(0),
  // 原価は「委託先」か「社員」のどちらか。UIは assignee="p:<id>" / "s:<id>" で送る
  assignee: z.string().min(1),
  fee_amount: z.coerce.number().int().min(0),
  transport_amount: z.coerce.number().int().min(0),
  special_amount: z.coerce.number().int().min(0),
  memo: z.string().max(500).nullable(),
});

function parseAssignee(v: string): { partner_id: string | null; staff_id: string | null } {
  if (v.startsWith("p:")) return { partner_id: v.slice(2), staff_id: null };
  if (v.startsWith("s:")) return { partner_id: null, staff_id: v.slice(2) };
  return { partner_id: null, staff_id: null };
}

function formToInput(fd: FormData) {
  const empty = (k: string) => {
    const v = fd.get(k);
    return v === null || v === "" ? null : String(v);
  };
  return {
    id: empty("id") ?? undefined,
    dispatch_date: String(fd.get("dispatch_date") ?? ""),
    kind: (empty("kind") ?? "dispatch") as "dispatch" | "training" | "other",
    client_id: empty("client_id"),
    sales_amount: fd.get("sales_amount") ?? 0,
    assignee: String(fd.get("assignee") ?? ""),
    fee_amount: fd.get("fee_amount") ?? 0,
    transport_amount: fd.get("transport_amount") ?? 0,
    special_amount: fd.get("special_amount") ?? 0,
    memo: empty("memo"),
  };
}

export async function saveDispatch(fd: FormData): Promise<{ error?: string }> {
  const actor = await requireActor();
  const parsed = dispatchSchema.safeParse(formToInput(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const v = parsed.data;
  const { partner_id, staff_id } = parseAssignee(v.assignee);

  // 社員に委託料を付けるのは二重計上（給与でも払う）。DBのCHECKでも弾かれるが、先に親切に返す
  if (staff_id && (v.fee_amount > 0 || v.special_amount > 0)) {
    return { error: "社員には委託料・特別手当を付けられません（給与で支給されるため二重計上になります）" };
  }

  const admin = createAdmin();
  const row = {
    company_id: actor.companyId,
    dispatch_date: v.dispatch_date,
    kind: v.kind,
    client_id: v.client_id,
    sales_amount: v.sales_amount,
    partner_id,
    staff_id,
    fee_amount: staff_id ? 0 : v.fee_amount,
    transport_amount: v.transport_amount,
    special_amount: staff_id ? 0 : v.special_amount,
    memo: v.memo,
  };

  if (v.id) {
    const { error } = await admin.from("cad_dispatches").update(row).eq("id", v.id).eq("company_id", actor.companyId);
    if (error) return { error: error.message };
  } else {
    // seq は「YYYY-MM-通番」。当月の既存件数+1（表示用。欠番は許容する）
    const ym = v.dispatch_date.slice(0, 7);
    const { count } = await admin
      .from("cad_dispatches")
      .select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId)
      .gte("dispatch_date", `${ym}-01`)
      .lte("dispatch_date", `${ym}-31`)
      .is("deleted_at", null);
    const seq = `${ym}-${String((count ?? 0) + 1).padStart(3, "0")}`;
    const { error } = await admin.from("cad_dispatches").insert({ ...row, seq });
    if (error) return { error: error.message };
  }

  await refreshFinance(actor.companyId, v.dispatch_date.slice(0, 7));
  revalidatePath("/");
  revalidatePath("/dispatches");
  return {};
}

export async function deleteDispatch(fd: FormData): Promise<{ error?: string }> {
  const actor = await requireActor();
  const id = String(fd.get("id") ?? "");
  const ym = String(fd.get("ym") ?? "");
  if (!id) return { error: "idが必要です" };

  const admin = createAdmin();
  const { error } = await admin
    .from("cad_dispatches")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  if (error) return { error: error.message };

  await refreshFinance(actor.companyId, ym);
  revalidatePath("/");
  revalidatePath("/dispatches");
  return {};
}

/** 台帳 → fin_entries（月次PL）へ集計。Genesisの事業別PL・KPIがこれを読む */
async function refreshFinance(companyId: string, ym: string) {
  const admin = createAdmin();
  await admin.rpc("refresh_caddy_finance", {
    p_company_id: companyId,
    p_month: ym ? `${ym}-01` : null,
  });
}

export async function refreshFinanceAction(fd: FormData): Promise<{ error?: string }> {
  const actor = await requireActor();
  await refreshFinance(actor.companyId, String(fd.get("ym") ?? ""));
  revalidatePath("/");
  return {};
}
