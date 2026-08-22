"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@yozan/core/supabase/admin";
import { getMasters, ymRange } from "@/lib/caddy";
import type { DispatchStatus } from "@/lib/shift";
import {
  billingRange,
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
      .eq("status", "confirmed")
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
      {
        company_id: actor.companyId,
        partner_id: partnerId,
        date,
        status,
        source: "admin", // 管理者の代理入力。本人提出は submitSelfAvailability が "self" を立てる
        submitted_at: new Date().toISOString(),
        deleted_at: null,
      },
      { onConflict: "partner_id,date" }
    );
  if (error) return { error: error.message };
  revalidatePath("/availability");
  revalidatePath("/calendar");
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
  // 提出用CSVの書式と送り先（migration 0118）。ゴルフ場ごとに欲しい形が違うため列で持つ
  csv_format: z.enum(["standard", "simple", "grouped", "wide"]).default("standard"),
  contact_name: z.string().max(120).nullable(),
  contact_email: z.string().max(200).nullable(),
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
    csv_format: (str(fd, "csv_format") ?? "standard") as "standard" | "simple" | "grouped" | "wide",
    contact_name: str(fd, "contact_name"),
    contact_email: str(fd, "contact_email"),
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
  // 連絡先（migration 0118）。LINEで提出URLを配る運用のため電話・メールを持つ
  phone: z.string().max(40).nullable(),
  email: z.string().max(200).nullable(),
  show_in_picker: z.coerce.boolean(),
  status: z.enum(["active", "inactive"]).default("active"),
  memo: z.string().max(500).nullable(),
  // 振込先（キャディ→YOZAN支払請求書に印字 / migration 0090・任意）
  bank_name: z.string().max(120).nullable(),
  bank_branch: z.string().max(120).nullable(),
  bank_account_type: z.enum(["普通", "当座"]).nullable(),
  bank_account_no: z.string().max(20).regex(/^\d*$/, "口座番号は数字で入力してください").nullable(),
  bank_holder: z.string().max(120).nullable(),
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
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    show_in_picker: fd.get("show_in_picker") === "on" || fd.get("show_in_picker") === "true",
    status: (str(fd, "status") ?? "active") as "active" | "inactive",
    memo: str(fd, "memo"),
    bank_name: str(fd, "bank_name"),
    bank_branch: str(fd, "bank_branch"),
    bank_account_type: str(fd, "bank_account_type") as "普通" | "当座" | null,
    bank_account_no: str(fd, "bank_account_no"),
    bank_holder: str(fd, "bank_holder"),
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

/* ============================================================
   設定: 請求書の差出人・振込先（companies.settings.invoice）
   請求書ヘッダーの会社情報と振込先銀行をここで編集する。
   ============================================================ */
const invoiceSettingsSchema = z.object({
  company_name: z.string().max(120).nullable(),
  representative: z.string().max(120).nullable(),
  postal_code: z.string().max(20).nullable(),
  address: z.string().max(200).nullable(),
  bank_name: z.string().max(120).nullable(),
  bank_account: z.string().max(120).nullable(),
  bank_holder: z.string().max(120).nullable(),
});

