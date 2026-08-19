import { z } from "zod";
import { fail, monthParam, ok, readJson, withApi } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/availability?month=YYYY-MM&partner_id=... — シフト希望
 * LINE Bot や外部フォームから希望を書き込む口も同じリソースで持つ（POST）。
 */
export async function GET(request: Request) {
  return withApi(request, async ({ companyId, admin, url }) => {
    const range = monthParam(url);
    if (!range) return fail("VALIDATION", "month=YYYY-MM を指定してください");
    const partnerId = url.searchParams.get("partner_id");

    let q = admin
      .from("cad_availability")
      .select("id, partner_id, date, status, memo, source, submitted_at, cad_partners(name)")
      .eq("company_id", companyId)
      .gte("date", range.from)
      .lte("date", range.to)
      .is("deleted_at", null)
      .order("date");
    if (partnerId) q = q.eq("partner_id", partnerId);

    const { data, error } = await q;
    if (error) return fail("INTERNAL", error.message);

    type Raw = {
      id: string;
      partner_id: string;
      date: string;
      status: string;
      memo: string | null;
      source: string;
      submitted_at: string | null;
      cad_partners: { name: string } | null;
    };
    return ok({
      availability: ((data ?? []) as unknown as Raw[]).map((r) => ({
        id: r.id,
        partner_id: r.partner_id,
        partner_name: r.cad_partners?.name ?? null,
        date: r.date,
        status: r.status,
        memo: r.memo,
        source: r.source,
        submitted_at: r.submitted_at,
      })),
    });
  });
}

const itemSchema = z.object({
  partner_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["available", "maybe", "unavailable"]),
  memo: z.string().max(500).nullish(),
});
const bodySchema = z.object({ items: z.array(itemSchema).min(1).max(500) });

/**
 * POST /api/v1/availability — シフト希望の登録・更新（まとめて可）
 * body: { "items": [{ "partner_id": "...", "date": "2026-09-01", "status": "available" }] }
 * 同じキャディ・同じ日は上書き（何度送っても増えない）。
 */
export async function POST(request: Request) {
  return withApi(request, async ({ companyId, admin }) => {
    const parsed = bodySchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "入力エラー");

    const now = new Date().toISOString();
    const rows = parsed.data.items.map((i) => ({
      company_id: companyId,
      partner_id: i.partner_id,
      date: i.date,
      status: i.status,
      memo: i.memo ?? null,
      source: "api",
      submitted_at: now,
      deleted_at: null,
    }));

    const { data, error } = await admin
      .from("cad_availability")
      .upsert(rows, { onConflict: "partner_id,date" })
      .select("id");
    if (error) return fail("CONFLICT", error.message);
    return ok({ upserted: (data ?? []).length }, 201);
  });
}
