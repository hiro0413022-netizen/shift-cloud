import "server-only";
import { NextResponse } from "next/server";
import { createAdmin } from "@yozan/core/supabase/admin";

/* ============================================================
   外部連携API の共通土台（docs/genesis/API_STANDARD.md 準拠 / DECISIONS #140）

   小川さん依頼 5.「最初からAPI連携しやすい構造で」への回答。
   画面（Server Actions）とAPIは **同じ cad_* テーブル** を見る。ロジックの二重実装をしない。

   認証: Authorization: Bearer <CADDY_API_TOKEN>（inventory-os #96 と同方式）
   将来スコープ別のキーが必要になったら integration_configs へ移す（API_STANDARD.md）。
   ============================================================ */

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: ErrorCode; message: string } };
export type ErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  INTERNAL: 500,
};

export function ok<T>(data: T, init?: number) {
  return NextResponse.json<ApiOk<T>>({ ok: true, data }, { status: init ?? 200 });
}

export function fail(code: ErrorCode, message: string) {
  return NextResponse.json<ApiErr>({ ok: false, error: { code, message } }, { status: STATUS[code] });
}

/** Bearerトークンの照合。CADDY_API_TOKEN 未設定なら常に拒否（＝事故で口が開かない） */
export function authorized(request: Request): boolean {
  const token = process.env.CADDY_API_TOKEN;
  if (!token) return false;
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return !!m && m[1] === token;
}

/**
 * APIハンドラの共通ラッパー。
 * company_id は**リクエストから受け取らない**（API_STANDARD.md: クライアント入力を信用しない）。
 * 単一法人運用なので companies の先頭を使う（inventory-os と同じ）。
 */
export async function withApi(
  request: Request,
  run: (ctx: { companyId: string; admin: ReturnType<typeof createAdmin>; url: URL }) => Promise<Response>
): Promise<Response> {
  if (!authorized(request)) return fail("UNAUTHORIZED", "Authorization: Bearer <CADDY_API_TOKEN> が必要です");
  try {
    const admin = createAdmin();
    const { data: company } = await admin.from("companies").select("id").limit(1).single();
    const companyId = (company as { id: string } | null)?.id;
    if (!companyId) return fail("INTERNAL", "company が見つかりません");
    return await run({ companyId, admin, url: new URL(request.url) });
  } catch (e) {
    return fail("INTERNAL", e instanceof Error ? e.message : "内部エラー");
  }
}

/** JSONボディを安全に読む */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** "2026-08" → {from,to}。month 未指定なら null を返す */
export function monthParam(url: URL): { from: string; to: string } | null {
  const ym = url.searchParams.get("month");
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