export async function saveInvoiceSettings(fd: FormData): Promise<{ error?: string }> {
  const actor = await requireActor();
  const parsed = invoiceSettingsSchema.safeParse({
    company_name: str(fd, "company_name"),
    representative: str(fd, "representative"),
    postal_code: str(fd, "postal_code"),
    address: str(fd, "address"),
    bank_name: str(fd, "bank_name"),
    bank_account: str(fd, "bank_account"),
    bank_holder: str(fd, "bank_holder"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };

  const admin = createAdmin();
  const { data: company } = await admin.from("companies").select("settings").eq("id", actor.companyId).single();
  const settings = (company?.settings ?? {}) as Record<string, unknown>;
  const invoice = { ...((settings.invoice as Record<string, unknown>) ?? {}), ...parsed.data };
  const { error } = await admin
    .from("companies")
    .update({ settings: { ...settings, invoice } })
    .eq("id", actor.companyId);
  if (error) return { error: error.message };
  revalidatePath("/masters");
  revalidatePath("/invoices");
  return {};
}

/**
 * 派遣行の「請求月」上書き（研修者など請求が月をまたぐ場合 / migration 0089）。
 * null で解除＝取引先の締め期間どおりに戻る。
 */
export async function setDispatchBillingYm(id: string, billingYm: string | null): Promise<{ error?: string }> {
  const actor = await requireActor();
  if (billingYm && !/^\d{4}-\d{2}$/.test(billingYm)) return { error: "請求月は YYYY-MM 形式で指定してください" };
  const admin = createAdmin();
  const { error } = await admin
    .from("cad_dispatches")
    .update({ billing_ym: billingYm })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  if (error) return { error: error.message };
  revalidatePath("/dispatches");
  revalidatePath("/invoices");
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
  assignee: string, // "p:<partnerId>" | "s:<staffId>"（委託先 or 社員）
  amount: number | null
): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();

  const isPartner = assignee.startsWith("p:");
  const isStaff = assignee.startsWith("s:");
  if (!isPartner && !isStaff) return { error: "担当種別が不正です" };
  const refId = assignee.slice(2);
  const col = isPartner ? "partner_id" : "staff_id";

  // まず既存の単価行を消す（空欄=単価削除＝default_transportにフォールバック）
  await admin
    .from("cad_transport_rates")
    .delete()
    .eq("company_id", actor.companyId)
    .eq("client_id", clientId)
    .eq(col, refId);

  if (amount === null || Number.isNaN(amount)) {
    revalidatePath("/masters");
    revalidatePath("/dispatches");
    return {};
  }

  const row: Record<string, unknown> = { company_id: actor.companyId, client_id: clientId, amount };
  row[col] = refId;
  const { error } = await admin.from("cad_transport_rates").insert(row);
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

  const [{ data: client }, { data: company }] = await Promise.all([
    admin
      .from("cad_clients")
      .select("id, code, name, closing_day")
      .eq("id", clientId)
      .eq("company_id", actor.companyId)
      .single(),
    admin.from("companies").select("settings").eq("id", actor.companyId).single(),
  ]);
  if (!client) return { error: "取引先が見つかりません" };

  // 締め期間（20日締めなら前月21日〜当月20日）＋ 請求月の上書き行（プレビュー画面と同じ条件）
  const { from, to } = billingRange(ym, client.closing_day);
  const { data: rows } = await admin
    .from("cad_dispatches")
    .select("dispatch_date, sales_amount")
    .eq("company_id", actor.companyId)
    .eq("status", "confirmed") // 請求は確定した派遣だけ（migration 0118）
    .eq("client_id", clientId)
    .or(`and(dispatch_date.gte.${from},dispatch_date.lte.${to},billing_ym.is.null),billing_ym.eq.${ym}`)
    .is("deleted_at", null)
    .gt("sales_amount", 0);
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
      .eq("status", "confirmed") // 支払も確定した派遣だけ（migration 0118）
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
      tax_rate: 0, // 内税（合計に含む・上乗せしない）
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

/* ============================================================
   シフトカレンダー / 派遣の確定（DECISIONS #140 / migration 0118）

   小川さん依頼の中核。「〇月〇日・〇〇ゴルフ場・〇〇さん」を作って［確定］を押すだけで、
   派遣台帳・キャディ台帳・ゴルフ場提出CSV・請求・財務まで全部そこから生成される。
   ＝ 同じ情報を二度入力しない。新しいテーブルは足していない（元データは cad_dispatches 1本）。
   ============================================================ */

const assignSchema = z.object({
  dispatch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付が不正です"),
  client_id: z.string().uuid().nullable(),
  assignee: z.string().min(3), // "p:<partnerId>" | "s:<staffId>"
  status: z.enum(["tentative", "confirmed"]).default("tentative"),
  memo: z.string().max(500).nullable().optional(),
});

/**
 * カレンダーから1件割り当てる。金額はマスタから自動で埋める（#62 ②③の単価表を再利用）:
 *   売上   = ゴルフ場の売上単価
 *   委託料 = ゴルフ場の委託料 → 無ければキャディの標準委託料
 *   交通費 = 交通費単価表（キャディ×ゴルフ場）→ 無ければキャディの標準交通費
 * 社員（s:）は委託料・手当0（給与側で支給＝二重計上の防止。DBのCHECKでも弾かれる）。
 */
export async function assignDispatch(
  input: z.input<typeof assignSchema>
): Promise<{ error?: string; id?: string; updated?: boolean; unchanged?: boolean }> {
  const actor = await requireActor();
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力エラー" };
  const v = parsed.data;
  const { partner_id, staff_id } = parseAssignee(v.assignee);
  if (!partner_id && !staff_id) return { error: "キャディを選んでください" };

  const admin = createAdmin();
  const ym = v.dispatch_date.slice(0, 7);

  // 重複判定は「同じ日 × 同じキャディ（partner_id / staff_id）」。日付だけでは判定しない。
  // 取消・削除済みは対象外（取消した後に同じ人を入れ直せる）。
  const dupCol = partner_id ? "partner_id" : "staff_id";
  const { data: dupRows, error: dupErr } = await admin
    .from("cad_dispatches")
    .select("id, status, client_id")
    .eq("company_id", actor.companyId)
    .eq("dispatch_date", v.dispatch_date)
    .eq(dupCol, partner_id ?? staff_id!)
    .neq("status", "cancelled")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (dupErr) return { error: dupErr.message };
  const existing = (dupRows ?? [])[0] as { id: string; status: DispatchStatus; client_id: string | null } | undefined;

  // ── 既に同じキャディがその日に入っている → 新規登録ではなく「更新」に分岐 ──
  //   仮 →［確定で追加］ : その行を確定にする（以前は「既に割り当て済みです」で止まり、確定できなかった）
  //   確定 →［確定で追加］: 二重登録せず、そのまま成功扱い（冪等）
  //   仮 →［仮で追加］   : 二重登録せず、そのまま成功扱い
  //   ゴルフ場を変えて押した場合は、仮なら差し替え（金額も再計算）、確定済みなら止める
  if (existing) {
    const sameClient = (existing.client_id ?? null) === (v.client_id ?? null);
    if (existing.status === "confirmed") {
      if (!sameClient) {
        return { error: "この日は別のゴルフ場で確定済みです。先に「仮に戻す」か「取消」をしてください" };
      }
      return { id: existing.id, unchanged: true };
    }
    // existing.status === "tentative"
    if (sameClient && v.status === "tentative") return { id: existing.id, unchanged: true };

    const patch: Record<string, unknown> = {
      status: v.status,
      confirmed_at: v.status === "confirmed" ? new Date().toISOString() : null,
      confirmed_by: v.status === "confirmed" ? actor.staffId : null,
    };
    if (!sameClient) {
      // ゴルフ場の差し替え: 売上・委託料・交通費をマスタから引き直す（仮なので請求には未反映）
      const amounts = await amountsFromMasters(actor.companyId, v.client_id, partner_id, staff_id);
      Object.assign(patch, { client_id: v.client_id, ...amounts });
    }
    if (v.memo !== undefined) patch.memo = v.memo ?? null;

    const { error } = await admin
      .from("cad_dispatches")
      .update(patch)
      .eq("id", existing.id)
      .eq("company_id", actor.companyId);
    if (error) return { error: error.message };

    if (v.status === "confirmed") await afterConfirm(actor.companyId, ym);
    revalidateShift();
    return { id: existing.id, updated: true };
  }

  const amounts = await amountsFromMasters(actor.companyId, v.client_id, partner_id, staff_id);

  const row = {
    company_id: actor.companyId,
    dispatch_date: v.dispatch_date,
    kind: "dispatch",
    status: v.status,
    confirmed_at: v.status === "confirmed" ? new Date().toISOString() : null,
    confirmed_by: v.status === "confirmed" ? actor.staffId : null,
    client_id: v.client_id,
    partner_id,
    staff_id,
    ...amounts,
    special_amount: 0,
    memo: v.memo ?? null,
  };

  const { data, error } = await admin.from("cad_dispatches").insert(row).select("id").single();
  if (error) return { error: error.message };

  if (v.status === "confirmed") await afterConfirm(actor.companyId, ym);
  revalidateShift();
  return { id: (data as { id: string }).id };
}

/**
 * 金額をマスタから自動で埋める（#62 ②③の単価表を再利用）:
 *   売上   = ゴルフ場の売上単価
 *   委託料 = ゴルフ場の委託料 → 無ければキャディの標準委託料
 *   交通費 = 交通費単価表（キャディ×ゴルフ場）→ 無ければキャディの標準交通費
 * 社員（staff_id）は委託料0（給与側で支給＝二重計上の防止。DBのCHECKでも弾かれる）。
 */
async function amountsFromMasters(
  companyId: string,
  clientId: string | null,
  partnerId: string | null,
  staffId: string | null
): Promise<{ sales_amount: number; fee_amount: number; transport_amount: number }> {
  const masters = await getMasters(companyId);
  const client = clientId ? masters.clients.find((c) => c.id === clientId) : undefined;
  const partner = partnerId ? masters.partners.find((p) => p.id === partnerId) : undefined;
  const refId = partnerId ?? staffId!;
  const transport =
    (clientId ? masters.transportRates[`${clientId}__${refId}`] : undefined) ?? partner?.default_transport ?? 0;
  return {
    sales_amount: client?.unit_price ?? 0,
    fee_amount: staffId ? 0 : (client?.partner_fee ?? partner?.default_fee ?? 0),
    transport_amount: transport,
  };
}

/** 確定後の後処理: 採番の振り直し → 財務へ再集計。確定を押した瞬間に他データへ波及する */
async function afterConfirm(companyId: string, ym: string) {
  const admin = createAdmin();
  await admin.rpc("renumber_caddy_seq", { p_company_id: companyId, p_month: `${ym}-01` });
  await refreshFinance(companyId, ym);
}

function revalidateShift() {
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/dispatches");
  revalidatePath("/ledger");
  revalidatePath("/exports");
  revalidatePath("/invoices");
}

/** 1件のステータス変更（仮 → 確定 / 確定 → 取消）。取消しても履歴は残す（論理削除ではない） */
export async function setDispatchStatus(
  id: string,
  status: "tentative" | "confirmed" | "cancelled"
): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  const { data: cur } = await admin
    .from("cad_dispatches")
    .select("dispatch_date")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!cur) return { error: "対象が見つかりません" };

  const { error } = await admin
    .from("cad_dispatches")
    .update({
      status,
      confirmed_at: status === "confirmed" ? new Date().toISOString() : null,
      confirmed_by: status === "confirmed" ? actor.staffId : null,
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  if (error) return { error: error.message };

  await afterConfirm(actor.companyId, (cur as { dispatch_date: string }).dispatch_date.slice(0, 7));
  revalidateShift();
  return {};
}

/** その日の仮組みをまとめて確定（1日分の割当を作り終えてから1回押す運用） */
export async function confirmDay(date: string): Promise<{ error?: string; count?: number }> {
  const actor = await requireActor();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "日付が不正です" };
  const admin = createAdmin();
  const { data, error } = await admin
    .from("cad_dispatches")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: actor.staffId })
    .eq("company_id", actor.companyId)
    .eq("dispatch_date", date)
    .eq("status", "tentative")
    .is("deleted_at", null)
    .select("id");
  if (error) return { error: error.message };

  await afterConfirm(actor.companyId, date.slice(0, 7));
  revalidateShift();
  return { count: (data ?? []).length };
}

