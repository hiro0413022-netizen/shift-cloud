import "server-only";
import { NextResponse } from "next/server";
import { getGenesisActor, type GenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/* ============================================================
   Genesis Core API の認証（Final Architecture §9）

   1) 画面セッション（cookie）→ getGenesisActor（view_hq）
   2) MCP / 外部: Bearer GENESIS_CORE_SECRET（無ければ CRON_SECRET）＋ x-genesis-staff-id（代理元の人）。
      代理元の staff は必ず要る＝AI は人の権限を超えない。未設定なら 503 で閉じる（dev-queue-auth と同じ流儀）。
   ============================================================ */

export type CoreApiActor = { actor: GenesisActor; surface: "web" | "mcp" | "api" };

export async function coreApiActor(req: Request): Promise<CoreApiActor | NextResponse> {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const secret = process.env.GENESIS_CORE_SECRET || process.env.CRON_SECRET;
    if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const staffId = req.headers.get("x-genesis-staff-id");
    if (!staffId) return NextResponse.json({ error: "x-genesis-staff-id required（代理元の人が要ります）" }, { status: 400 });
    const admin = createAdmin();
    const { data: staff } = await admin.from("staff").select("id, company_id, name, email, status").eq("id", staffId).is("deleted_at", null).maybeSingle();
    if (!staff || staff.status !== "active") return NextResponse.json({ error: "staff not found" }, { status: 401 });
    const { coreActorFromStaffId } = await import("./actor");
    const c = await coreActorFromStaffId(admin, String(staff.company_id), String(staff.id));
    const actor: GenesisActor = { staffId: String(staff.id), authUserId: "", companyId: String(staff.company_id), name: String(staff.name), email: staff.email ? String(staff.email) : null, isOwner: c.isOwner, storeIds: c.storeIds, primaryStoreId: c.primaryStoreId };
    return { actor, surface: req.headers.get("x-genesis-surface") === "api" ? "api" : "mcp" };
  }
  const actor = await getGenesisActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return { actor, surface: "web" };
}
