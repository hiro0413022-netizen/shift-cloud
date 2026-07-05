"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";

function normMonth(input: string): string | null {
  // "2026-07" or "2026-07-01" or "2026/7" → "2026-07-01"
  const m = input.trim().replace(/\//g, "-").match(/^(\d{4})-(\d{1,2})(-\d{1,2})?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${y}-${String(mo).padStart(2, "0")}-01`;
}

async function refreshKpisAfterFinanceChange(companyId: string) {
  const admin = createAdmin();
  await admin.rpc("refresh_finance_kpis", { p_company_id: companyId });
}

/** 月次実績を1件保存（同月×事業×科目は上書き） */
export async function upsertEntry(formData: FormData) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();

  const month = normMonth(String(formData.get("target_month") ?? ""));
  const segmentId = String(formData.get("segment_id") ?? "");
  const categoryId = String(formData.get("category_id") ?? "");
  const amountRaw = String(formData.get("amount") ?? "").replace(/[,，\s]/g, "");
  const memo = String(formData.get("memo") ?? "").trim() || null;
  const amount = Number(amountRaw);
  if (!month || !segmentId || !categoryId || !Number.isFinite(amount)) return;

  const { data } = await admin
    .from("fin_entries")
    .upsert(
      {
        company_id: actor.companyId,
        segment_id: segmentId,
        category_id: categoryId,
        target_month: month,
        amount,
        memo,
        source: "manual",
        deleted_at: null,
      },
      { onConflict: "company_id,segment_id,category_id,target_month" }
    )
    .select("id")
    .single();

  await logAudit(actor, "finance.entry_upsert", "fin_entries", data?.id ?? null, null, { month, amount });
  await refreshKpisAfterFinanceChange(actor.companyId);
  revalidatePath("/finance");
  revalidatePath("/");
  revalidatePath("/future");
}

/** 実績を削除（論理削除） */
export async function deleteEntry(formData: FormData) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await admin
    .from("fin_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  await logAudit(actor, "finance.entry_delete", "fin_entries", id);
  await refreshKpisAfterFinanceChange(actor.companyId);
  revalidatePath("/finance");
}

export type CsvImportResult = {
  ok: number;
  errors: string[];
};

/**
 * CSV取込。形式: 年月,事業コード,科目コード,金額,メモ（1行目ヘッダ可）
 * 例: 2026-06,golf,sales,4500000,6月売上
 */
export async function importCsv(formData: FormData): Promise<void> {
  const actor = await requireGenesisActor();
  const admin = createAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > 1024 * 1024) return; // 1MB上限

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");

  const [{ data: segments }, { data: categories }] = await Promise.all([
    admin.from("fin_segments").select("id, code").eq("company_id", actor.companyId).is("deleted_at", null),
    admin.from("fin_categories").select("id, code").eq("company_id", actor.companyId).is("deleted_at", null),
  ]);
  const segMap = new Map((segments ?? []).map((s) => [String(s.code), String(s.id)]));
  const catMap = new Map((categories ?? []).map((c) => [String(c.code), String(c.id)]));

  let ok = 0;
  const errors: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    if (i === 0 && (cols[0].includes("年月") || cols[0].toLowerCase().includes("month"))) continue; // ヘッダ
    if (cols.length < 4) {
      errors.push(`${i + 1}行目: 列不足`);
      continue;
    }
    const month = normMonth(cols[0]);
    const segId = segMap.get(cols[1]);
    const catId = catMap.get(cols[2]);
    const amount = Number(cols[3].replace(/[,，\s"]/g, ""));
    if (!month || !segId || !catId || !Number.isFinite(amount)) {
      errors.push(`${i + 1}行目: 不正（月=${cols[0]} 事業=${cols[1]} 科目=${cols[2]} 金額=${cols[3]}）`);
      continue;
    }
    const { error } = await admin.from("fin_entries").upsert(
      {
        company_id: actor.companyId,
        segment_id: segId,
        category_id: catId,
        target_month: month,
        amount,
        memo: cols[4] || null,
        source: "csv",
        deleted_at: null,
      },
      { onConflict: "company_id,segment_id,category_id,target_month" }
    );
    if (error) errors.push(`${i + 1}行目: ${error.message}`);
    else ok++;
  }

  await logAudit(actor, "finance.csv_import", "fin_entries", null, null, { ok, errors: errors.slice(0, 10) });
  await logEvent(actor.companyId, {
    event_type: "finance.csv_imported",
    title: `財務CSV取込: ${ok}件成功${errors.length ? ` / ${errors.length}件エラー` : ""}`,
    source: "genesis",
    source_type: "human",
    severity: errors.length ? "warning" : "info",
  });
  await refreshKpisAfterFinanceChange(actor.companyId);
  revalidatePath("/finance");
  revalidatePath("/");
  revalidatePath("/future");
}

/** Shift Cloudの人件費概算を当該月の「本部・共通/人件費」に取り込む */
export async function importLaborFromShiftCloud(formData: FormData) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const month = normMonth(String(formData.get("target_month") ?? ""));
  if (!month) return;

  // kpis.labor_cost のtrendから該当月を取得（0008で自動集計済み）
  const { data: kpi } = await admin
    .from("kpis")
    .select("trend")
    .eq("company_id", actor.companyId)
    .eq("code", "labor_cost")
    .single();
  const point = (Array.isArray(kpi?.trend) ? kpi.trend : []).find(
    (p) => typeof p === "object" && p != null && String((p as { date?: string }).date) === month
  ) as { value?: number } | undefined;
  if (point?.value == null) return;

  const [{ data: seg }, { data: cat }] = await Promise.all([
    admin.from("fin_segments").select("id").eq("company_id", actor.companyId).eq("code", "hq").single(),
    admin.from("fin_categories").select("id").eq("company_id", actor.companyId).eq("code", "labor").single(),
  ]);
  if (!seg || !cat) return;

  await admin.from("fin_entries").upsert(
    {
      company_id: actor.companyId,
      segment_id: seg.id,
      category_id: cat.id,
      target_month: month,
      amount: Number(point.value),
      memo: "Shift Cloud勤怠×時給の概算から取込",
      source: "shift_cloud",
      deleted_at: null,
    },
    { onConflict: "company_id,segment_id,category_id,target_month" }
  );
  await logAudit(actor, "finance.labor_import", "fin_entries", null, null, { month, amount: point.value });
  await refreshKpisAfterFinanceChange(actor.companyId);
  revalidatePath("/finance");
}
