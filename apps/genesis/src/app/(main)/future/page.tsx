import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FuturePage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const [{ data: kpis }, { data: devStatuses }, { data: sims }] = await Promise.all([
    admin.from("kpis").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("code"),
    admin.from("development_statuses").select("*").eq("company_id", actor.companyId).is("deleted_at", null),
    admin.from("simulations").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("created_at", { ascending: false }).limit(10),
  ]);

  const genesis = (devStatuses ?? []).find((s) => s.module_name === "Genesis Kernel");

  // MVP: ダミー予測（実データ接続後にKPI trendから算出する設計）
  const timeline = [
    { label: "今日", items: ["Shift Cloud 4店舗運用", `Genesis Kernel ${genesis?.progress ?? 0}%`] },
    { label: "今週", items: ["Genesis Cockpit稼働開始", "実運用フィードバック収集"] },
    { label: "今月", items: ["Webhook連携（GitHub/Vercel）有効化", "売上・会員KPIの実データ接続（会計/POS・CRM）"] },
    { label: "3ヶ月後", items: ["在庫 or 予約モジュール着手", "AIエージェント実行の自動記録"] },
    { label: "半年後", items: ["多店舗展開対応の検証", "KALLINOS EC管理の設計"] },
    { label: "1年後", items: ["Module Generatorによる新規モジュール量産", "未来シミュレーションの実データ化"] },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Future Simulation</h1>
        <p className="text-sm text-[--color-dim]">
          KPIと未来予測タイムライン（労務系KPIはShift Cloud実データ、売上・会員は接続待ち）
        </p>
      </header>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(kpis ?? []).map((k) => (
          <div key={k.id} className="rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
            <p className="text-xs text-[--color-dim]">{k.name}</p>
            <p className="mt-1 text-2xl font-bold">
              {k.current_value != null ? `${Number(k.current_value).toLocaleString()}${k.unit}` : "—"}
            </p>
            <p className="mt-1 text-xs text-[--color-dim]">
              {k.target_value != null ? `目標 ${Number(k.target_value).toLocaleString()}${k.unit}` : (k.notes ?? "")}
            </p>
          </div>
        ))}
      </div>

      {/* タイムライン */}
      <Panel title="未来タイムライン">
        <ol className="relative space-y-6 border-l border-[--color-line] pl-6">
          {timeline.map((t, i) => (
            <li key={t.label} className="relative">
              <span
                className={`absolute -left-[31px] top-0.5 flex h-2.5 w-2.5 rounded-full ${
                  i === 0 ? "bg-sky-400" : i < 3 ? "bg-indigo-400" : "bg-zinc-600"
                }`}
              />
              <p className="text-sm font-semibold text-sky-200">{t.label}</p>
              <ul className="mt-1 space-y-1 text-sm text-[--color-dim]">
                {t.items.map((item) => (
                  <li key={item}>・{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="シミュレーション履歴">
        {!sims || sims.length === 0 ? (
          <Empty>まだシミュレーションはありません（実データ接続後に「月会費+1,000円なら？」等に回答予定）</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {sims.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <Badge tone="accent">{s.scenario_type}</Badge>
                {s.title}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
