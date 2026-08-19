import { z } from "zod";
import { fail, monthParam, ok, readJson, withApi } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * 派遣シフト（このシステムの元データ）。
 * 給与計算・請求・勤怠・ゴルフ場側システムなど、外部はここを読めば全部わかる。
 *
 * GET   /api/v1/dispatches?month=YYYY-MM&status=confirmed&client_id=&partner_id=
 * POST  /api/v1/dispatches   作成（仮 or 確定）
 * PATCH /api/v1/dispatches   ステータス変更（確定・取消）
 */
export async function GET(request: Request) {
  return withApi(request, async ({ companyId, admin, url }) => {
    const range = monthParam(url);
    if (!range) return fail("VALIDATION", "month=YYYY-MM を指定してください");

    let q = admin
      .from("cad_dispatches")
      .select(
        "id, seq, dispatch_date, kind, status, confirmed_at, client_id, partner_id, staff_id, sales_amount, fee_amount, transport_amount, special_amount, work_hours, memo, billing_ym, cad_clients(name), cad_partners(name), staff(name)"
      )
      .eq("company_id", companyId)
      .gte("dispatch_date", range.from)
      .lte("dispatch_date", range.to)
      .is("deleted_at", null)
      .order("dispatch_date");

    const status = url.searchParams.get("status");
    const clientId = url.searchParams.get("client_id");
    const partnerId = url.searchParams.get("partner_id");
    if (status) q = q.eq("status", status);
    if (clientId) q = q.eq("client_id", clientId);
    if (partnerId) q = q.eq("partner_id", partnerId);

    const { data, error } = await q;
    if (error) return fail("INTERNAL", error.message);

    type Raw = {
      id: string;
      seq: string | null;
      dispatch_date: string;
      kind: string;
      status: string;
      confirmed_at: string | null;
      client_id: string | null;
      partner_id: string | null;
      staff_id: string | null;
      sales_amount: number;
      fee_amount: number;
      transport_amount: number;
      special_amount: number;
      work_hours: number | null;
      memo: string | null;
      billing_ym: string | null;
      cad_clients: { name: string } | null;
      cad_partners: { name: string } | null;
      staff: { name: string } | null;
    };

    return ok({
      dispatches: ((data ?? []) as unknown as Raw[]).map((r) => ({
        id: r.id,
        seq: r.seq,
        date: r.dispatch_date,
        kind: r.kind,
        status: r.status,
        confirmed_at: r.confirmed_at,
        client_id: r.client_id,
        client_name: r.cad_clients?.name ?? null,
        partner_id: r.partner_id,
        staff_id: r.staff_id,
        caddie_name: r.cad_partners?.name ?? r.staff?.name ?? null,
        is_employee: !!r.staff_id,
        sales_amount: r.sales_amount,
        fee_amount: r.fee_amount,
        transport_amount: r.transport_amount,
        special_amount: r.special_amount,
        pay_total: r.partner_id ? r.fee_amount + r.transport_amount + r.special_amount : 0,
        work_hours: r.work_hours,
        memo: r.memo,
        billing_ym: r.billing_ym,
      })),
    });
  });
}

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  client_id: z.string().uuid().nullish(),
  partner_id: z.string().uuid().nullish(),
  staff_id: z.string().uuid().nullish(),
  status: z.enum(["tentative", "confirmed"]).default("tentative"),
  kind: z.enum(["dispatch", "training", "other"]).default("dispatch"),
  sales_amount: z.number().int().min(0).nullish(),
  fee_amount: z.number().int().min(0).nullish(),
  transport_amount: z.number().int().min(0).nullish(),
  special_amount: z.number().int().min(0).nullish(),
  memo: z.string().max(500).nullish(),
});

/**
 * POST /api/v1/dispatches
 * 金額を省略するとマスタ（ゴルフ場の単価・委託料、キャディの標準交通費）から自動で埋める。
 * 社員（staff_id）は委託料・手当を0に強制する（給与との二重計上の防止。DBのCHECKでも弾かれる）。
 */