/** 月内の仮組みをまとめて確定（月末に一括で締める運用） */
export async function confirmMonth(ym: string): Promise<{ error?: string; count?: number }> {
  const actor = await requireActor();
  if (!/^\d{4}-\d{2}$/.test(ym)) return { error: "対象月が不正です" };
  const { from, to } = ymRange(ym);
  const admin = createAdmin();
  const { data, error } = await admin
    .from("cad_dispatches")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString(), confirmed_by: actor.staffId })
    .eq("company_id", actor.companyId)
    .gte("dispatch_date", from)
    .lte("dispatch_date", to)
    .eq("status", "tentative")
    .is("deleted_at", null)
    .select("id");
  if (error) return { error: error.message };

  await afterConfirm(actor.companyId, ym);
  revalidateShift();
  return { count: (data ?? []).length };
}

/** カレンダーからの削除（論理削除・戻り値あり版） */
export async function removeDispatch(id: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  const { data: cur } = await admin
    .from("cad_dispatches")
    .select("dispatch_date")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  const { error } = await admin
    .from("cad_dispatches")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  if (error) return { error: error.message };
  if (cur) await refreshFinance(actor.companyId, (cur as { dispatch_date: string }).dispatch_date.slice(0, 7));
  revalidateShift();
  return {};
}

