import { z } from "zod";
import { fail, ok, readJson, withApi } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/partners?status=active — キャディマスタ（連絡先・在籍状況・標準単価） */
export async function GET(request: Request) {
  return withApi(request, async ({ companyId, admin, url }) => {
    const status = url.searchParams.get("status");
    let q = admin
      .from("cad_partners")
      .select(
        "id, code, name, name_kana, phone, email, main_course, default_fee, default_transport, hourly_wage, show_in_picker, status, memo, created_at, updated_at"
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("code");
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return fail("INTERNAL", error.message);
    return ok({ partners: data ?? [] });
  });
}

const createSchema = z.object({
  code: z.string().max(40).nullish(),
  name: z.string().min(1).max(120),
  name_kana: z.string().max(120).nullish(),
  phone: z.string().max(40).nullish(),
  email: z.string().max(200).nullish(),
  main_course: z.string().max(120).nullish(),
  default_fee: z.number().int().min(0).nullish(),
  default_transport: z.number().int().min(0).default(0),
  hourly_wage: z.number().int().min(0).nullish(),
  status: z.enum(["active", "inactive"]).default("active"),
});

/** POST /api/v1/partners — キャディ登録（同名は更新扱い。取り込みを何度流しても増えない） */
export async function POST(request: Request) {
  return withApi(request, async ({ companyId, admin }) => {
    const body = await readJson<unknown>(request);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "入力エラー");

    const { data, error } = await admin
      .from("cad_partners")
      .upsert({ ...parsed.data, company_id: companyId, deleted_at: null }, { onConflict: "company_id,name" })
      .select("id, code, name, status")
      .single();
    if (error) return fail("CONFLICT", error.message);
    return ok({ partner: data }, 201);
  });
}
