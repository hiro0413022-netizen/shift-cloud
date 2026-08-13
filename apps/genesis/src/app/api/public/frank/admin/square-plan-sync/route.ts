import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { taxIncluded } from "@/lib/frank-join-pure";

export const dynamic = "force-dynamic";

/**
 * frunk_plans と Square サブスクプランの同期（#136・運用ワンショットAPI）
 *
 * 何をするか: square_variation_id が未設定の frunk_plans（月額>0）について、
 * Square の「FRANK GOLF 月会費」プランに同名バリエーション（税込月額・毎月）を
 * 無ければ作り、frunk_plans.square_variation_id / square_variation_nofee_id を埋める。
 * scripts/frank-square-setup.mjs のプラン部分と同じロジック（何度実行しても安全）。
 *
 * なぜAPIか: SQUARE_ACCESS_TOKEN は Vercel env にしか無い。プラン追加のたびに
 * ユーザーがローカルでスクリプトを回さなくて済むよう、本番環境自身に作らせる。
 *
 * 認証: Authorization: Bearer <token>。token は gn_ops_tokens（0113）に
 * sha256 ハッシュで登録された purpose='frank_square_plan_sync'・期限内のものだけ有効。
 * （DBに登録できる人＝service_role を持つ運用者だけが叩ける）
 *
 * 使い方:
 *   1. gn_ops_tokens にトークンを登録（例: 期限24時間）
 *   2. POST /api/public/frank/admin/square-plan-sync
 *      body: { "plan_names": ["テスト会員"] }  … 省略時は未設定プラン全部
 */

const SQUARE_API = "https://connect.squareup.com/v2";
const PLAN_NAME = "FRANK GOLF 月会費";

async function sq(token: string, method: string, path: string, body?: Record<string, unknown>) {
  const res = await fetch(`${SQUARE_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errs = (json.errors as Array<{ detail?: string; code?: string }> | undefined) ?? [];
    throw new Error(errs.map((e) => e.detail ?? e.code).join("; ") || `Square ${method} ${path} (${res.status})`);
  }
  return json;
}

async function listCatalog(token: string, types: string): Promise<Array<Record<string, unknown>>> {
  const objects: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  do {
    const q = new URLSearchParams({ types });
    if (cursor) q.set("cursor", cursor);
    const json = await sq(token, "GET", `/catalog/list?${q}`);
    objects.push(...((json.objects as Array<Record<string, unknown>> | undefined) ?? []));
    cursor = json.cursor as string | undefined;
  } while (cursor);
  return objects;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const raw = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!raw) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const admin = createAdmin();
  const hash = createHash("sha256").update(raw).digest("hex");
  const { data: tok } = await admin
    .from("gn_ops_tokens")
    .select("id, expires_at")
    .eq("token_hash", hash)
    .eq("purpose", "frank_square_plan_sync")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!tok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await admin.from("gn_ops_tokens").update({ used_at: new Date().toISOString() }).eq("id", tok.id);

  const squareToken = (process.env.SQUARE_ACCESS_TOKEN ?? "").trim();
  if (squareToken.length < 10) {
    return NextResponse.json({ ok: false, error: "square_env_missing" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { plan_names?: string[] };
  const filterNames = Array.isArray(body.plan_names) && body.plan_names.length > 0 ? body.plan_names : null;

  let query = admin
    .from("frunk_plans")
    .select("id, name, monthly_price, square_variation_id")
    .is("deleted_at", null)
    .is("square_variation_id", null)
    .gt("monthly_price", 0);
  if (filterNames) query = query.in("name", filterNames);
  const { data: plans } = await query;
  if (!plans || plans.length === 0) {
    return NextResponse.json({ ok: true, results: [], note: "対象プランなし（すべて設定済みか、条件に一致しない）" });
  }

  try {
    // Square 側のプラン（親）を find-or-create
    const catalogPlans = await listCatalog(squareToken, "SUBSCRIPTION_PLAN");
    let plan = catalogPlans.find(
      (p) => (p.subscription_plan_data as { name?: string } | undefined)?.name === PLAN_NAME,
    );
    if (!plan) {
      const r = await sq(squareToken, "POST", "/catalog/object", {
        idempotency_key: crypto.randomUUID(),
        object: {
          type: "SUBSCRIPTION_PLAN",
          id: "#plan",
          present_at_all_locations: true,
          subscription_plan_data: { name: PLAN_NAME },
        },
      });
      plan = r.catalog_object as Record<string, unknown>;
    }
    const planId = String(plan.id);
    const existingVars =
      ((plan.subscription_plan_data as { subscription_plan_variations?: Array<Record<string, unknown>> } | undefined)
        ?.subscription_plan_variations ?? []) as Array<Record<string, unknown>>;

    const results: Array<{ name: string; variation_id?: string; created?: boolean; error?: string }> = [];
    for (const p of plans) {
      const name = String(p.name);
      const monthly = taxIncluded(Number(p.monthly_price));
      try {
        const found = existingVars.find(
          (v) => (v.subscription_plan_variation_data as { name?: string } | undefined)?.name === name,
        );
        let variationId: string;
        let created = false;
        if (found) {
          variationId = String(found.id);
        } else {
          const r = await sq(squareToken, "POST", "/catalog/object", {
            idempotency_key: crypto.randomUUID(),
            object: {
              type: "SUBSCRIPTION_PLAN_VARIATION",
              id: "#var",
              present_at_all_locations: true,
              subscription_plan_variation_data: {
                name,
                subscription_plan_id: planId,
                phases: [
                  { cadence: "MONTHLY", ordinal: 0, pricing: { type: "STATIC", price: { amount: monthly, currency: "JPY" } } },
                ],
              },
            },
          });
          variationId = String((r.catalog_object as { id?: string }).id);
          created = true;
        }
        // フェーズ1つ＝入会金を含まないため nofee も同じID（setup.mjs と同じ扱い）
        await admin
          .from("frunk_plans")
          .update({ square_variation_id: variationId, square_variation_nofee_id: variationId, updated_at: new Date().toISOString() })
          .eq("id", p.id);
        results.push({ name, variation_id: variationId, created });
      } catch (e) {
        results.push({ name, error: String(e instanceof Error ? e.message : e) });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
