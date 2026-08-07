"use server";

// 営業メールの設定・文面・停止操作（#111）。
// 自動で送るものほど、人が「止める」「直す」を即座にできる場所が必要。

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { runOutreach } from "@yozan/outreach/server";
import { requireActor } from "@/lib/auth";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
};

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "demo-sales-delta.vercel.app"}`;

export async function saveOutSettings(fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  await admin.from("out_settings").upsert({
    company_id: actor.companyId,
    enabled: fd.get("enabled") === "on",
    from_email: s(fd, "from_email"),
    from_name: s(fd, "from_name") ?? "株式会社YOZAN",
    reply_to: s(fd, "reply_to"),
    daily_cap_max: Math.max(1, Math.min(200, Number(s(fd, "daily_cap_max") ?? 50))),
    send_hour_jst: Math.max(0, Math.min(23, Number(s(fd, "send_hour_jst") ?? 10))),
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/outreach");
}

/** 自動停止の解除。原因を直したうえで人が押す（勝手に再開しない） */
export async function resumeOutreach() {
  const actor = await requireActor();
  const admin = createAdmin();
  await admin
    .from("out_settings")
    .upsert({ company_id: actor.companyId, paused_at: null, paused_reason: null, updated_at: new Date().toISOString() });
  revalidatePath("/outreach");
}

/** 今すぐ止める（人間側のキルスイッチ） */
export async function pauseOutreach() {
  const actor = await requireActor();
  const admin = createAdmin();
  await admin.from("out_settings").upsert({
    company_id: actor.companyId,
    paused_at: new Date().toISOString(),
    paused_reason: "手動で停止しました",
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/outreach");
}

export async function saveTemplate(fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  const id = s(fd, "id");
  const patch = {
    company_id: actor.companyId,
    key: s(fd, "key") ?? "default",
    name: s(fd, "name") ?? "（無題）",
    industry: s(fd, "industry"),
    subject: s(fd, "subject") ?? "",
    body: s(fd, "body") ?? "",
    enabled: fd.get("enabled") === "on",
    sort: Number(s(fd, "sort") ?? 100),
    updated_at: new Date().toISOString(),
  };
  if (id) await admin.from("out_templates").update(patch).eq("id", id).eq("company_id", actor.companyId);
  else await admin.from("out_templates").insert(patch);
  revalidatePath("/outreach");
}

/** 送らずに文面と判定だけ見る。最初の1回は必ずこれで中身を確かめられるようにしておく */
export async function previewOutreach() {
  const actor = await requireActor();
  const admin = createAdmin();
  const r = await runOutreach(admin, actor.companyId, {
    baseUrl: APP_URL,
    demoBaseUrl: APP_URL,
    budgetMs: 30_000,
    dryRun: true,
  });
  await admin.from("dms_activities").insert({
    company_id: actor.companyId,
    kind: "note",
    content: `送信プレビュー: ${r.preview?.length ?? 0}件が送信対象（${JSON.stringify(r.skipped)}）`,
    created_by: actor.name,
  });
  revalidatePath("/outreach");
}

export async function addSuppression(fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  const email = s(fd, "email")?.toLowerCase() ?? null;
  const domain = s(fd, "domain")?.toLowerCase().replace(/^@/, "") ?? null;
  if (!email && !domain) return;
  await admin.from("out_suppressions").upsert(
    { company_id: actor.companyId, email, domain, reason: "manual", note: s(fd, "note") },
    { onConflict: email ? "company_id,email" : "company_id,domain" },
  );
  revalidatePath("/outreach");
}
