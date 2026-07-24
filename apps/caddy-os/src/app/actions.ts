"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@yozan/core/supabase/admin";
import { ymRange } from "@/lib/caddy";
import {
  buildInvoice,
  buildPayable,
  invoiceNo,
  payableNo,
  closingDateOf,
  type PayableSource,
} from "@/lib/invoice";

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

/* ============================================================
   設定: 取引先マスタ（DECISIONS #62 ③④）
   ============================================================ */
const clientSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().max(40).nullable(),
  name: z.string().min(1).max(120),
  unit_price: z.coerce.number().int().min(0).nullable(),
  partner_fee: z.coerce.number().int().min(0).nullable(),
  closing_day: z.string().max(20).nullable(),
  payment_day: z.string().max(20).nullable(),
  postal_code: z.string().max(20).nullable(),
  address: z.string().max(200).nullable(),
  has_contract: z.coerce.boolean(),
  status: z.enum(["active", "inactive"]).default("active"),
});

function num(fd: FormData, k: string): number | null {
  const v = fd.get(k);
  return v === null || v === "" ? null : Number(v);
}
function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return v === null || v === "" ? null : String(v);
}

export async function saveClient(fd: FormData): Promise<{ error?: string }> {
  const actor = await requireActor();
  const parsed = clientSchema.safeParse({
    id: str(fd, "id") ?? undefined,
    code: str(fd, "code"),
    name: String(fd.get("name") ?? ""),
    unit_price: num(fd, "unit_price"),
    partner_fee: num(fd, "partner_fee"),
    closing_day: str(fd, "closing_day"),
    payment_day: str(fd, "payment_day"),
    postal_code: str(fd, "postal_code"),
    address: str(fd, "address"),
    has_contract: fd.get("has_contract") === "on" || fd.get("has_contract") === "true",
    status: (str(fd, "status") ?? "active") as "active" | "inactive",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const { id, ...row } = parsed.data;

  const admin = createAdmin();
  if (id) {
    const { error } = await admin.from("cad_clients").update(row).eq("id", id).eq("company_id", actor.companyId);
    if (error) return { error: error.message };
  } else {
    const { error } = await admin.from("cad_clients").insert({ ...row, company_id: actor.companyId });
    if (error) return { error: error.message };
  }
  revalidatePath("/masters");
  revalidatePath("/dispatches");
  return {};
}

/* ============================================================
   設定: 委託先マスタ（DECISIONS #62 ④⑤）
   ============================================================ */
const partnerSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().max(40).nullable(),
  name: z.string().min(1).max(120),
  name_kana: z.string().max(120).nullable(),
  default_fee: z.coerce.number().int().min(0).nullable(),
  default_transport: z.coerce.number().int().min(0),
  hourly_wage: z.coerce.number().int().min(0).nullable(),
  main_course: z.string().max(120).nullable(),
  show_in_picker: z.coerce.boolean(),
  status: z.enum(["active", "inactive"]).default("active"),
  memo: z.string().max(500).nullable(),
});

