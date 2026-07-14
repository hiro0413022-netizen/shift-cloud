import { requireSurveyActor } from "@/lib/auth";
import { loadSurveyData } from "@/lib/results";
import { rankingStats, answerToCell, csvEscape, type QOption } from "@/lib/survey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toCsvResponse(rows: string[][], filename: string): Response {
  const body = "﻿" + rows.map((r) => r.map((c) => csvEscape(c ?? "")).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const actor = await requireSurveyActor();
  const data = await loadSurveyData(surveyId, actor.companyId);
  if (!data) return new Response("not found", { status: 404 });

  const { survey, questions, responses, byResponse, byCode } = data;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "wide";

  if (type === "coach") {
    const rankingQs = questions.filter((q) => q.type === "ranking");
    const rows: string[][] = [["設問コード", "設問", "コーチ", "ボルダ平均(0-100)", "平均順位", "1位回数", "1位率(%)", "評価数"]];
    // 総合
    const pool: QOption[] = rankingQs[0] ? rankingQs[0].config.pool ?? rankingQs[0].options : [];
    const overallAcc = new Map<string, { sum: number; n: number; firsts: number; appear: number; label: string }>();
    for (const c of pool) overallAcc.set(c.value, { sum: 0, n: 0, firsts: 0, appear: 0, label: c.label });

    for (const q of rankingQs) {
      const orders = (byCode.get(q.code) ?? []).map((v) => v.order ?? []).filter((o) => o.length > 0);
      const stats = rankingStats(orders, q.config.pool ?? q.options);
      for (const s of stats) {
        if (s.appearances === 0) continue;
        rows.push([q.code, q.title, s.label, String(s.bordaAvg), String(s.avgRank ?? ""), String(s.firsts), String(s.firstRate), String(s.appearances)]);
        const acc = overallAcc.get(s.value);
        if (acc) { acc.sum += s.bordaAvg; acc.n += 1; acc.firsts += s.firsts; acc.appear += s.appearances; }
      }
    }
    rows.push([]);
    rows.push(["総合", "全設問平均", "コーチ", "ボルダ平均(0-100)", "", "1位回数", "", "評価数"]);
    const overall = [...overallAcc.values()].map((a) => ({ ...a, avg: a.n ? Math.round((a.sum / a.n) * 10) / 10 : null }));
    overall.sort((x, y) => (y.avg ?? -1) - (x.avg ?? -1));
    for (const a of overall) rows.push(["総合", "全設問平均", a.label, String(a.avg ?? ""), "", String(a.firsts), "", String(a.appear)]);

    return toCsvResponse(rows, `${survey.slug}_コーチ得点.csv`);
  }

  // wide: 1回答=1行
  const header = ["No", "送信日時", ...questions.map((q) => `${q.code} ${q.title}`)];
  const rows: string[][] = [header];
  responses.forEach((r, i) => {
    const m = byResponse.get(r.id);
    const row = [String(i + 1), new Date(r.submitted_at).toLocaleString("ja-JP")];
    for (const q of questions) row.push(answerToCell(q, m?.get(q.code)));
    rows.push(row);
  });

  return toCsvResponse(rows, `${survey.slug}_全回答.csv`);
}
