import Link from "next/link";
import { requireSurveyActor } from "@/lib/auth";
import { loadSurveyData, shortRankLabel } from "@/lib/results";
import { rankingStats, countChoices, type CoachStat, type QOption } from "@/lib/survey";
import { Panel, Badge, Empty, ProgressBar, STATUS_LABEL, btnGhostCls } from "@/components/ui";

export const dynamic = "force-dynamic";

function heatColor(v: number | null): string {
  if (v == null) return "transparent";
  // 0(赤)→50(黄)→100(緑)
  const hue = Math.round((v / 100) * 120);
  return `hsl(${hue} 70% 90%)`;
}

export default async function ResultsPage({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const actor = await requireSurveyActor();
  const data = await loadSurveyData(surveyId, actor.companyId);
  if (!data) return <Panel><Empty>アンケートが見つかりません。</Empty></Panel>;

  const { survey, questions, byCode, responseIds } = data;
  const total = responseIds.length;

  const rankingQs = questions.filter((q) => q.type === "ranking");
  const pool: QOption[] = rankingQs[0] ? rankingQs[0].config.pool ?? rankingQs[0].options : [];

  // 各順位設問のコーチ別スタッツ
  const rankStatsByCode = new Map<string, Map<string, CoachStat>>();
  for (const q of rankingQs) {
    const orders = (byCode.get(q.code) ?? []).map((v) => v.order ?? []).filter((o) => o.length > 0);
    const stats = rankingStats(orders, q.config.pool ?? q.options);
    rankStatsByCode.set(q.code, new Map(stats.map((s) => [s.value, s])));
  }

  // コーチ総合（各設問のボルダ平均をさらに平均、評価があった設問のみ）
  const coachOverall = pool.map((c) => {
    const vals: number[] = [];
    let firsts = 0;
    let appear = 0;
    for (const q of rankingQs) {
      const st = rankStatsByCode.get(q.code)?.get(c.value);
      if (st && st.appearances > 0) {
        vals.push(st.bordaAvg);
        firsts += st.firsts;
        appear += st.appearances;
      }
    }
    const overall = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    return { coach: c, overall, firsts, appear };
  });
  const overallSorted = [...coachOverall].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Link href="/" className="text-xs text-accent">← 一覧</Link>
            <Badge tone={survey.status === "open" ? "ok" : survey.status === "closed" ? "danger" : "default"}>
              {STATUS_LABEL[survey.status] ?? survey.status}
            </Badge>
          </div>
          <h1 className="text-xl font-bold">{survey.title}</h1>
          <p className="mt-1 text-sm text-[--color-dim]">回答数 {total} 件</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/${survey.id}/edit`} className={btnGhostCls}>編集</Link>
          <a href={`/api/export/${survey.id}?type=wide`} className={btnGhostCls}>CSV（全回答）</a>
          <a href={`/api/export/${survey.id}?type=coach`} className={btnGhostCls}>CSV（コーチ得点）</a>
        </div>
      </div>

      {total === 0 && <Panel><Empty>まだ回答がありません。</Empty></Panel>}

      {/* コーチ総合ランキング */}
      {total > 0 && rankingQs.length > 0 && (
        <Panel title="コーチ総合評価（全13設問のボルダ平均）">
          <p className="mb-3 text-xs text-[--color-dim]">
            ボルダ平均 = 各設問で「1位=100点〜最下位」に換算した得点の平均（受講経験ありの評価のみ・0〜100、高いほど良い）。
          </p>
          <div className="space-y-2">
            {overallSorted.map((r, i) => (
              <div key={r.coach.value} className="flex items-center gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${i === 0 ? "bg-yellow-100 text-yellow-800" : "bg-slate-100 text-slate-600"}`}>{i + 1}</span>
                <span className="w-28 shrink-0 truncate text-sm font-medium">{r.coach.label}</span>
                <div className="flex-1"><ProgressBar value={r.overall ?? 0} tone={i === 0 ? "gold" : "accent"} /></div>
                <span className="w-14 shrink-0 text-right text-sm font-bold tabular-nums">{r.overall ?? "—"}</span>
                <span className="w-24 shrink-0 text-right text-xs text-[--color-dim]">1位{r.firsts}回 / 評価{r.appear}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* 強み・弱みヒートマップ */}
      {total > 0 && rankingQs.length > 0 && (
        <Panel title="強み・弱みヒートマップ（設問別ボルダ平均）">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-[--color-panel] px-2 py-2 text-left font-semibold">コーチ \ 項目</th>
                  {rankingQs.map((q) => (
                    <th key={q.code} className="min-w-[64px] px-1 py-2 text-center font-medium text-[--color-dim]" title={q.title}>
                      {shortRankLabel(q.title)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pool.map((c) => (
                  <tr key={c.value}>
                    <td className="sticky left-0 z-10 bg-[--color-panel] px-2 py-1.5 font-medium">{c.label}</td>
                    {rankingQs.map((q) => {
                      const st = rankStatsByCode.get(q.code)?.get(c.value);
                      const v = st && st.appearances > 0 ? st.bordaAvg : null;
                      return (
                        <td key={q.code} className="px-1 py-1.5 text-center tabular-nums" style={{ background: heatColor(v) }} title={st ? `平均順位 ${st.avgRank ?? "—"} / 評価${st.appearances}` : "評価なし"}>
                          {v ?? "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-[--color-dim]">セル値=ボルダ平均（緑ほど高評価/赤ほど要改善）。マウスオーバーで平均順位・評価数を表示。</p>
        </Panel>
      )}

      {/* 設問別 詳細 */}
      {total > 0 && questions.map((q) => {
        if (q.type === "ranking") {
          const stats = [...(rankStatsByCode.get(q.code)?.values() ?? [])]
            .filter((s) => s.appearances > 0)
            .sort((a, b) => b.bordaAvg - a.bordaAvg);
          if (stats.length === 0) return null;
          return (
            <Panel key={q.code} title={`${q.code}. ${q.title}`}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[--color-dim]">
                    <tr className="border-b border-[--color-line]">
                      <th className="py-2 text-left">順位</th>
                      <th className="py-2 text-left">コーチ</th>
                      <th className="py-2 text-right">ボルダ平均</th>
                      <th className="py-2 text-right">平均順位</th>
                      <th className="py-2 text-right">1位</th>
                      <th className="py-2 text-right">評価数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s, i) => (
                      <tr key={s.value} className="border-b border-[--color-line]/60">
                        <td className="py-2">{i + 1}</td>
                        <td className="py-2 font-medium">{s.label}</td>
                        <td className="py-2 text-right font-bold tabular-nums">{s.bordaAvg}</td>
                        <td className="py-2 text-right tabular-nums">{s.avgRank ?? "—"}</td>
                        <td className="py-2 text-right tabular-nums">{s.firsts}</td>
                        <td className="py-2 text-right tabular-nums text-[--color-dim]">{s.appearances}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          );
        }

        if (q.type === "single" || q.type === "scale" || q.type === "multi") {
          const vals = byCode.get(q.code) ?? [];
          const flat =
            q.type === "multi"
              ? vals.flatMap((v) => v.values ?? [])
              : vals.map((v) => v.value).filter((x): x is string => !!x);
          const denom = q.type === "multi" ? total : flat.length;
          const counts = countChoices(flat, q.options).map((c) => ({
            ...c,
            pct: denom > 0 ? Math.round((c.count / denom) * 1000) / 10 : 0,
          }));
          const others = q.type === "multi" ? vals.map((v) => v.other).filter((x): x is string => !!x && x.trim() !== "") : [];
          return (
            <Panel key={q.code} title={`${q.code}. ${q.title}`}>
              <p className="mb-3 text-xs text-[--color-dim]">
                {q.type === "multi" ? `回答者 ${total} 名中（複数選択）` : `回答 ${flat.length} 件`}
              </p>
              <div className="space-y-2">
                {counts.map((c) => (
                  <div key={c.option.value} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 truncate text-sm">{c.option.label}</span>
                    <div className="flex-1"><ProgressBar value={c.pct} /></div>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-[--color-dim]">{c.count}件 ({c.pct}%)</span>
                  </div>
                ))}
              </div>
              {others.length > 0 && (
                <div className="mt-3 rounded-lg bg-[--color-panel-2] p-3">
                  <p className="mb-1 text-xs font-semibold text-[--color-dim]">その他の記述</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">
                    {others.map((o, i) => <li key={i}>{o}</li>)}
                  </ul>
                </div>
              )}
            </Panel>
          );
        }

        // text / textarea
        const texts = (byCode.get(q.code) ?? []).map((v) => v.text).filter((x): x is string => !!x && x.trim() !== "");
        return (
          <Panel key={q.code} title={`${q.code}. ${q.title}`}>
            <p className="mb-2 text-xs text-[--color-dim]">{texts.length} 件の記述</p>
            {texts.length === 0 ? (
              <Empty>記述はありません。</Empty>
            ) : (
              <ul className="space-y-2">
                {texts.map((t, i) => (
                  <li key={i} className="rounded-lg border border-[--color-line] bg-white px-3 py-2 text-sm whitespace-pre-wrap">{t}</li>
                ))}
              </ul>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
