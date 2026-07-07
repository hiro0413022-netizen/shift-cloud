import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { computeNextActionDate, DOC_TYPES, type DocType } from "@/lib/legal";
import { logEvent } from "@/lib/kernel";

// Legal OS 外部API（legal_ai / CEO AI / バッチ取込用）。Bearerトークン認証。
// UIはSupabaseセッション、こちらは共有シークレット。company_idは単一テナントを解決。

function authorized(request: Request): boolean {
  const token = process.env.LEGAL_API_TOKEN;
  if (!token) return false;
  const header = request.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return !!m && m[1] === token;
}

async function resolveCompanyId(): Promise<string | null> {
  const admin = createAdmin();
  const { data } = await admin.from("companies").select("id").limit(1).single();
  return (data as { id: string } | null)?.id ?? null;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await resolveCompanyId();
  if (!companyId) return NextResponse.json({ error: "no company" }, { status: 500 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const docType = url.searchParams.get("doc_type");

  const admin = createAdmin();
  let query = admin
    .from("leg_documents")
    .select("id, doc_type, title, counterparty, status, effective_date, expiry_date, auto_renew, renewal_notice_days, next_action_date, risk_level, summary")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if (status) query = query.eq("status", status);
  if (docType) query = query.eq("doc_type", docType);

  const { data, error } = await query
    .order("next_action_date", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data ?? [] });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const companyId = await resolveCompanyId();
  if (!companyId) return NextResponse.json({ error: "no company" }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const docType = String(body.doc_type ?? "contract");
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
  if (!DOC_TYPES.includes(docType as DocType)) {
    return NextResponse.json({ error: "invalid doc_type" }, { status: 400 });
  }

  const expiry = body.expiry_date ? String(body.expiry_date) : null;
  const notice = body.renewal_notice_days != null ? Number(body.renewal_notice_days) : null;

  const admin = createAdmin();
  const { data, error } = await admin
    .from("leg_documents")
    .insert({
      company_id: companyId,
      doc_type: docType,
      title,
      counterparty: body.counterparty ? String(body.counterparty) : null,
      status: "draft",
      effective_date: body.effective_date ? String(body.effective_date) : null,
      expiry_date: expiry,
      auto_renew: !!body.auto_renew,
      renewal_notice_days: notice,
      next_action_date: computeNextActionDate(expiry, notice),
      summary: body.summary ? String(body.summary) : null,
      created_by: "api",
      source: "api",
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }

  await logEvent(companyId, {
    event_type: "legal.document_registered",
    title: `契約登録(API): ${title}`,
    source: "legal-os-api",
    source_type: "ai",
    severity: "info",
    status: "open",
  });

  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
}
