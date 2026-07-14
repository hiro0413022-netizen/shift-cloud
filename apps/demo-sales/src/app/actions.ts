"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { renderDemo } from "@/lib/render-demo";
import { getTemplate } from "@/lib/templates";
import { DOC_BUILDERS, buildQuote, type DocInput } from "@/lib/sales-docs";
import type { Analysis, DemoBrief, IndustryKey } from "@/lib/types";

const s = (fd: FormData, k: string) => {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
};
const lines = (v: string | null) =>
  v ? v.split("\n").map((x) => x.trim()).filter(Boolean) : undefined;

// ---- 営業先 ----

export async function createProspect(fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  const name = s(fd, "name");
  if (!name) return;
  const { data } = await admin
    .from("dms_prospects")
    .insert({
      company_id: actor.companyId,
      name,
      industry: s(fd, "industry") ?? "other",
      city: s(fd, "city"),
      website_url: s(fd, "website_url"),
      gmap_url: s(fd, "gmap_url"),
      phone: s(fd, "phone"),
      status: "unanalyzed",
      owner_name: actor.name,
    })
    .select("id")
    .single();
  revalidatePath("/");
  if (data) redirect(`/p/${data.id}`);
}

export async function updateProspect(id: string, fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();

  const patch: Record<string, unknown> = {};
  for (const k of [
    "name","industry","city","address","phone","email","website_url","gmap_url","contact_name",
    "status","good_points","improve_points","caution_points","sales_points","suggested_plan_key",
    "close_probability","next_action","lost_reason","owner_name",
  ]) {
    if (fd.has(k)) patch[k] = s(fd, k);
  }
  for (const k of ["score", "demo_priority", "est_build_price", "est_monthly_fee"]) {
    if (fd.has(k)) {
      const v = s(fd, k);
      patch[k] = v == null ? null : Number(v.replace(/[^\d-]/g, "")) || null;
    }
  }
  for (const k of ["last_contact_on", "next_contact_on"]) {
    if (fd.has(k)) patch[k] = s(fd, k);
  }
  if (fd.has("analysis_summary")) {
    const { data: cur } = await admin.from("dms_prospects").select("analysis").eq("id", id).single();
    const analysis: Analysis = (cur?.analysis as Analysis) ?? {};
    analysis.summary = s(fd, "analysis_summary") ?? undefined;
    analysis.effect = s(fd, "analysis_effect") ?? undefined;
    patch.analysis = analysis;
  }

  const prevStatus = s(fd, "_prev_status");
  await admin.from("dms_prospects").update(patch).eq("id", id).eq("company_id", actor.companyId);

  if (patch.status && patch.status !== prevStatus) {
    await admin.from("dms_activities").insert({
      company_id: actor.companyId,
      prospect_id: id,
      kind: "status",
      content: `ステータス変更: ${prevStatus ?? "?"} → ${patch.status}`,
      created_by: actor.name,
    });
  }
  revalidatePath(`/p/${id}`);
  revalidatePath("/");
}

// ---- デモ画像（ヘッダー/院内風景/院長写真） ----
// 署名URLでブラウザから直PUT（サーバーアクションのbody上限を避ける・Lesson OSと同型）。
// バケットは公開（0049）。デモHTMLは認証なしで配信されるため <img> から直接参照する。

const ASSET_BUCKET = "demo-assets";
const MAX_IMAGE = 10 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function createDemoImageUploadUrl(
  prospectId: string,
  contentType: string,
  size: number
): Promise<{ url?: string; publicUrl?: string; error?: string }> {
  const actor = await requireActor();
  const ext = EXT_BY_TYPE[contentType];
  if (!ext) return { error: "JPEG / PNG / WebP の画像を選んでください" };
  if (size > MAX_IMAGE) return { error: "10MB以下の画像にしてください" };

  const admin = createAdmin();
  const { data: p } = await admin
    .from("dms_prospects")
    .select("id")
    .eq("id", prospectId)
    .eq("company_id", actor.companyId)
    .maybeSingle();
  if (!p) return { error: "営業先が見つかりません" };

  // ファイル名は使わない（日本語名対策・推測不可にする）
  const path = `demos/${actor.companyId}/${prospectId}/${randomBytes(12).toString("base64url")}.${ext}`;
  const { data, error } = await admin.storage.from(ASSET_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "アップロードURLの発行に失敗しました" };

  const publicUrl = admin.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
  return { url: data.signedUrl, publicUrl };
}

