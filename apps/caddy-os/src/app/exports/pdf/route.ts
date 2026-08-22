import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@yozan/core/supabase/admin";
import { getMonthBoard } from "@/lib/caddy";
import { exportFileName, type ExportRow } from "@/lib/csv";
import { buildExportPdf } from "@/lib/export-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * ゴルフ場提出PDF（小川さん依頼 2026-08-22 / #145）
 *   GET /exports/pdf?ym=2026-08&client=<uuid>&kari=1
 *
 * 行の組み立ては画面（/exports）と同じ getMonthBoard → 同じ絞り込みで、ここでも作り直す。
 * 画面から行データを受け取らないのは、URLを直接叩かれたときに中身を差し替えられないようにするため。
 */
export async function GET(request: Request) {
  const actor = await requireActor();
  const url = new URL(request.url);
  const ym = url.searchParams.get("ym") ?? "";
  const clientId = url.searchParams.get("client") ?? "";
  const withTentative = url.searchParams.get("kari") === "1";

  if (!/^\d{4}-\d{2}$/.test(ym)) return new NextResponse("ym が不正です", { status: 400 });
  if (!clientId) return new NextResponse("client が未指定です", { status: 400 });

  const admin = createAdmin();
  const [board, { data: client }] = await Promise.all([
    getMonthBoard(actor.companyId, ym),
    admin
      .from("cad_clients")
      .select("id, name, contact_name")
      .eq("company_id", actor.companyId)
      .eq("id", clientId)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);
  if (!client) return new NextResponse("ゴルフ場が見つかりません", { status: 404 });

  const c = client as { id: string; name: string; contact_name: string | null };

  // 画面と同じ条件（自社ゴルフウィング勤務は提出対象外）
  const rows: ExportRow[] = board.dispatches
    .filter((d) => d.client_id === c.id && d.kind !== "golfwing")
    .filter((d) => (withTentative ? d.status !== "cancelled" : d.status === "confirmed"))
    .sort((a, b) =>
      a.dispatch_date === b.dispatch_date
        ? a.caddie_name.localeCompare(b.caddie_name, "ja")
        : a.dispatch_date < b.dispatch_date
          ? -1
          : 1
    )
    .map((d) => ({
      date: d.dispatch_date,
      client_name: c.name,
      caddie_name: d.caddie_name,
      memo: d.memo,
      status: d.status,
    }));

  if (rows.length === 0) return new NextResponse("この月に出せる派遣がありません", { status: 404 });

  const now = new Date(Date.now() + 9 * 3600 * 1000); // JST
  const generatedOn = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(
    now.getUTCDate()
  ).padStart(2, "0")}`;

  const pdf = await buildExportPdf({
    companyName: "株式会社YOZAN",
    clientName: c.name,
    ymLabel: `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月`,
    generatedOn,
    contactName: c.contact_name,
    rows,
    withTentative,
  });

  const name = exportFileName(c.name, ym, "pdf", withTentative);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // 日本語ファイル名は filename* (RFC 5987) で渡す
      "Content-Disposition": `attachment; filename="export_${ym}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