/* ============================================================
   キャディ本人のシフト希望提出（スマホ / migration 0118）

   トークン付きURL（/s/<token>）を LINE で1回配れば、以後は本人がスマホから入れられる。
   ログイン不要。公開ルートなので service_role の前に必ずトークンで本人を特定する（#12/#23と同型）。
   ============================================================ */

/** 提出用URLのトークンを発行/再発行する。再発行すると旧URLは即座に無効になる */
export async function issuePartnerToken(partnerId: string): Promise<{ error?: string; token?: string }> {
  const actor = await requireActor();
  const token = randomToken();
  const admin = createAdmin();
  const { error } = await admin
    .from("cad_partners")
    .update({ submit_token: token })
    .eq("id", partnerId)
    .eq("company_id", actor.companyId);
  if (error) return { error: error.message };
  revalidatePath("/masters");
  return { token };
}

/** 提出URLを止める（退職時など） */
export async function clearPartnerToken(partnerId: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  const { error } = await admin
    .from("cad_partners")
    .update({ submit_token: null })
    .eq("id", partnerId)
    .eq("company_id", actor.companyId);
  if (error) return { error: error.message };
  revalidatePath("/masters");
  return {};
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 本人からの提出（公開・ログイン不要）。
 * requireActor() は使えないので、トークンで委託先を特定し、その委託先の行しか触れないようにする。
 */
export async function submitSelfAvailability(
  token: string,
  date: string,
  status: "available" | "maybe" | "unavailable" | "",
  memo?: string | null
): Promise<{ error?: string }> {
  if (!/^[0-9a-f]{16,64}$/.test(token)) return { error: "URLが不正です" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "日付が不正です" };

  const admin = createAdmin();
  const { data: partner } = await admin
    .from("cad_partners")
    .select("id, company_id, status")
    .eq("submit_token", token)
    .is("deleted_at", null)
    .single();
  const p = partner as { id: string; company_id: string; status: string } | null;
  if (!p || p.status !== "active") return { error: "このURLは無効です。担当者へご連絡ください" };

  if (!status) {
    await admin.from("cad_availability").delete().eq("partner_id", p.id).eq("date", date);
  } else {
    const { error } = await admin.from("cad_availability").upsert(
      {
        company_id: p.company_id,
        partner_id: p.id,
        date,
        status,
        memo: memo ?? null,
        source: "self",
        submitted_at: new Date().toISOString(),
        deleted_at: null,
      },
      { onConflict: "partner_id,date" }
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/availability");
  revalidatePath("/calendar");
  revalidatePath(`/s/${token}`);
  return {};
}