// ---- デモ生成 ----

const galleryFromForm = (raw: string): DemoBrief["gallery"] => {
  if (!raw.trim()) return undefined;
  try {
    const arr = JSON.parse(raw) as { url?: string; caption?: string }[];
    const items = (Array.isArray(arr) ? arr : [])
      .filter((x) => typeof x?.url === "string" && x.url.startsWith("http"))
      .slice(0, 6)
      .map((x) => ({ url: x.url as string, caption: (x.caption ?? "").trim() || undefined }));
    return items.length ? items : undefined;
  } catch {
    return undefined;
  }
};

function briefFromForm(fd: FormData, base: Partial<DemoBrief>): DemoBrief {
  const brief: DemoBrief = {
    clinicName: s(fd, "clinicName") ?? base.clinicName ?? "医院名（※仮）",
    industry: (s(fd, "industry") ?? base.industry ?? "other") as IndustryKey,
    tagline: s(fd, "tagline") ?? base.tagline,
    intro: s(fd, "intro") ?? base.intro,
    colorPrimary: s(fd, "colorPrimary") ?? base.colorPrimary,
    phone: s(fd, "phone") ?? base.phone,
    address: s(fd, "address") ?? base.address,
    access: s(fd, "access") ?? base.access,
    parking: s(fd, "parking") ?? base.parking,
    hoursNote: s(fd, "hoursNote") ?? base.hoursNote,
    reserveNote: s(fd, "reserveNote") ?? base.reserveNote,
    webReserve: fd.has("webReserve") ? fd.get("webReserve") === "on" : base.webReserve,
    directorTitle: s(fd, "directorTitle") ?? base.directorTitle,
    directorName: s(fd, "directorName") ?? base.directorName,
    directorMessage: s(fd, "directorMessage") ?? base.directorMessage,
    recruit: s(fd, "recruit") ?? base.recruit,
    strengths: lines(s(fd, "strengths")) ?? base.strengths,
    firstVisit: lines(s(fd, "firstVisit")) ?? base.firstVisit,
    instructions: base.instructions ?? [],
    // 画像（フォームは常に hidden で現在値を送るため、空文字＝削除）
    logoImage: fd.has("logoImage") ? (s(fd, "logoImage") ?? undefined) : base.logoImage,
    heroImage: fd.has("heroImage") ? (s(fd, "heroImage") ?? undefined) : base.heroImage,
    directorImage: fd.has("directorImage") ? (s(fd, "directorImage") ?? undefined) : base.directorImage,
    gallery: fd.has("gallery") ? galleryFromForm(String(fd.get("gallery") ?? "")) : base.gallery,
  };
  // 診療時間表: 「行ごとに | 区切り」形式（例: 診療時間|月|火|…）
  const hoursRaw = s(fd, "hours");
  if (hoursRaw) brief.hoursRows = hoursRaw.split("\n").map((r) => r.split("|").map((c) => c.trim()));
  else if (base.hoursRows) brief.hoursRows = base.hoursRows;
  // サービス: 「名前: 説明」形式（1行1件）
  const svcRaw = s(fd, "services");
  if (svcRaw)
    brief.services = svcRaw
      .split("\n")
      .map((r) => {
        const [nm, ...rest] = r.split(":");
        return { name: nm.trim(), desc: rest.join(":").trim() };
      })
      .filter((x) => x.name);
  else if (base.services) brief.services = base.services;

  const instruction = s(fd, "instruction");
  if (instruction) brief.instructions = [...(brief.instructions ?? []), `${new Date().toISOString().slice(0, 10)}: ${instruction}`];
  return brief;
}

