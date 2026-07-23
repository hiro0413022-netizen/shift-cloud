import { requireCoachActor } from "@/lib/auth";
import { loadInsights } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const actor = await requireCoachActor();
  const { commentCount, diagCount, phases } = await loadInsights(actor.companyId);
  const max = Math.max(1, ...phases.map((p) => p.count));
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
    </div>
  );
}