export async function savePartner(fd: FormData): Promise<{ error?: string }> {
  const actor = await requireActor();
  const parsed = partnerSchema.safeParse({
    id: str(fd, "id") ?? undefined,
    code: str(fd, "code"),
    name: String(fd.get("name") ?? ""),
    name_kana: str(fd, "name_kana"),
    default_fee: num(fd, "default_fee"),
    default_transport: num(fd, "default_transport") ?? 0,
    hourly_wage: num(fd, "hourly_wage"),
    main_course: str(fd, "main_course"),
    show_in_picker: fd.get("show_in_picker") === "on" || fd.get("show_in_picker") === "true",
    status: (str(fd, "status") ?? "active") as "active" | "inactive",
    memo: str(fd, "memo"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const { id, ...row } = parsed.data;

  const admin = createAdmin();
  if (id) {
    const { error } = await admin.from("cad_partners").update(row).eq("id", id).eq("company_id", actor.companyId);
    if (error) return { error: error.message };
  } else {
    const { error } = await admin.from("cad_partners").insert({ ...row, company_id: actor.companyId });
    if (error) return { error: error.message };
  }
  revalidatePath("/masters");
  revalidatePath("/dispatches");
  return {};
}

/** プルダウン表示のトグル（設定画面のワンクリック用） */
export async function togglePartnerPicker(partnerId: string, show: boolean): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  const { error } = await admin
    .from("cad_partners")
    .update({ show_in_picker: show })
    .eq("id", partnerId)
    .eq("company_id", actor.companyId);
  if (error) return { error: error.message };
  revalidatePath("/masters");
  revalidatePath("/dispatches");
  return {};
}

/* ============================================================
   設定: 交通費 単価表（キャディ × ゴルフ場 / DECISIONS #62 ②）
   ============================================================ */
export async function saveTransportRate(
  clientId: string,
  partnerId: string,
  amount: number | null
): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();

  // 空欄 = 単価を消す（default_transport にフォールバックさせる）
  if (amount === null || Number.isNaN(amount)) {
    await admin
      .from("cad_transport_rates")
      .delete()
      .eq("company_id", actor.companyId)
      .eq("client_id", clientId)
      .eq("partner_id", partnerId);
    revalidatePath("/masters");
    return {};
  }
  const { error } = await admin.from("cad_transport_rates").upsert(
    { company_id: actor.companyId, client_id: clientId, partner_id: partnerId, amount, deleted_at: null },
    { onConflict: "company_id,client_id,partner_id" }
  );
  if (error) return { error: error.message };
  revalidatePath("/masters");
  revalidatePath("/dispatches");
  return {};
}

/* ============================================================
   ゴルフウィング勤務（時給 / DECISIONS #62 ⑤）
   partner_id を持つ派遣行として登録し、fee_amount に「時間 × 時給」を入れる。
   これで refresh_caddy_finance がキャディ事業の外注費として自動集計する。
   ゴルフウィングへの請求書は作らない（キャディ→YOZAN請求書に合算される）。
   ============================================================ */
const golfwingRowSchema = z.object({
  partner_id: z.string().uuid(),
  work_date: z.string().min(10),
  hours: z.coerce.number().min(0).max(24),
  hourly_wage: z.coerce.number().int().min(0),
  memo: z.string().max(500).nullable(),
});

export async function saveGolfwingBulk(
  input: z.input<typeof golfwingRowSchema>[]
): Promise<{ error?: string; count?: number }> {
  const actor = await requireActor();
  const parsed = z.array(golfwingRowSchema).min(1).max(200).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };

  const admin = createAdmin();
  const rows: Array<Record<string, unknown>> = [];
  const months = new Set<string>();
  for (const v of parsed.data) {
    const fee = Math.round(v.hours * v.hourly_wage);
    months.add(v.work_date.slice(0, 7));
    rows.push({
      company_id: actor.companyId,
      dispatch_date: v.work_date,
      kind: "golfwing",
      client_id: null,
      sales_amount: 0,
      partner_id: v.partner_id,
      staff_id: null,
      fee_amount: fee,
      transport_amount: 0,
      special_amount: 0,
      work_hours: v.hours,
      memo: v.memo,
    });
  }
  const { error } = await admin.from("cad_dispatches").insert(rows);
  if (error) return { error: error.message };

  for (const ym of months) {
    await admin.rpc("renumber_caddy_seq", { p_company_id: actor.companyId, p_month: `${ym}-01` });
    await refreshFinance(actor.companyId, ym);
  }
  revalidatePath("/");
  revalidatePath("/dispatches");
  revalidatePath("/invoices");
  return { count: rows.length };
}

/* ============================================================
   請求書の発行（スナップショット保存）と入金/支払 消込
   （DECISIONS #62 ① / 追加提案: 未入金・未払アラート）
   発行時点の明細を jsonb で固定する（後から台帳を直しても金額は動かない）。
   ============================================================ */
