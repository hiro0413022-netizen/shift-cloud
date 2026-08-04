import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import { jstYmd } from "@/lib/jst";

/**
 * 集客LP（/lp/*）の問い合わせ受付（#101・認証なし公開API）。
 *
 * 流し先（DESIGN.md チャネルC-4。専用リードテーブルは作らない＝二重台帳回避）:
 *   - pganote      → sales_os スキーマ（Sales OS）: companies + contacts + leads(問い合わせ) + tasks(福原氏の今日やること)
 *   - swing-cortex → sec_inquiries（CEO Inbox）: 判断フィードに「問い合わせ」カードで出る
 * どちらも company_events に記録 → ホームのティッカー・/ai-sales のライブフィードに流れる。
 */
export const dynamic = "force-dynamic";

const YOZAN_COMPANY_ID = "ec00ad2a-4032-4061-bdb7-03face8a04e7";

type LeadBody = {
  product?: string;
  name?: string;
  org?: string;
  email?: string;
  phone?: string;
  message?: string;
  website?: string; // honeypot（人間は入力しない隠しフィールド）
};

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  let body: LeadBody;
  try {
    body = (await req.json()) as LeadBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // honeypot: botが埋めたら黙って成功を返す（学習させない）
  if (clean(body.website, 10)) return NextResponse.json({ ok: true });

  const product = clean(body.product, 20);
  const name = clean(body.name, 80);
  const org = clean(body.org, 120);
  const email = clean(body.email, 160);
  const phone = clean(body.phone, 40);
  const message = clean(body.message, 2000);

  if (!["pganote", "swing-cortex", "webdesign"].includes(product)) {
    return NextResponse.json({ ok: false, error: "unknown_product" }, { status: 400 });
  }
  if (!name || (!email && !phone)) {
    return NextResponse.json({ ok: false, error: "name_and_contact_required" }, { status: 400 });
  }

  const admin = createAdmin();
  const contactLine = [email && `メール: ${email}`, phone && `電話: ${phone}`].filter(Boolean).join(" / ");

  try {
    if (product === "pganote") {
      // ---- Sales OS（sales_os スキーマ）へ。プロジェクト/ステージ/担当はコードと名前で解決（UUID直書きしない） ----
      const salesOs = admin.schema("sales_os");
      const { data: proj } = await salesOs.from("projects").select("id, tenant_id").eq("code", "PN").maybeSingle();
      if (!proj) throw new Error("sales_os: PGA NOTE プロジェクトが見つかりません");
      const { data: stage } = await salesOs
        .from("pipeline_stages")
        .select("id")
        .eq("project_id", proj.id)
        .eq("name", "問い合わせ")
        .maybeSingle();
      const { data: owner } = await salesOs.from("app_users").select("id").eq("email", "fukuhara").maybeSingle();

      // 流入経路チャネル「SNS/LP」が無ければ作る（自己修復・名前で冪等）
      let channelId: string | null = null;
      const { data: ch } = await salesOs
        .from("channels")
        .select("id")
        .eq("project_id", proj.id)
        .eq("name", "SNS/LP")
        .maybeSingle();
      if (ch) channelId = String(ch.id);
      else {
        const { data: newCh } = await salesOs
          .from("channels")
          .insert({ project_id: proj.id, name: "SNS/LP", category: "inbound", is_active: true, sort: 99 })
          .select("id")
          .maybeSingle();
        channelId = newCh ? String(newCh.id) : null;
      }

      const { data: company } = await salesOs
        .from("companies")
        .insert({
          tenant_id: proj.tenant_id,
          project_id: proj.id,
          name: org || `${name}（LP問い合わせ）`,
          note: "SNS/LP経由の自動登録（#101）",
        })
        .select("id")
        .single();
      if (company) {
        await salesOs.from("contacts").insert({
          company_id: company.id,
          name,
          email: email || null,
          phone: phone || null,
          note: "LPフォームより",
        });
      }
      const { data: lead } = await salesOs
        .from("leads")
        .insert({
          tenant_id: proj.tenant_id,
          project_id: proj.id,
          company_id: company?.id ?? null,
          title: `${org || name}（SNS/LP問い合わせ）`,
          stage_id: stage?.id ?? null,
          channel_id: channelId,
          status_note: [message && `【メッセージ】${message}`, contactLine].filter(Boolean).join("\n"),
          inquiry_date: jstYmd(),
          owner_id: owner?.id ?? null,
          custom: { source: "lp", email, phone },
        })
        .select("id")
        .single();
      // 福原氏の「今日やること」に翌日期限で積む
      await salesOs.from("tasks").insert({
        tenant_id: proj.tenant_id,
        project_id: proj.id,
        lead_id: lead?.id ?? null,
        owner_id: owner?.id ?? null,
        title: `新規リード対応: ${name}様${org ? `（${org}）` : ""}に連絡`,
        due_date: jstYmd(new Date(Date.now() + 24 * 3600_000)),
      });
    } else {
      // ---- SWING CORTEX / HP制作 → CEO Inbox（sec_inquiries）＝判断フィードに載る ----
      await admin.from("sec_inquiries").insert({
        company_id: YOZAN_COMPANY_ID,
        source: "lp",
        inquiry_type: "sales",
        priority: "high",
        from_name: org ? `${name}（${org}）` : name,
        from_email: email || null,
        subject:
          product === "webdesign"
            ? "ホームページ制作の相談・デモ希望（LP）"
            : "SWING CORTEX 資料請求・問い合わせ（LP）",
        snippet: [message, contactLine].filter(Boolean).join(" / ").slice(0, 300),
        received_at: new Date().toISOString(),
        status: "new",
      });
    }

    await logEvent(YOZAN_COMPANY_ID, {
      event_type: "ai.lp_lead",
      title: `LP経由の新規リード: ${name}様${org ? `（${org}）` : ""} → ${product === "pganote" ? "PGA NOTE（Sales OS・福原氏へ）" : product === "webdesign" ? "HP制作（CEO Inboxへ）" : "SWING CORTEX（CEO Inboxへ）"}`,
      description: [message, contactLine].filter(Boolean).join("\n"),
      source: "ai_sales_lp",
      source_type: "external",
      severity: "notice",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // 受付は落とさない: 台帳投入に失敗しても company_events に残して後追いできるようにする
    await logEvent(YOZAN_COMPANY_ID, {
      event_type: "ai.lp_lead_error",
      title: `LPリードの台帳投入に失敗（${product}）: ${name}様 — 手動でフォローしてください`,
      description: [String(e), message, contactLine].filter(Boolean).join("\n"),
      source: "ai_sales_lp",
      source_type: "external",
      severity: "warning",
    }).catch(() => null);
    return NextResponse.json({ ok: true });
  }
}