export async function generateDemo(prospectId: string, fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  const { data: p } = await admin.from("dms_prospects").select("*").eq("id", prospectId).single();
  if (!p) return;

  // 既存の最新デモがあればそのbriefを引き継ぐ（面談中の修正=上書き再生成）
  const { data: last } = await admin
    .from("dms_demos")
    .select("id, version, brief, token")
    .eq("prospect_id", prospectId)
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const base: Partial<DemoBrief> = (last?.brief as DemoBrief) ?? {
    clinicName: p.name,
    industry: p.industry as IndustryKey,
    phone: p.phone ?? undefined,
    address: p.address ?? undefined,
  };
  const brief = briefFromForm(fd, base);
  const html = renderDemo(brief);
  const templateKey = getTemplate(brief.industry).key;

  const expires = new Date();
  expires.setDate(expires.getDate() + 60); // 既定60日で失効

  if (last && fd.get("mode") === "update") {
    await admin
      .from("dms_demos")
      .update({ brief, html, version: last.version + 1, template_key: templateKey, status: "ready" })
      .eq("id", last.id);
    await admin.from("dms_activities").insert({
      company_id: actor.companyId,
      prospect_id: prospectId,
      kind: "edit_request",
      content: s(fd, "instruction") ?? "デモ再生成",
      meta: { version: last.version + 1 },
      created_by: actor.name,
    });
  } else {
    const token = randomBytes(18).toString("base64url");
    await admin.from("dms_demos").insert({
      company_id: actor.companyId,
      prospect_id: prospectId,
      version: 1,
      token,
      template_key: templateKey,
      brief,
      html,
      status: "ready",
      expires_on: expires.toISOString().slice(0, 10),
    });
    await admin.from("dms_activities").insert({
      company_id: actor.companyId,
      prospect_id: prospectId,
      kind: "note",
      content: "営業デモを生成",
      created_by: actor.name,
    });
  }

  const newStatus = ["candidate", "unanalyzed", "analyzing", "analyzed", "demo_candidate", "demo_in_progress"].includes(p.status)
    ? "demo_done"
    : p.status;
  await admin.from("dms_prospects").update({ status: newStatus }).eq("id", prospectId);

  revalidatePath(`/p/${prospectId}`);
  revalidatePath("/");
}

export async function setDemoAccess(demoId: string, fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  await admin
    .from("dms_demos")
    .update({ passcode: s(fd, "passcode"), expires_on: s(fd, "expires_on") })
    .eq("id", demoId)
    .eq("company_id", actor.companyId);
  revalidatePath(`/p`);
}

// ---- 営業ドキュメント ----