export async function issueReceivableInvoice(clientId: string, ym: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  const { from, to } = ymRange(ym);

  const [{ data: client }, { data: rows }, { data: company }] = await Promise.all([
    admin
      .from("cad_clients")
      .select("id, code, name, closing_day")
      .eq("id", clientId)
      .eq("company_id", actor.companyId)
      .single(),
    admin
      .from("cad_dispatches")
      .select("dispatch_date, sales_amount")
      .eq("company_id", actor.companyId)
      .eq("client_id", clientId)
      .gte("dispatch_date", from)
      .lte("dispatch_date", to)
      .is("deleted_at", null)
      .gt("sales_amount", 0),
    admin.from("companies").select("settings").eq("id", actor.companyId).single(),
  ]);
  if (!client) return { error: "取引先が見つかりません" };
  const settings = ((company?.settings ?? {}) as { invoice?: { tax_rate?: number; item_label?: string } }).invoice ?? {};
  const inv = buildInvoice(
    (rows ?? []) as Array<{ dispatch_date: string; sales_amount: number }>,
    ym,
    client.closing_day,
    settings.tax_rate ?? 0.1,
    settings.item_label ?? "キャディ業務料"
  );
  if (inv.lines.length === 0) return { error: "この月に請求対象の派遣がありません" };

  const { error } = await admin.from("cad_invoices").upsert(
    {
      company_id: actor.companyId,
      kind: "receivable",
      client_id: clientId,
      partner_id: null,
      invoice_no: invoiceNo(ym, client.code, client.name),
      target_month: `${ym}-01`,
      closing_date: inv.closingDate,
      issue_date: new Date().toISOString().slice(0, 10),
      subtotal: inv.subtotal,
      tax_rate: inv.taxRate,
      tax: inv.tax,
      total: inv.total,
      lines: inv.lines,
      status: "issued",
      deleted_at: null,
    },
    { onConflict: "company_id,invoice_no" }
  );
  if (error) return { error: error.message };
  revalidatePath("/invoices");
  return {};
}

export async function issuePayableInvoice(partnerId: string, ym: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  const { from, to } = ymRange(ym);

  const [{ data: partner }, { data: rows }] = await Promise.all([
    admin
      .from("cad_partners")
      .select("id, code, name")
      .eq("id", partnerId)
      .eq("company_id", actor.companyId)
      .single(),
    admin
      .from("cad_dispatches")
      .select("dispatch_date, kind, fee_amount, transport_amount, special_amount, work_hours, cad_clients(name)")
      .eq("company_id", actor.companyId)
      .eq("partner_id", partnerId)
      .gte("dispatch_date", from)
      .lte("dispatch_date", to)
      .is("deleted_at", null)
      .order("dispatch_date"),
  ]);
  if (!partner) return { error: "委託先が見つかりません" };

  const src: PayableSource[] = ((rows ?? []) as unknown as Array<{
    dispatch_date: string;
    kind: string;
    fee_amount: number;
    transport_amount: number;
    special_amount: number;
    work_hours: number | null;
    cad_clients: { name: string } | null;
  }>).map((r) => ({
    dispatch_date: r.dispatch_date,
    kind: r.kind,
    client_name: r.cad_clients?.name ?? null,
    fee_amount: r.fee_amount,
    transport_amount: r.transport_amount,
    special_amount: r.special_amount,
    work_hours: r.work_hours,
  }));
  const pay = buildPayable(src);
  if (pay.lines.length === 0) return { error: "この月に支払対象の派遣がありません" };

  const { error } = await admin.from("cad_invoices").upsert(
    {
      company_id: actor.companyId,
      kind: "payable",
      client_id: null,
      partner_id: partnerId,
      invoice_no: payableNo(ym, partner.code, partner.name),
      target_month: `${ym}-01`,
      closing_date: closingDateOf(ym, "月末"),
      issue_date: new Date().toISOString().slice(0, 10),
      subtotal: pay.total,
      tax_rate: 0, // 免税事業者
      tax: 0,
      total: pay.total,
      lines: pay.lines,
      status: "issued",
      deleted_at: null,
    },
    { onConflict: "company_id,invoice_no" }
  );
  if (error) return { error: error.message };
  revalidatePath("/invoices");
  return {};
}

/** 入金/支払 消込（Server Componentのformから呼ぶため戻り値はvoid） */
export async function markInvoiceStatus(fd: FormData): Promise<void> {
  const actor = await requireActor();
  const id = String(fd.get("id") ?? "");
  const status = String(fd.get("status") ?? "");
  if (!id || !["issued", "sent", "paid", "void"].includes(status)) return;
  const admin = createAdmin();
  await admin
    .from("cad_invoices")
    .update({ status, paid_at: status === "paid" ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath("/invoices");
}
