import { fail, monthParam, ok, withApi } from "@/lib/api";
import { buildCsv, csvFileName, withBom, type CsvFormat, type ExportRow } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/exports?month=YYYY-MM&client_id=...&format=csv|json
 *
 * ゴルフ場へ渡す派遣日一覧。画面のCSVボタンと **同じ純粋関数** (lib/csv.ts) で組み立てるので、
 * 人が押しても機械が叩いても中身が一致する。書式は client_id のマスタ設定を既定値にし、
 * `csv_format` クエリで一時的に上書きできる。
 *
 * 対象は確定した派遣のみ（仮組みは外部に出さない）。
 */
export async function GET(request: Request) {
  return withApi(request, async ({ companyId, admin, url }) => {
    const range = monthParam(url);
    if (!range) return fail("VALIDATION", "month=YYYY-MM を指定してください");
    const clientId = url.searchParams.get("client_id");
    if (!clientId) return fail("VALIDATION", "client_id を指定してください");

    const { data: client } = await admin
      .from("cad_clients")
      .select("id, name, csv_format")
      .eq("id", clientId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .single();
    const c = client as { id: string; name: string; csv_format: CsvFormat } | null;
    if (!c) return fail("NOT_FOUND", "ゴルフ場が見つかりません");

    const { data, error } = await admin
      .from("cad_dispatches")
      .select("dispatch_date, memo, cad_partners(name), staff(name)")
      .eq("company_id", companyId)
      .eq("client_id", clientId)
      .eq("status", "confirmed")
      .gte("dispatch_date", range.from)
      .lte("dispatch_date", range.to)
      .is("deleted_at", null)
      .order("dispatch_date");
    if (error) return fail("INTERNAL", error.message);

    type Raw = {
      dispatch_date: string;
      memo: string | null;
      cad_partners: { name: string } | null;
      staff: { name: string } | null;
    };
    const rows: ExportRow[] = ((data ?? []) as unknown as Raw[])
      .map((r) => ({
        date: r.dispatch_date,
        client_name: c.name,
        caddie_name: r.cad_partners?.name ?? r.staff?.name ?? "",
        memo: r.memo,
      }))
      .sort((a, b) => (a.date === b.date ? a.caddie_name.localeCompare(b.caddie_name, "ja") : a.date < b.date ? -1 : 1));

    const ym = range.from.slice(0, 7);
    const format = (url.searchParams.get("csv_format") as CsvFormat | null) ?? c.csv_format ?? "standard";

    if ((url.searchParams.get("format") ?? "csv") === "json") {
      return ok({ client: { id: c.id, name: c.name }, month: ym, format, rows });
    }

    return new Response(withBom(buildCsv(format, rows, ym)), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(csvFileName(c.name, ym))}`,
      },
    });
  });
}
