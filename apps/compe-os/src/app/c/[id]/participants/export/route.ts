import { requireActor } from "@/lib/auth";
import { getComp, listParticipants } from "@/lib/compe";

/** 参加者名簿のCSV書き出し。Excelで開けるようBOM付きUTF-8 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) return new Response("not found", { status: 404 });
  const participants = await listParticipants(id);

  const header = ["#", "氏名", "フリガナ", "HCP", "性別", "所属", "電話", "メール", "参加費", "メモ"];
  const rows = participants.map((p, i) => [
    String(i + 1),
    p.name,
    p.kana ?? "",
    p.hcp == null ? "" : String(p.hcp),
    p.gender === "female" ? "女" : p.gender === "male" ? "男" : "",
    p.org ?? "",
    p.tel ?? "",
    p.email ?? "",
    p.paid ? "済み" : "未払い",
    p.notes ?? "",
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${comp.name}_参加者名簿.csv`)}`,
    },
  });
}