export async function generateDocs(prospectId: string) {
  const actor = await requireActor();
  const admin = createAdmin();
  const { data: p } = await admin.from("dms_prospects").select("*").eq("id", prospectId).single();
  if (!p) return;

  const planKey = p.suggested_plan_key ?? "basic";
  const { data: plan } = await admin
    .from("dms_plans")
    .select("*")
    .eq("company_id", actor.companyId)
    .eq("key", planKey)
    .maybeSingle();
  const { data: demo } = await admin
    .from("dms_demos")
    .select("token")
    .eq("prospect_id", prospectId)
    .is("deleted_at", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const input: DocInput = {
    name: p.name,
    industry: p.industry as IndustryKey,
    goodPoints: p.good_points,
    improvePoints: p.improve_points,
    cautionPoints: p.caution_points,
    planName: plan?.name ?? "ベーシックプラン",
    buildPrice: p.est_build_price ?? plan?.build_price ?? 298000,
    monthlyFee: p.est_monthly_fee ?? plan?.monthly_fee ?? 16500,
    planPages: plan?.pages ?? null,
    planFeatures: (plan?.features as string[]) ?? [],
    demoUrl: demo ? `${base}/d/${demo.token}` : null,
    ownerName: p.owner_name ?? actor.name,
  };

  const rows = Object.entries(DOC_BUILDERS).map(([kind, fn]) => {
    const { title, content } = fn(input);
    return { company_id: actor.companyId, prospect_id: prospectId, kind, title, content };
  });
  const q = buildQuote(input);
  rows.push({ company_id: actor.companyId, prospect_id: prospectId, kind: "quote", title: q.title, content: q.content });

  // 同種の旧版は論理削除して最新のみ表示
  await admin
    .from("dms_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("prospect_id", prospectId)
    .is("deleted_at", null);
  await admin.from("dms_documents").insert(rows);
  await admin.from("dms_activities").insert({
    company_id: actor.companyId,
    prospect_id: prospectId,
    kind: "note",
    content: "提案書・営業トーク・メール・見積書案を生成",
    created_by: actor.name,
  });
  revalidatePath(`/p/${prospectId}`);
}

// ---- 営業履歴 ----

export async function addActivity(prospectId: string, fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  const content = s(fd, "content");
  if (!content) return;
  await admin.from("dms_activities").insert({
    company_id: actor.companyId,
    prospect_id: prospectId,
    kind: s(fd, "kind") ?? "note",
    content,
    created_by: actor.name,
  });
  const next = s(fd, "next_contact_on");
  if (next) await admin.from("dms_prospects").update({ next_contact_on: next, last_contact_on: new Date().toISOString().slice(0, 10) }).eq("id", prospectId);
  revalidatePath(`/p/${prospectId}`);
}

// ---- 正式制作へ移行 ----

export async function transferToProject(prospectId: string) {
  const actor = await requireActor();
  const admin = createAdmin();
  const { data: p } = await admin.from("dms_prospects").select("*").eq("id", prospectId).single();
  if (!p) return;
  const { data: demos } = await admin
    .from("dms_demos")
    .select("id, token, version, brief")
    .eq("prospect_id", prospectId)
    .is("deleted_at", null)
    .order("version", { ascending: false });
  const { data: docs } = await admin
    .from("dms_documents")
    .select("kind, title, content")
    .eq("prospect_id", prospectId)
    .is("deleted_at", null);
  const { data: acts } = await admin
    .from("dms_activities")
    .select("kind, content, created_at, created_by")
    .eq("prospect_id", prospectId)
    .is("deleted_at", null)
    .order("created_at");

  await admin.from("dms_projects").upsert(
    {
      company_id: actor.companyId,
      prospect_id: prospectId,
      plan_key: p.suggested_plan_key ?? "basic",
      build_price: p.est_build_price,
      monthly_fee: p.est_monthly_fee,
      status: "preparing",
      handover: {
        customer: { name: p.name, industry: p.industry, city: p.city, address: p.address, phone: p.phone, email: p.email, contact: p.contact_name, website: p.website_url, gmap: p.gmap_url },
        analysis: p.analysis,
        good_points: p.good_points,
        improve_points: p.improve_points,
        demos,
        documents: docs,
        activities: acts,
        pending_items: ["正式素材（写真・ロゴ・文章）の受領", "ドメイン・サーバーの確認", "公開希望日の確認"],
      },
    },
    { onConflict: "prospect_id" }
  );
  await admin.from("dms_prospects").update({ status: "transferred" }).eq("id", prospectId);
  await admin.from("dms_activities").insert({
    company_id: actor.companyId,
    prospect_id: prospectId,
    kind: "status",
    content: "成約 → 正式制作案件へ移行（dms_projects）",
    created_by: actor.name,
  });
  revalidatePath(`/p/${prospectId}`);
  revalidatePath("/");
}

// ---- 営業指示（自然言語） ----

export async function saveDirective(fd: FormData) {
  const actor = await requireActor();
  const content = s(fd, "directive");
  if (!content) return;
  const admin = createAdmin();
  await admin.from("dms_activities").insert({
    company_id: actor.companyId,
    prospect_id: null,
    kind: "directive",
    content,
    created_by: actor.name,
  });
  revalidatePath("/");
}
