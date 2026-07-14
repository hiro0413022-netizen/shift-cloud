"use server";

// 見積（0057）とその設定のサーバーアクション。
// 金額はクライアントから受け取らず、必ずDBのマスタ（dms_plans / dms_options）から引き直して計算する。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { calcQuote, quoteMarkdown, quoteNo, type QuoteItem } from "@/lib/quote";

const s = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const num = (fd: FormData, k: string, d = 0) => {
  const v = s(fd, k);
  return v == null ? d : Number(v.replace(/[^\d-]/g, "")) || d;
};

async function settings(companyId: string) {
  const admin = createAdmin();
  const { data } = await admin.from("dms_quote_settings").select("*").eq("company_id", companyId).maybeSingle();
  return (
    data ?? {
      company_id: companyId,
      issuer_name: "株式会社YOZAN",
      issuer_address: null,
      issuer_tel: null,
      issuer_email: null,
      issuer_note: null,
      footer_note: null,
      tax_rate: 0.1,
      valid_days: 30,
    }
  );
}

// ---- 見積作成 ----

export async function createQuote(prospectId: string, fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();

  const { data: p } = await admin
    .from("dms_prospects")
    .select("id, name")
    .eq("id", prospectId)
    .eq("company_id", actor.companyId)
    .single();
  if (!p) return;

  const st = await settings(actor.companyId);
  const taxRate = Number(st.tax_rate ?? 0.1);

  // 選択内容（key/qtyのみ）を受け取り、単価はマスタから引く
  let picked: { key: string; qty: number }[] = [];
  try {
    picked = JSON.parse(String(fd.get("items") ?? "[]"));
  } catch {
    picked = [];
  }
  const planKey = s(fd, "planKey");

  const [{ data: plan }, { data: opts }] = await Promise.all([
    planKey
      ? admin.from("dms_plans").select("*").eq("company_id", actor.companyId).eq("key", planKey).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("dms_options").select("*").eq("company_id", actor.companyId).is("deleted_at", null),
  ]);

  const byKey = new Map((opts ?? []).map((o) => [o.key as string, o]));
  const items: QuoteItem[] = picked
    .filter((x) => byKey.has(x.key))
    .map((x) => {
      const o = byKey.get(x.key)!;
      return {
        key: o.key,
        name: o.name,
        unit: o.unit,
        qty: Math.max(1, Math.floor(Number(x.qty) || 1)),
        build: o.build_price,
        monthly: o.monthly_fee,
        description: o.description ?? undefined,
      };
    });

  const input = {
    planName: plan?.name ?? null,
    planBuild: plan?.build_price ?? 0,
    planMonthly: plan?.monthly_fee ?? 0,
    items,
    discountBuild: num(fd, "discountBuild"),
    discountMonthly: num(fd, "discountMonthly"),
    taxRate,
  };
  const totals = calcQuote(input);

  const { data: last } = await admin
    .from("dms_quotes")
    .select("version")
    .eq("prospect_id", prospectId)
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const validDays = num(fd, "validDays", st.valid_days ?? 30);
  const note = s(fd, "note");

  const { data: q } = await admin
    .from("dms_quotes")
    .insert({
      company_id: actor.companyId,
      prospect_id: prospectId,
      quote_no: quoteNo(prospectId.replace(/-/g, "")),
      version,
      valid_days: validDays,
      plan_key: planKey,
      plan_name: plan?.name ?? null,
      plan_build: input.planBuild,
      plan_monthly: input.planMonthly,
      items,
      discount_build: input.discountBuild,
      discount_monthly: input.discountMonthly,
      tax_rate: taxRate,
      subtotal_build: totals.subtotalBuild,
      subtotal_monthly: totals.subtotalMonthly,
      total_build: totals.totalBuild,
      total_monthly: totals.totalMonthly,
      note,
      created_by: actor.name,
    })
    .select("id, quote_no, issue_date")
    .single();

  // 営業ドキュメント（見積書Markdown）も最新版に差し替え
  if (q) {
    const issue = String(q.issue_date);
    const until = new Date(issue);
    until.setDate(until.getDate() + validDays);
    const md = quoteMarkdown({
      clinicName: p.name,
      quoteNo: q.quote_no,
      issueDate: issue,
      validUntil: until.toISOString().slice(0, 10),
      q: input,
      totals,
      issuerName: st.issuer_name,
      issuerNote: st.issuer_note,
      note,
    });
    await admin
      .from("dms_documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("prospect_id", prospectId)
      .eq("kind", "quote")
      .is("deleted_at", null);
    await admin.from("dms_documents").insert({
      company_id: actor.companyId,
      prospect_id: prospectId,
      kind: "quote",
      title: `お見積書（${q.quote_no}）`,
      content: md,
      meta: { quote_id: q.id, totals },
    });
  }

  // 営業先の想定金額・ステータスも更新（KPIに効かせる）
  await admin
    .from("dms_prospects")
    .update({
      est_build_price: totals.totalBuild,
      est_monthly_fee: totals.totalMonthly,
      suggested_plan_key: planKey,
    })
    .eq("id", prospectId);
  await admin.from("dms_activities").insert({
    company_id: actor.companyId,
    prospect_id: prospectId,
    kind: "note",
    content: `見積を作成（v${version}・初期${totals.totalBuild.toLocaleString()}円／月額${totals.totalMonthly.toLocaleString()}円・税込）`,
    created_by: actor.name,
  });

  revalidatePath(`/p/${prospectId}`);
  if (q) redirect(`/q/${q.id}`);
}

export async function setQuoteStatus(quoteId: string, prospectId: string, status: string) {
  const actor = await requireActor();
  const admin = createAdmin();
  await admin
    .from("dms_quotes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("company_id", actor.companyId);
  if (status === "sent") {
    await admin.from("dms_prospects").update({ status: "quoted" }).eq("id", prospectId);
  }
  revalidatePath(`/p/${prospectId}`);
}

// ---- 設定（プラン・オプション・発行元） ----

export async function saveQuoteSettings(fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  await admin.from("dms_quote_settings").upsert(
    {
      company_id: actor.companyId,
      issuer_name: s(fd, "issuer_name") ?? "株式会社YOZAN",
      issuer_address: s(fd, "issuer_address"),
      issuer_tel: s(fd, "issuer_tel"),
      issuer_email: s(fd, "issuer_email"),
      issuer_note: s(fd, "issuer_note"),
      footer_note: s(fd, "footer_note"),
      tax_rate: (num(fd, "tax_percent", 10) || 10) / 100,
      valid_days: num(fd, "valid_days", 30),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );
  revalidatePath("/settings");
}

export async function savePlan(fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  const key = s(fd, "key");
  const name = s(fd, "name");
  if (!key || !name) return;
  await admin.from("dms_plans").upsert(
    {
      company_id: actor.companyId,
      key,
      name,
      build_price: num(fd, "build_price"),
      monthly_fee: num(fd, "monthly_fee"),
      pages: s(fd, "pages"),
      features: (s(fd, "features") ?? "").split("\n").map((x) => x.trim()).filter(Boolean),
      sort: num(fd, "sort", 100),
      active: fd.get("active") === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,key" }
  );
  revalidatePath("/settings");
}

export async function saveOption(fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  const key = s(fd, "key");
  const name = s(fd, "name");
  if (!key || !name) return;
  await admin.from("dms_options").upsert(
    {
      company_id: actor.companyId,
      key,
      name,
      category: s(fd, "category") ?? "other",
      description: s(fd, "description"),
      build_price: num(fd, "build_price"),
      monthly_fee: num(fd, "monthly_fee"),
      unit: s(fd, "unit") ?? "式",
      default_qty: num(fd, "default_qty", 1) || 1,
      recommended: fd.get("recommended") === "on",
      sort: num(fd, "sort", 100),
      active: fd.get("active") === "on",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,key" }
  );
  revalidatePath("/settings");
}

export async function deleteOption(key: string) {
  const actor = await requireActor();
  const admin = createAdmin();
  await admin
    .from("dms_options")
    .update({ deleted_at: new Date().toISOString() })
    .eq("company_id", actor.companyId)
    .eq("key", key);
  revalidatePath("/settings");
}
