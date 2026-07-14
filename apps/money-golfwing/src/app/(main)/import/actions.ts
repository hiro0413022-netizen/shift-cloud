"use server";

import { revalidatePath } from "next/cache";
import { requireManageAll } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { parseBankCsv, type BankMapping } from "@/lib/import/bankCsv";
import type { ImportResult } from "@/lib/import/categorize";

/** cp932/shift_jis 等のラベルをNode TextDecoderが解釈できる形へ */
function decoderLabel(enc?: string): string {
  const e = (enc ?? "utf-8").toLowerCase();
  if (e === "cp932" || e === "windows-31j" || e === "ms932") return "shift_jis";
  return e;
}

/** CSVアップロード → mon_bank_txn へ取込（未仕分け）。dedup_keyで重複スキップ。 */
export async function importCsv(formData: FormData): Promise<ImportResult> {
  const actor = await requireManageAll();
  const admin = createAdmin();

  const code = String(formData.get("source_code") ?? "");
  const file = formData.get("file");
  if (!code) return { ok: 0, skipped: 0, errors: ["取込元を選択してください"] };
  if (!(file instanceof File) || file.size === 0) return { ok: 0, skipped: 0, errors: ["ファイルがありません"] };
  if (file.size > 5 * 1024 * 1024) return { ok: 0, skipped: 0, errors: ["5MBを超えています"] };

  const { data: src } = await admin
    .from("mon_bank_source")
    .select("id, mapping")
    .eq("company_id", actor.companyId)
    .eq("code", code)
    .single();
  if (!src) return { ok: 0, skipped: 0, errors: [`取込元 ${code} が未登録です`] };

  const mapping = src.mapping as BankMapping;
  const buf = Buffer.from(await file.arrayBuffer());
  const text = new TextDecoder(decoderLabel(mapping.encoding)).decode(buf);

  const { rows, errors } = parseBankCsv(text, mapping, code);
  if (rows.length === 0) return { ok: 0, skipped: 0, errors: errors.length ? errors : ["取込対象の明細がありません"], source: code };

  const payload = rows.map((r) => ({
    company_id: actor.companyId,
    source_id: src.id,
    txn_date: r.txn_date,
    description: r.description,
    amount: r.amount,
    balance: r.balance,
    dedup_key: r.dedup_key,
    raw: r.raw,
  }));

  // ignoreDuplicates: dedup_keyが既存の行はスキップ。挿入できた行だけ返る。
  const { data: inserted, error } = await admin
    .from("mon_bank_txn")
    .upsert(payload, { onConflict: "company_id,source_id,dedup_key", ignoreDuplicates: true })
    .select("id");

  if (error) return { ok: 0, skipped: 0, errors: [error.message], source: code };

  const ok = inserted?.length ?? 0;
  revalidatePath("/import");
  revalidatePath("/");
  return { ok, skipped: rows.length - ok, errors: errors.slice(0, 5), source: code };
}

/** 明細に事業・科目を割当てて確定 → fin_entriesへ集約しKPI再計算。 */
export async function confirmTxn(formData: FormData): Promise<void> {
  const actor = await requireManageAll();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  const segmentId = String(formData.get("segment_id") ?? "");
  const category = String(formData.get("category") ?? "");
  if (!id || !segmentId || !category) return;

  await admin
    .from("mon_bank_txn")
    .update({ segment_id: segmentId, category, status: "confirmed" })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  await admin.rpc("refresh_money_to_finance", { p_company_id: actor.companyId });
  revalidatePath("/import");
  revalidatePath("/");
}

/** 明細を除外（会社経費でない個人利用など）。 */
export async function ignoreTxn(formData: FormData): Promise<void> {
  const actor = await requireManageAll();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await admin
    .from("mon_bank_txn")
    .update({ status: "ignored" })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath("/import");
}
