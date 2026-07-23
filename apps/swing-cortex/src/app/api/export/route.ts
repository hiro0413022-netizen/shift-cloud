import * as XLSX from "xlsx";
import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * DB→Excel 書き出し（DB=正典、Excelはスナップショット）。
 * 現在の知識ベース(sc_symptoms/checkpoints/knowledge)を項目マスタと同じ列でxlsx化。
 */
export const dynamic = "force-dynamic";

type Row = {
  category: string;
  name: string;
  tags: string[] | null;
  sort_order: number;
  sc_checkpoints: {
    priority: number;
    title: string;
    sc_knowledge: { cause: string; fix: string; drill: string | null; client_explanation: string }[];
  }[];
};

export async function GET() {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_symptoms")
    .select(
      "category, name, tags, sort_order, sc_checkpoints(priority, title, sc_knowledge(cause, fix, drill, client_explanation))"
    )
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  const rows = (data ?? []) as unknown as Row[];
  const header = [
    "大分類",
    "症状項目",
    "別名・言い換え（検索用）",
    "確認優先度",
    "チェック項目",
    "原因",
    "改善・対処法",
    "おすすめドリル",
    "お客様への説明（そのまま送れる）",
  ];
  const aoa: (string | number)[][] = [header];
  for (const s of rows) {
    const cps = [...(s.sc_checkpoints ?? [])].sort((a, b) => a.priority - b.priority);
    if (cps.length === 0) {
      aoa.push([s.category, s.name, (s.tags ?? []).join("/"), "", "", "", "", "", ""]);
      continue;
    }
    cps.forEach((cp, i) => {
      const k = cp.sc_knowledge?.[0];
      aoa.push([
        i === 0 ? s.category : "",
        i === 0 ? s.name : "",
        i === 0 ? (s.tags ?? []).join("/") : "",
        `No.${cp.priority}`,
        cp.title ?? "",
        k?.cause ?? "",
        k?.fix ?? "",
        k?.drill ?? "",
        k?.client_explanation ?? "",
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [16, 20, 26, 9, 18, 34, 34, 26, 40].map((w) => ({ wch: w }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "項目マスタ");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const jst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="swing-cortex-master-${jst}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
