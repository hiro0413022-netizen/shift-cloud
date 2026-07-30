import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * Inventory OS 外部API — 他システムから入出庫を起こす口（DECISIONS #96）
 *
 * なぜAPIなのか:
 *   golfwing（発注・入荷管理）は別のデータベースで動いているため、DBトリガーでは繋がらない。
 *   入荷を確定した側から叩いてもらう形にする。money-os の物販売上も同じ口を使う。
 *
 * 二重計上の防止:
 *   呼び出し側は自分のレコードのIDを source_id に入れる。
 *   inv_movements の uq_mov_source（source_app + source_id）が最終防衛なので、
 *   同じ入荷を二度送っても在庫は増えない（既存扱いで 200 を返す）。
 *
 * 品番の突き合わせ:
 *   キーは Inventory OS の管理番号（例 GR-IO-001）。
 *   golfwing 側の商品マスタにこの管理番号を持たせてから連携を有効にする。
 *   見つからない品番はエラーにせず unmatched として返し、残りは通す
 *   （1品エラーで入荷全体が落ちると現場が止まるため）。
 *
 * 認証: Bearer INVENTORY_API_TOKEN
 *
 * POST /api/v1/movements
 * {
 *   "source_app": "golfwing",
 *   "kind": "receipt",
 *   "occurred_on": "2026-07-30",
 *   "lines": [
 *     { "code": "GR-IO-001", "qty": 12, "unit_cost": 754, "source_id": "<uuid>", "memo": "6月発注分" }
 *   ]
 * }
 */

const KINDS = ["receipt", "sale", "workshop", "adjust", "damage", "transfer"] as const;
type Kind = (typeof KINDS)[number];
const OUTBOUND: Kind[] = ["sale", "workshop", "damage"];

type Line = {
  code?: string;
  qty?: number;
  unit_cost?: number | null;
  source_id?: string | null;
  memo?: string | null;
};

function authorized(request: Request): boolean {
  const token = process.env.INVENTORY_API_TOKEN;
  if (!token) return false;
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && m[1] === token;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { source_app?: string; kind?: string; occurred_on?: string; lines?: Line[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const sourceApp = (body.source_app ?? "").trim();
  const kind = body.kind as Kind;
  const lines = body.lines ?? [];
  if (!sourceApp) return NextResponse.json({ error: "source_app is required" }, { status: 400 });
  if (!KINDS.includes(kind)) return NextResponse.json({ error: `kind must be one of ${KINDS.join(", ")}` }, { status: 400 });
  if (kind === "adjust") return NextResponse.json({ error: "adjust は棚卸の確定でのみ起票されます" }, { status: 400 });
  if (lines.length === 0) return NextResponse.json({ error: "lines is empty" }, { status: 400 });
  if (lines.length > 500) return NextResponse.json({ error: "lines は500件までにしてください" }, { status: 400 });

  const admin = createAdmin();
  const { data: company } = await admin.from("companies").select("id").limit(1).single();
  const companyId = (company as { id: string } | null)?.id;
  if (!companyId) return NextResponse.json({ error: "no company" }, { status: 500 });

  const codes = [...new Set(lines.map((l) => (l.code ?? "").trim()).filter(Boolean))];
  const { data: items } = await admin
    .from("inv_items")
    .select("id, code, store_id, cost_price")
    .eq("company_id", companyId)
    .in("code", codes)
    .is("deleted_at", null);
  const byCode = new Map(
    ((items ?? []) as Array<{ id: string; code: string; store_id: string | null; cost_price: number | null }>).map((i) => [
      i.code,
      i,
    ])
  );

  const occurredOn = body.occurred_on ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const unmatched: string[] = [];
  const rows = [];

  for (const l of lines) {
    const code = (l.code ?? "").trim();
    const item = byCode.get(code);
    if (!item) {
      unmatched.push(code || "(code未指定)");
      continue;
    }
    const abs = Math.abs(Math.trunc(Number(l.qty ?? 0)));
    if (abs === 0) continue; // 数量0の行は静かに捨てる（発注書の空行対策）
    rows.push({
      company_id: companyId,
      item_id: item.id,
      store_id: item.store_id,
      occurred_on: occurredOn,
      kind,
      qty: OUTBOUND.includes(kind) ? -abs : abs,
      unit_cost: l.unit_cost ?? item.cost_price,
      source_app: sourceApp,
      source_id: l.source_id ?? null,
      memo: l.memo ?? null,
    });
  }

  let inserted = 0;
  if (rows.length > 0) {
    // source_id 付きは重複を無視してスキップ（＝再送しても増えない）
    const { data, error } = await admin
      .from("inv_movements")
      .upsert(rows, { onConflict: "source_app,source_id", ignoreDuplicates: true })
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted = (data ?? []).length;
  }

  return NextResponse.json({
    ok: true,
    received: lines.length,
    inserted,
    skipped_duplicate: rows.length - inserted,
    unmatched,
  });
}

/** GET /api/v1/movements?code=... — 連携側が管理番号の存在と現在庫を確認するための口 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  const admin = createAdmin();
  const { data: company } = await admin.from("companies").select("id").limit(1).single();
  const companyId = (company as { id: string } | null)?.id;
  if (!companyId) return NextResponse.json({ error: "no company" }, { status: 500 });

  let q = admin
    .from("inv_stock")
    .select("code, name, maker, category, unit, qty, cost_price, reorder_point, needs_reorder")
    .eq("company_id", companyId)
    .eq("status", "active");
  if (code) q = q.eq("code", code);
  const { data, error } = await q.order("code").limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
