import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent, logAudit } from "@/lib/kernel";
import type { LegalActor } from "@/lib/auth";
import {
  DOC_TYPES,
  DOC_TYPE_LABELS,
  STATUS_LABELS,
  RISK_LABELS,
  type DocType,
} from "@/lib/legal-constants";

export const BUCKET = "legal-docs";

export { DOC_TYPES, DOC_TYPE_LABELS, STATUS_LABELS, RISK_LABELS };
export type { DocType };

export type LegalDocument = {
  id: string;
  company_id: string;
  segment_id: string | null;
  doc_type: string;
  title: string;
  counterparty: string | null;
  status: string;
  effective_date: string | null;
  expiry_date: string | null;
  auto_renew: boolean;
  renewal_notice_days: number | null;
  next_action_date: string | null;
  amount: number | null;
  currency: string;
  risk_level: string | null;
  summary: string | null;
  detail: Record<string, unknown>;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LegalFile = {
  id: string;
  document_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  kind: string;
  uploaded_by: string | null;
  created_at: string;
};

export type LegalReminder = {
  id: string;
  document_id: string;
  kind: string;
  due_date: string;
  lead_days: number;
  status: string;
  note: string | null;
};

/** 解約判断すべき期日 = 満了日 − 解約通知に必要な日数 */
export function computeNextActionDate(
  expiry: string | null,
  noticeDays: number | null
): string | null {
  if (!expiry || !noticeDays) return null;
  const d = new Date(expiry + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - noticeDays);
  return d.toISOString().slice(0, 10);
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(date + "T00:00:00Z");
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function sanitizeFileName(name: string): string {
  // 日本語は保持しつつ、パス・制御文字を除去
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 180) || "file";
}

export type Segment = { id: string; name: string; code: string };

/** 事業セグメント一覧（fin_segmentsを流用。全社契約は null 選択） */
export async function listSegments(actor: LegalActor): Promise<Segment[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("fin_segments")
    .select("id, name, code")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  return (data ?? []) as Segment[];
}

// ============================================================
// 一覧 / 取得
// ============================================================

export type ListFilters = {
  status?: string;
  docType?: string;
  q?: string;
};

export async function listDocuments(
  actor: LegalActor,
  filters: ListFilters = {}
): Promise<LegalDocument[]> {
  const admin = createAdmin();
  let query = admin
    .from("leg_documents")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.docType) query = query.eq("doc_type", filters.docType);
  if (filters.q) query = query.or(`title.ilike.%${filters.q}%,counterparty.ilike.%${filters.q}%`);

  const { data } = await query
    .order("next_action_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []) as LegalDocument[];
}

export async function getDocument(
  actor: LegalActor,
  id: string
): Promise<{ doc: LegalDocument; files: LegalFile[]; reminders: LegalReminder[] } | null> {
  const admin = createAdmin();
  const { data: doc } = await admin
    .from("leg_documents")
    .select("*")
    .eq("company_id", actor.companyId)
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (!doc) return null;

  const { data: files } = await admin
    .from("leg_files")
    .select("*")
    .eq("company_id", actor.companyId)
    .eq("document_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const { data: reminders } = await admin
    .from("leg_reminders")
    .select("*")
    .eq("company_id", actor.companyId)
    .eq("document_id", id)
    .is("deleted_at", null)
    .order("due_date", { ascending: true });

  return {
    doc: doc as LegalDocument,
    files: (files ?? []) as LegalFile[],
    reminders: (reminders ?? []) as LegalReminder[],
  };
}

// ============================================================
// 作成（ファイルアップロード込み）
// ============================================================

export type CreateInput = {
  title: string;
  doc_type: DocType;
  counterparty?: string | null;
  segment_id?: string | null;
  effective_date?: string | null;
  expiry_date?: string | null;
  auto_renew?: boolean;
  renewal_notice_days?: number | null;
  amount?: number | null;
  summary?: string | null;
};

export async function createDocument(
  actor: LegalActor,
  input: CreateInput,
  file: File | null
): Promise<{ id: string } | { error: string }> {
  if (!actor.canWrite) return { error: "登録権限がありません" };
  if (!input.title?.trim()) return { error: "件名は必須です" };

  const admin = createAdmin();
  const nextAction = computeNextActionDate(
    input.expiry_date ?? null,
    input.renewal_notice_days ?? null
  );

  const { data: doc, error } = await admin
    .from("leg_documents")
    .insert({
      company_id: actor.companyId,
      segment_id: input.segment_id || null,
      doc_type: input.doc_type,
      title: input.title.trim(),
      counterparty: input.counterparty?.trim() || null,
      status: "draft",
      effective_date: input.effective_date || null,
      expiry_date: input.expiry_date || null,
      auto_renew: !!input.auto_renew,
      renewal_notice_days: input.renewal_notice_days ?? null,
      next_action_date: nextAction,
      amount: input.amount ?? null,
      summary: input.summary?.trim() || null,
      created_by: actor.name,
      source: "app",
    })
    .select("id")
    .single();

  if (error || !doc) return { error: error?.message ?? "登録に失敗しました" };
  const docId = doc.id as string;

  // ファイルをStorageへ
  if (file && file.size > 0) {
    const path = `${actor.companyId}/${docId}/${sanitizeFileName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
    if (!upErr) {
      await admin.from("leg_files").insert({
        company_id: actor.companyId,
        document_id: docId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        kind: "original",
        uploaded_by: actor.name,
      });
    }
  }

  // 期限リマインダー生成
  await generateReminders(actor.companyId, docId, {
    expiry_date: input.expiry_date ?? null,
    next_action_date: nextAction,
    auto_renew: !!input.auto_renew,
  });

  // Kernel記録
  await logEvent(actor.companyId, {
    event_type: "legal.document_registered",
    title: `契約登録: ${input.title.trim()}`,
    description: `${DOC_TYPE_LABELS[input.doc_type] ?? input.doc_type}${
      input.counterparty ? ` / ${input.counterparty}` : ""
    }`,
    source: "legal-os",
    source_type: "human",
    severity: "info",
    status: "open",
  });
  await logAudit(actor, "insert", "leg_documents", docId, null, { title: input.title });

  return { id: docId };
}

async function generateReminders(
  companyId: string,
  documentId: string,
  o: { expiry_date: string | null; next_action_date: string | null; auto_renew: boolean }
) {
  const admin = createAdmin();
  const rows: Array<{
    company_id: string;
    document_id: string;
    kind: string;
    due_date: string;
    lead_days: number;
  }> = [];
  if (o.next_action_date) {
    rows.push({
      company_id: companyId,
      document_id: documentId,
      kind: "termination_notice",
      due_date: o.next_action_date,
      lead_days: 14,
    });
  }
  if (o.expiry_date) {
    rows.push({
      company_id: companyId,
      document_id: documentId,
      kind: o.auto_renew ? "renewal" : "expiry",
      due_date: o.expiry_date,
      lead_days: 30,
    });
  }
  if (rows.length) await admin.from("leg_reminders").insert(rows);
}

// ============================================================
// ステータス更新（manager）
// ============================================================

export async function setStatus(
  actor: LegalActor,
  id: string,
  status: string
): Promise<{ ok: true } | { error: string }> {
  if (!actor.canManage) return { error: "権限がありません" };
  if (!STATUS_LABELS[status]) return { error: "不正なステータス" };
  const admin = createAdmin();
  const { error } = await admin
    .from("leg_documents")
    .update({ status, approved_by: status === "active" ? actor.name : undefined })
    .eq("company_id", actor.companyId)
    .eq("id", id);
  if (error) return { error: error.message };
  await logAudit(actor, "update", "leg_documents", id, null, { status });
  return { ok: true };
}

// ============================================================
// 署名付きURL（ファイル閲覧）
// ============================================================

export async function signedUrlForFile(
  actor: LegalActor,
  fileId: string
): Promise<string | null> {
  const admin = createAdmin();
  const { data: file } = await admin
    .from("leg_files")
    .select("storage_path, company_id")
    .eq("company_id", actor.companyId)
    .eq("id", fileId)
    .is("deleted_at", null)
    .single();
  if (!file) return null;
  const { data } = await admin.storage
    .from(BUCKET)
    .createSignedUrl((file as { storage_path: string }).storage_path, 60);
  return data?.signedUrl ?? null;
}

// ============================================================
// ダッシュボード集計
// ============================================================

export type Dashboard = {
  counts: { total: number; active: number; drafts: number; highRisk: number };
  upcoming: Array<LegalDocument & { days: number | null }>;
  autoRenew: Array<LegalDocument & { days: number | null }>;
  highRisk: LegalDocument[];
};

export async function getDashboard(actor: LegalActor): Promise<Dashboard> {
  const admin = createAdmin();
  const { data } = await admin
    .from("leg_documents")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .limit(1000);
  const docs = (data ?? []) as LegalDocument[];

  const active = docs.filter((d) => d.status === "active");
  const drafts = docs.filter((d) => d.status === "draft" || d.status === "under_review");
  const highRisk = docs.filter((d) => d.risk_level === "high" && d.status === "active");

  const withDays = (list: LegalDocument[]) =>
    list
      .map((d) => ({ ...d, days: daysUntil(d.next_action_date ?? d.expiry_date) }))
      .filter((d) => d.days !== null && d.days <= 90)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));

  const upcoming = withDays(active);
  const autoRenew = withDays(active.filter((d) => d.auto_renew));

  return {
    counts: {
      total: docs.length,
      active: active.length,
      drafts: drafts.length,
      highRisk: highRisk.length,
    },
    upcoming,
    autoRenew,
    highRisk,
  };
}
