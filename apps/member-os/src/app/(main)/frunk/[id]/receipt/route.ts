import { NextRequest, NextResponse } from "next/server";
import { requireReceptionActor } from "@/lib/auth";
import { requireStoreAccess, FRANK_STORE_ID } from "@/lib/store-scope";
import { createAdmin } from "@/lib/supabase/admin";
import { loadMemberSales, saleLabel, receiptNo } from "@/lib/frank-receipt";
import { signAdminPayload, ADMIN_SIG_TTL_MS } from "@yozan/core/admin-sign";
import { jstYmd } from "@/lib/jst";
import { logAudit } from "@/lib/kernel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GENESIS_URL = process.env.GENESIS_URL || "https://yozan-genesis.vercel.app";

/**
 * 領収書PDFを開く（#222）。会員カードのフォームから新しいタブで開く＝iPadでそのまま表示・保存・印刷。
 *
 * ★ 金額はここでDBから引く（画面から渡された金額は使わない）。
 *   スタッフが選べるのは「どの入金ぶんか」だけで、いくらにするかは選べない。
 * ★ PDFの生成だけ Genesis に投げる（日本語フォントがあちらにしか無い）。署名つき5分。
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireReceptionActor();
  await requireStoreAccess(actor, FRANK_STORE_ID);
  const { id } = await ctx.params;
  const admin = createAdmin();

  const { data: m } = await admin
    .from("frunk_members")
    .select("id, name, company_name, member_no, plan_id, frunk_plans(name)")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("store_id", FRANK_STORE_ID)
    .is("deleted_at", null)
    .maybeSingle();
  if (!m) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const wanted = new Set(sp.getAll("sale"));
  const sales = (await loadMemberSales(id, actor.companyId)).filter((s) => wanted.has(s.id));
  if (sales.length === 0) {
    return NextResponse.json({ error: "領収書にするお支払いを1つ以上お選びください" }, { status: 400 });
  }

  const planName = (m as { frunk_plans?: { name?: string } | null }).frunk_plans?.name ?? null;
  const defaultTo = String((m as { company_name?: string | null }).company_name || m.name || "").trim();
  const toName = (sp.get("to_name") || `${defaultTo} 様`).slice(0, 80);
  const note = (sp.get("note") || (sales.every((s) => s.category === "月会費") ? "月会費として" : "会費として")).slice(0, 80);

  const payload = JSON.stringify({
    toName,
    note,
    items: sales.map((s) => ({ label: saleLabel(s, planName), amount: s.amount_inc_tax, soldOn: s.sold_on })),
    issuedOn: jstYmd(),
    memberNo: m.member_no ?? null,
    receiptNo: receiptNo(m.member_no as string | null, sales.map((s) => s.id)),
    payMethod: sales[0]?.pay_method ?? null,
  });
  const exp = Date.now() + ADMIN_SIG_TTL_MS;

  const res = await fetch(`${GENESIS_URL}/api/public/frank/admin/receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, exp, sig: signAdminPayload(payload, exp) }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ error: `領収書を作れませんでした（${res.status}）`, detail: detail.slice(0, 200) }, { status: 502 });
  }

  await logAudit(actor, "frank.receipt.issue", "frunk_members", id, null, {
    sales: sales.map((s) => s.id),
    total: sales.reduce((n, s) => n + s.amount_inc_tax, 0),
  });

  const pdf = Buffer.from(await res.arrayBuffer());
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // 画面に表示（iPadでそのまま見せて、必要なら保存・印刷・メール添付）
      "Content-Disposition": `inline; filename="FRANK_GOLF_領収書_${String(m.member_no ?? "")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