export async function POST(request: Request) {
  return withApi(request, async ({ companyId, admin }) => {
    const parsed = createSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "入力エラー");
    const v = parsed.data;
    if (!v.partner_id && !v.staff_id) return fail("VALIDATION", "partner_id か staff_id のどちらかが必要です");
    if (v.partner_id && v.staff_id) return fail("VALIDATION", "partner_id と staff_id は同時に指定できません");

    // 同じ日・同じ人の二重登録を弾く（再送しても増えない）
    const { data: dup } = await admin
      .from("cad_dispatches")
      .select("id")
      .eq("company_id", companyId)
      .eq("dispatch_date", v.date)
      .eq(v.partner_id ? "partner_id" : "staff_id", v.partner_id ?? v.staff_id!)
      .neq("status", "cancelled")
      .is("deleted_at", null)
      .limit(1);
    if ((dup ?? []).length > 0) return fail("CONFLICT", "この日は既に割り当て済みです");

    const [{ data: client }, { data: partner }, { data: rate }] = await Promise.all([
      v.client_id
        ? admin.from("cad_clients").select("unit_price, partner_fee").eq("id", v.client_id).eq("company_id", companyId).single()
        : Promise.resolve({ data: null }),
      v.partner_id
        ? admin.from("cad_partners").select("default_fee, default_transport").eq("id", v.partner_id).eq("company_id", companyId).single()
        : Promise.resolve({ data: null }),
      v.client_id && v.partner_id
        ? admin
            .from("cad_transport_rates")
            .select("amount")
            .eq("company_id", companyId)
            .eq("client_id", v.client_id)
            .eq("partner_id", v.partner_id)
            .is("deleted_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const c = client as { unit_price: number | null; partner_fee: number | null } | null;
    const p = partner as { default_fee: number | null; default_transport: number } | null;
    const isStaff = !!v.staff_id;

    const row = {
      company_id: companyId,
      dispatch_date: v.date,
      kind: v.kind,
      status: v.status,
      confirmed_at: v.status === "confirmed" ? new Date().toISOString() : null,
      client_id: v.client_id ?? null,
      partner_id: v.partner_id ?? null,
      staff_id: v.staff_id ?? null,
      sales_amount: v.sales_amount ?? c?.unit_price ?? 0,
      fee_amount: isStaff ? 0 : (v.fee_amount ?? c?.partner_fee ?? p?.default_fee ?? 0),
      transport_amount:
        v.transport_amount ?? (rate as { amount: number } | null)?.amount ?? p?.default_transport ?? 0,
      special_amount: isStaff ? 0 : (v.special_amount ?? 0),
      memo: v.memo ?? null,
    };

    const { data, error } = await admin.from("cad_dispatches").insert(row).select("id, status").single();
    if (error) return fail("CONFLICT", error.message);

    if (v.status === "confirmed") await afterConfirm(admin, companyId, v.date.slice(0, 7));
    return ok({ dispatch: data }, 201);
  });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["tentative", "confirmed", "cancelled"]),
});

/** PATCH /api/v1/dispatches — ステータス変更。確定した瞬間に台帳・請求・財務へ反映される */
export async function PATCH(request: Request) {
  return withApi(request, async ({ companyId, admin }) => {
    const parsed = patchSchema.safeParse(await readJson<unknown>(request));
    if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "入力エラー");

    const { data: cur } = await admin
      .from("cad_dispatches")
      .select("dispatch_date")
      .eq("id", parsed.data.id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .single();
    if (!cur) return fail("NOT_FOUND", "対象が見つかりません");

    const { data, error } = await admin
      .from("cad_dispatches")
      .update({
        status: parsed.data.status,
        confirmed_at: parsed.data.status === "confirmed" ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.id)
      .eq("company_id", companyId)
      .select("id, status")
      .single();
    if (error) return fail("INTERNAL", error.message);

    await afterConfirm(admin, companyId, (cur as { dispatch_date: string }).dispatch_date.slice(0, 7));
    return ok({ dispatch: data });
  });
}

/** 確定後の後処理（画面側の afterConfirm と同じ。採番の振り直し → 財務へ再集計） */
async function afterConfirm(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<unknown> },
  companyId: string,
  ym: string
) {
  await admin.rpc("renumber_caddy_seq", { p_company_id: companyId, p_month: `${ym}-01` });
  await admin.rpc("refresh_caddy_finance", { p_company_id: companyId, p_month: `${ym}-01` });
}
