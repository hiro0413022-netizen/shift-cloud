"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/kernel";

export type ImportState = { ok?: boolean; error?: string; message?: string };

function cellText(v: ExcelJS.CellValue): string | null {
  if (v == null) return null;
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim() || null;
    if (o.text != null) return String(o.text).trim() || null;
    if (o.result != null) return String(o.result).trim() || null;
  }
  const s = String(v).trim();
  return s === "" ? null : s;
}
function cellDate(v: ExcelJS.CellValue): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}
function cellInt(v: ExcelJS.CellValue): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function cellTime(v: ExcelJS.CellValue): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(11, 16);
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

async function loadSheet(formData: FormData): Promise<ExcelJS.Worksheet | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any);
  return wb.worksheets[0] ?? null;
}

/** Smart Hello「会員名簿」取込（全件スナップショット洗い替え・機微列は取り込まない） */
export async function importMembers(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const actor = await requireReceptionActor();
  const ws = await loadSheet(formData);
  if (!ws) return { error: "会員名簿ファイルを選択してください" };
  const admin = createAdmin();
  const C = (row: ExcelJS.Row, i: number) => row.getCell(i).value;

  const rows: Record<string, unknown>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const memberNo = cellText(C(row, 1));
    if (!memberNo) return;
    rows.push({
      company_id: actor.companyId,
      member_no: memberNo,
      name: cellText(C(row, 2)),
      name_kana: cellText(C(row, 3)),
      gender: cellText(C(row, 4)),
      birth_date: cellDate(C(row, 5)),
      age: cellInt(C(row, 6)),
      join_date: cellDate(C(row, 7)),
      leave_date: cellDate(C(row, 9)),
      leave_reason: cellText(C(row, 32)),
      member_type: cellText(C(row, 19)),
      class_name: cellText(C(row, 21)),
      store_name: cellText(C(row, 15)),
      campaign: cellText(C(row, 29)),
      suspend_start: cellText(C(row, 37)),
      suspend_end: cellText(C(row, 38)),
      payment_method: cellText(C(row, 69)),
      monthly_visits: cellInt(C(row, 86)),
      last_visit_date: cellDate(C(row, 87)),
    });
  });
  if (rows.length === 0) return { error: "会員データが見つかりません（列が想定と異なる可能性）" };

  await admin.from("mbr_members").delete().eq("company_id", actor.companyId);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("mbr_members").insert(rows.slice(i, i + 500));
    if (error) return { error: `取込エラー: ${error.message}` };
  }
  await admin.rpc("refresh_smart_hello_kpis", { p_company_id: actor.companyId });
  await logAudit(actor, "smarthello.members_import", "mbr_members", null, null, { count: rows.length });
  revalidatePath("/import");
  return { ok: true, message: `会員名簿を取込みました（${rows.length}件）。会員数・退会率KPIを更新しました。` };
}

/** Smart Hello「予約一覧」取込（予約番号で重複防止・個人情報は取り込まない） */
export async function importReservations(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const actor = await requireReceptionActor();
  const ws = await loadSheet(formData);
  if (!ws) return { error: "予約一覧ファイルを選択してください" };
  const admin = createAdmin();
  const C = (row: ExcelJS.Row, i: number) => row.getCell(i).value;

  const rows: Record<string, unknown>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const no = cellText(C(row, 18));
    if (!no) return;
    rows.push({
      company_id: actor.companyId,
      reservation_no: no,
      store_name: cellText(C(row, 2)),
      program_type: cellText(C(row, 4)),
      program: cellText(C(row, 6)),
      place: cellText(C(row, 9)),
      staff_name: cellText(C(row, 12)),
      lesson_date: cellDate(C(row, 15)),
      start_time: cellTime(C(row, 16)),
      end_time: cellTime(C(row, 17)),
      reservation_kind: cellText(C(row, 19)),
      member_no: cellText(C(row, 20)),
      status: cellText(C(row, 37)),
      attendance: cellText(C(row, 41)),
      amount: cellInt(C(row, 45)),
    });
  });
  if (rows.length === 0) return { error: "予約データが見つかりません（列が想定と異なる可能性）" };

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("mbr_reservations")
      .upsert(rows.slice(i, i + 500), { onConflict: "company_id,reservation_no" });
    if (error) return { error: `取込エラー: ${error.message}` };
  }
  await logAudit(actor, "smarthello.reservations_import", "mbr_reservations", null, null, { count: rows.length });
  revalidatePath("/import");
  return { ok: true, message: `予約一覧を取込みました（${rows.length}件・予約番号で重複排除）。` };
}
