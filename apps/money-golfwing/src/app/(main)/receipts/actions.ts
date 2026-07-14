"use server";

import { revalidatePath } from "next/cache";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { toNum } from "@/lib/money-util";

/* 経理証憑（mon_receipts / DECISIONS #41）
   アップロード → Storage(mon-receipts) 保存 → 台帳行を作成。
   突合（mon_expense等とのリンク）はこの画面で後から設定できる。 */

const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"];
const MAX_BYTES = 8 * 1024 * 1024;

export async function uploadReceipt(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.size > MAX_BYTES) return;
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.includes(mime)) return;

  const kind = String(formData.get("kind") ?? "receipt");
  const issueDate = String(formData.get("issue_date") ?? "").trim() || null;
  const counterparty = String(formData.get("counterparty") ?? "").trim() || null;
  const amountRaw = toNum(formData.get("amount"));
  const memo = String(formData.get("memo") ?? "").trim() || null;
  const segmentId = String(formData.get("segment_id") ?? "").trim() || null;

  const yyyy = (issueDate ?? new Date().toISOString()).slice(0, 4);
  const safeName = file.name.replace(/[^\w.\-ぁ-んァ-ヶ一-龠]/g, "_").slice(-80);
  const path = `${actor.companyId}/${yyyy}/${crypto.randomUUID()}_${safeName}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const up = await admin.storage.from("mon-receipts").upload(path, buf, { contentType: mime });
  if (up.error) return;

  await admin.from("mon_receipts").insert({
    company_id: actor.companyId,
    segment_id: segmentId,
    kind,
    issue_date: issueDate,
    counterparty,
    amount: amountRaw !== 0 ? amountRaw : null,
    memo,
    storage_path: path,
    file_name: file.name,
    mime_type: mime,
    size_bytes: file.size,
    created_by: actor.name,
  });

  revalidatePath("/receipts");
}

/** メタ情報の更新（種別・日付・発行元・金額・メモ・突合状態） */
export async function updateReceipt(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const patch: Record<string, unknown> = {
    kind: String(formData.get("kind") ?? "receipt"),
    issue_date: String(formData.get("issue_date") ?? "").trim() || null,
    counterparty: String(formData.get("counterparty") ?? "").trim() || null,
    memo: String(formData.get("memo") ?? "").trim() || null,
    status: String(formData.get("status") ?? "unmatched"),
  };
  const amount = toNum(formData.get("amount"));
  patch.amount = amount !== 0 ? amount : null;

  await admin.from("mon_receipts").update(patch).eq("id", id).eq("company_id", actor.companyId);
  revalidatePath("/receipts");
}

/** 論理削除（DECISIONS #5。Storageの実体は残す＝電帳法の保存要件に配慮） */
export async function deleteReceipt(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await admin
    .from("mon_receipts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath("/receipts");
}
