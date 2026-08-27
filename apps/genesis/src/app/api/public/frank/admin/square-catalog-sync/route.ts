import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * レジ商品（会費・その他カテゴリ）の Square カタログ投入（#159・運用ワンショットAPI）
 *
 * なぜAPIか: `scripts/frank-square-setup.mjs` と同じことをするが、
 * **SQUARE_ACCESS_TOKEN は Vercel env にしかない**。
 * ローカルでスクリプトを回すには誰かがトークンを手元にコピーする必要があり、
 * その一手間と、コピーしたトークンが端末に残るリスクを無くすために、
 * 本番環境自身に作らせる。square-plan-sync（#136）と同じ考え方・同じ認証。
 *
 * 冪等: 同名の商品が既にあればスキップする（setup.mjs と同じ判定）。
 *       何度実行しても商品は増えない。
 *
 * ⚠ 品目と価格の正典は `scripts/frank-square-setup.mjs` の FEE_ITEMS。
 *   片方だけ直すと、次に setup.mjs を回したときに食い違う。**両方直すこと。**
 *
 * 認証: Authorization: Bearer <token>
 *       gn_ops_tokens（0113）に sha256 で登録された
 *       purpose='frank_square_catalog_sync' かつ期限内のものだけ有効。
 */

const SQUARE_API = "https://connect.squareup.com/v2";
const FEE_CATEGORY = "会費・その他";

/** 税込・円。scripts/frank-square-setup.mjs の FEE_ITEMS と同じ値に保つこと */
const FEE_ITEMS: Array<[string, number]> = [
  ["入会金", 11000],
  ["休会費（1か月）", 2200],
  ["ビジター利用料", 5500],
  ["体験レッスン", 3300], // キャンペーン中はレジで金額を0円に変更して打つ
  ["レッスン単発（25分）", 2500],
];

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
    .eq("purpose", "frank_square_catalog_sync")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!tok) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await admin.from("gn_ops_tokens").update({ used_at: new Date().toISOString() }).eq("id", tok.id);

  const squareToken = (process.env.SQUARE_ACCESS_TOKEN ?? "").trim();
  if (squareToken.length < 10) {
    return NextResponse.json({ ok: false, error: "square_env_missing" }, { status: 503 });
  }

  try {
    // 既存の商品名（冪等の判定に使う。setup.mjs と同じく「名前が一致したらスキップ」）
    const items = await listCatalog(squareToken, "ITEM");
    const existingNames = new Set(
      items.map((o) => String((o.item_data as { name?: string } | undefined)?.name ?? "")),
    );

    // 税（消費税10%・INCLUSIVE）とカテゴリを find（無ければ税なし/カテゴリなしで作る）
    const taxes = await listCatalog(squareToken, "TAX");
    const tax = taxes.find((t) => (t.tax_data as { name?: string } | undefined)?.name?.includes("消費税"));
    const categories = await listCatalog(squareToken, "CATEGORY");
    const feeCategory = categories.find(
      (c) => (c.category_data as { name?: string } | undefined)?.name === FEE_CATEGORY,
    );

    const results: Array<{ name: string; created: boolean; price?: number; error?: string }> = [];
    for (const [name, price] of FEE_ITEMS) {
      if (existingNames.has(name)) {
        results.push({ name, created: false });
        continue;
      }
      const object: Record<string, unknown> = {
        type: "ITEM",
        id: "#item",
        present_at_all_locations: true,
        item_data: {
          name,
          ...(tax ? { tax_ids: [String(tax.id)] } : {}),
          ...(feeCategory
            ? { categories: [{ id: String(feeCategory.id) }], reporting_category: { id: String(feeCategory.id) } }
            : {}),
          variations: [
            {
              type: "ITEM_VARIATION",
              id: "#v1",
              present_at_all_locations: true,
              item_variation_data: {
                item_id: "#item",
                name: "通常",
                ordinal: 0,
                pricing_type: "FIXED_PRICING",
                price_money: { amount: price, currency: "JPY" },
              },
            },
          ],
        },
      };
      try {
        await sq(squareToken, "POST", "/catalog/object", { idempotency_key: randomUUID(), object });
        results.push({ name, created: true, price });
      } catch (e) {
        // 古いAPIバージョンのアカウントは categories 未対応（setup.mjs と同じフォールバック）
        if (String(e).includes("categories") && feeCategory) {
          const d = object.item_data as Record<string, unknown>;
          delete d.categories;
          delete d.reporting_category;
          d.category_id = String(feeCategory.id);
          await sq(squareToken, "POST", "/catalog/object", { idempotency_key: randomUUID(), object });
          results.push({ name, created: true, price });
        } else {
          results.push({ name, created: false, error: String(e instanceof Error ? e.message : e) });
        }
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e instanceof Error ? e.message : e) }, { status: 500 });
  }
}
