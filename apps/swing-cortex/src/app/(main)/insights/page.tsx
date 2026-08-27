import { requireCoachActor } from "@/lib/auth";
import { loadInsights, loadCoachInsights } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const actor = await requireCoachActor();
  const [{ commentCount, diagCount, phases }, coaches] = await Promise.all([
    loadInsights(actor.companyId),
    loadCoachInsights(actor.companyId),
  ]);
  const max = Math.max(1, ...phases.map((p) => p.count));
  // コーチ名が数値だけ（取込元にID列しかない店）のときは「コーチ」を頭につけて表示
  const coachLabel = (c: string) => (/^[0-9]+$/.test(c) ? `コーチ ${c}` : c);
  return (
    <div className="p-5 pb-8">
      <h1 className="mb-1 text-xl font-bold text-slate-900">本部インサイト</h1>
      <p className="mb-4 text-xs text-slate-400">全店・全コーチの診断が1つの脳に蓄積されます。</p>

      <div className="mb-5 grid grid-cols-3 gap-2">
        {[
          [commentCount.toLocaleString(), "蓄積コメント"],
          [phases.length.toString(), "局面タグ"],
          [diagCount.toLocaleString(), "診断ログ"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-2xl border border-slate-100 bg-white p-3 text-center">
            <div className="text-lg font-bold text-slate-900">{n}</div>
            <div className="text-[10px] text-slate-400">{l}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="mb-3 text-sm font-semibold text-slate-700">スイング局面の出現数</div>
        {phases.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">
            まだ集計がありません。設定 → Excel取込 でコメントを解析してください。
          </div>
        ) : (
          <div className="space-y-2">
            {phases.map((p) => (
              <div key={p.label} className="flex items-center gap-2">
                <div className="w-24 shrink-0 text-right text-[11px] text-slate-500">{p.label}</div>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500"
                    style={{ width: `${Math.round((p.count / max) * 100)}%` }}
                  />
                </div>
                <div className="w-10 text-right text-[11px] text-slate-400">{p.count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {coaches.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4">
          <div className="mb-1 text-sm font-semibold text-slate-700">コーチ別の傾向</div>
          <p className="mb-3 text-[11px] text-slate-400">
            取込コメントをコーチ単位で集計。よく指摘する局面とキーワードが分かります。
          </p>
          <div className="space-y-4">
            {coaches.map((c) => {
              const cmax = Math.max(1, ...c.topPhases.map((p) => p.count));
              return (
                <div key={c.coach} className="rounded-xl border border-slate-100 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-800">{coachLabel(c.coach)}</div>
                    <div className="text-[11px] text-slate-400">{c.commentCount.toLocaleString()}件</div>
                  </div>
                  <div className="space-y-1.5">
                    {c.topPhases.slice(0, 4).map((p) => (
                      <div key={p.label} className="flex items-center gap-2">
                        <div className="w-24 shrink-0 text-right text-[11px] text-slate-500">{p.label}</div>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-teal-500"
                            style={{ width: `${Math.round((p.count / cmax) * 100)}%` }}
                          />
                        </div>
                        <div className="w-10 text-right text-[11px] text-slate-400">{p.count}</div>
                      </div>
                    ))}
                  </div>
                  {c.topSymptoms.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.topSymptoms.slice(0, 4).map((sy) => (
                        <span
                          key={sy.label}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500"
                        >
                          {sy.label} {sy.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
