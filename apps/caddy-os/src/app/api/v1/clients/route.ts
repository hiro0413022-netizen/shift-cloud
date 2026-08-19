import { z } from "zod";
import { fail, ok, readJson, withApi } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/clients — ゴルフ場マスタ（単価・締め日・提出CSV書式・担当者） */
export async function GET(request: Request) {
  return withApi(request, async ({ companyId, admin, url }) => {
    const status = url.searchParams.get("status");
    let q = admin
      .from("cad_clients")
      .select(
        "id, code, name, unit_price, partner_fee, closing_day, payment_day, has_contract, phone, postal_code, address, csv_format, contact_name, contact_email, status, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("code");
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return fail("INTERNAL", error.message);
    return ok({ clients: data ?? [] });
  });
}

const createSchema = z.object({
  code: z.string().max(40).nullish(),
  name: z.string().min(1).max(120),
  unit_price: z.number().int().min(0).nullish(),
  partner_fee: z.number().int().min(0).nullish(),
  closing_day: z.string().max(20).nullish(),
  payment_day: z.string().max(20).nullish(),
  phone: z.string().max(40).nullish(),
  postal_code: z.string().max(20).nullish(),
  address: z.string().max(200).nullish(),
  csv_format: z.enum(["standard", "simple", "grouped", "wide"]).default("standard"),
  contact_name: z.string().max(120).nullish(),
  contact_email: z.string().max(200).nullish(),
  status: z.enum(["active", "inactive"]).default("active"),
});

/** POST /api/v1/clients — ゴルフ場登録（同名は更新扱い） */
export async function POST(request: Request) {
  return withApi(request, async ({ companyId, admin }) => {
    const parsed = createSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "入力エラー");

    const { data, error } = await admin
      .from("cad_clients")
      .upsert({ ...parsed.data, company_id: companyId, deleted_at: null }, { onConflict: "company_id,name" })
      .select("id, code, name, status")
      .single();
    if (error) return fail("CONFLICT", error.message);
    return ok({ client: data }, 201);
  });
}
