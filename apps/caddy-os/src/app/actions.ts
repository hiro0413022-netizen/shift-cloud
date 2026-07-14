"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@yozan/core/supabase/admin";

/* 派遣の登録・更新・削除（Server Action。書き込みは service_role のみ / RLS標準 #3） */

/** "YYYY-MM" → その月の実在する月末日（"YYYY-MM-DD"）。-31固定は2月等で壊れる（DECISIONS #53） */
function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

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
      // 月末日は実在する日で（-31固定は2月等で0件になる / DECISIONS #53）
      .lte("dispatch_date", monthEnd(ym))
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

/* ============================================================
   一括登録（スプレッドシート風グリッドから / DECISIONS #46）
   派遣件数が多い（月40〜60件）ため、1件ずつのフォームでは運用に耐えない。
   ============================================================ */

const bulkRowSchema = z.object({
  dispatch_date: z.string().min(10),
  client_id: z.string().uuid().nullable(),
  sales_amount: z.coerce.number().int().min(0),
  assignee: z.string().min(1),
  fee_amount: z.coerce.number().int().min(0),
  transport_amount: z.coerce.number().int().min(0),
  special_amount: z.coerce.number().int().min(0),
  memo: z.string().max(500).nullable(),
});

export async function saveDispatchesBulk(
  input: z.input<typeof bulkRowSchema>[]
): Promise<{ error?: string; count?: number }> {
  const actor = await requireActor();
  const parsed = z.array(bulkRowSchema).min(1).max(200).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };

  const admin = createAdmin();
  const rows: Array<Record<string, unknown>> = [];
  const months = new Set<string>();

  for (const [i, v] of parsed.data.entries()) {
    const { partner_id, staff_id } = parseAssignee(v.assignee);
    if (!partner_id && !staff_id) return { error: `${i + 1}行目: 担当キャディを選んでください` };
    if (staff_id && (v.fee_amount > 0 || v.special_amount > 0)) {
      return { error: `${i + 1}行目: 自社スタッフに委託料・手当は付けられません（給与で支給＝二重計上）` };
    }
    months.add(v.dispatch_date.slice(0, 7));
    rows.push({
      company_id: actor.companyId,
      dispatch_date: v.dispatch_date,
      kind: "dispatch",
      client_id: v.client_id,
      sales_amount: v.sales_amount,
      partner_id,
      staff_id,
      fee_amount: staff_id ? 0 : v.fee_amount,
      transport_amount: v.transport_amount,
      special_amount: staff_id ? 0 : v.special_amount,
      memo: v.memo,
    });
  }

  const { error } = await admin.from("cad_dispatches").insert(rows);
  if (error) return { error: error.message };

  // 採番（seq）は登録後にまとめて振り直す（日付順に 2026-06-001 …）
  for (const ym of months) {
    await admin.rpc("renumber_caddy_seq", { p_company_id: actor.companyId, p_month: `${ym}-01` });
    await refreshFinance(actor.companyId, ym);
  }

  revalidatePath("/");
  revalidatePath("/dispatches");
  revalidatePath("/invoices");
  return { count: rows.length };
}

/**
 * 削除（論理削除）。
 * Server Component の <form action={...}> に直接渡すため **戻り値は void**
 * （Next.jsの型: (formData: FormData) => void | Promise<void>）。
 */
export async function deleteDispatch(fd: FormData): Promise<void> {
  const actor = await requireActor();
  const id = String(fd.get("id") ?? "");
  const ym = String(fd.get("ym") ?? "");
  if (!id) return;

  const admin = createAdmin();
  await admin
    .from("cad_dispatches")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  await refreshFinance(actor.companyId, ym);
  revalidatePath("/");
  revalidatePath("/dispatches");
}

/** 台帳 → fin_entries（月次PL）へ集計。Genesisの事業別PL・KPIがこれを読む */
async function refreshFinance(companyId: string, ym: string) {
  const admin = createAdmin();
  await admin.rpc("refresh_caddy_finance", {
    p_company_id: companyId,
    p_month: ym ? `${ym}-01` : null,
  });
}

/* ============================================================
   出勤可否（DECISIONS #46）
   委託先キャディの「その日出られるか」だけを持つ。空文字は未回答＝行を消す。
   ============================================================ */
export async function setAvailability(
  partnerId: string,
  date: string,
  status: "available" | "maybe" | "unavailable" | ""
): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();

  if (!status) {
    await admin
      .from("cad_availability")
      .delete()
      .eq("company_id", actor.companyId)
      .eq("partner_id", partnerId)
      .eq("date", date);
    revalidatePath("/availability");
    return {};
  }

  const { error } = await admin
    .from("cad_availability")
    .upsert(
      { company_id: actor.companyId, partner_id: partnerId, date, status, deleted_at: null },
      { onConflict: "partner_id,date" }
    );
  if (error) return { error: error.message };
  revalidatePath("/availability");
  return {};
}

/** 財務へ再集計（同上・Server Componentのformから呼ぶため戻り値はvoid） */
export async function refreshFinanceAction(fd: FormData): Promise<void> {
  const actor = await requireActor();
  await refreshFinance(actor.companyId, String(fd.get("ym") ?? ""));
  revalidatePath("/");
}
