"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLegalActor } from "@/lib/auth";
import { createDocument, setStatus, DOC_TYPES, type DocType } from "@/lib/legal";

export async function createDocumentAction(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const actor = await requireLegalActor();

  const docType = String(formData.get("doc_type") ?? "contract");
  if (!DOC_TYPES.includes(docType as DocType)) return { error: "種別が不正です" };

  const noticeRaw = String(formData.get("renewal_notice_days") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;

  const result = await createDocument(
    actor,
    {
      title: String(formData.get("title") ?? ""),
      doc_type: docType as DocType,
      counterparty: String(formData.get("counterparty") ?? ""),
      segment_id: String(formData.get("segment_id") ?? "") || null,
      effective_date: String(formData.get("effective_date") ?? "") || null,
      expiry_date: String(formData.get("expiry_date") ?? "") || null,
      auto_renew: formData.get("auto_renew") === "on",
      renewal_notice_days: noticeRaw ? Number(noticeRaw) : null,
      amount: amountRaw ? Number(amountRaw) : null,
      summary: String(formData.get("summary") ?? ""),
    },
    file
  );

  if ("error" in result) return { error: result.error };
  revalidatePath("/documents");
  revalidatePath("/");
  redirect(`/documents/${result.id}`);
}

export async function setStatusAction(formData: FormData): Promise<void> {
  const actor = await requireLegalActor();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !status) return;
  await setStatus(actor, id, status);
  revalidatePath(`/documents/${id}`);
  revalidatePath("/documents");
  revalidatePath("/");
}
