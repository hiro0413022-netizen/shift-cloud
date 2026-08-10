import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, inputCls } from "@/components/ui";
import {
  incidentCategoryLabel,
  INCIDENT_SEVERITY_LABEL,
  normalizeSeverity,
  countByCategory,
} from "@yozan/core/incidents";
import { InsightCard } from "./insight-card";
import { AnalyzeButton } from "./analyze-button";

export const dynamic = "force-dynamic";

/**
 * イレギュラー分析（DECISIONS #125）
 * スタッフが上げた報告（sp_incidents）を集計し、AIが見つけた繰り返しパターンと
 * 再発防止策（sp_incident_insights）を進めるための画面。
 */
export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const days = [30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 90;
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const [{ data: incidents }, { data: insights }, { data: stores }] = await Promise.all([
    admin
      .from("sp_incidents")
      .select("id, category, severity, occurred_at, place, involved, body, action_taken, status, store_id, staff:staff_id(name), stores:store_id(name)")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(200),
    admin
      .from("sp_incident_insights")
      .select("id, title, pattern, cause, prevention, categories, incident_count, status, status_note, generated_by, store_id, created_at, stores:store_id(name)")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("stores").select("id, name").eq("company_id", actor.companyId),
  ]);

  const rows = incidents ?? [];
  const list = insights ?? [];
  const openInsights = list.filter((i) => i.status === "open" || i.status === "doing");
  const doneInsights = list.filter((i) => i.status === "done" || i.status === "dismissed");

  const byCategory = countByCategory(rows.map((r) => ({ category: String(r.category) })));
  const maxCat = byCategory[0]?.count ?? 1;
  const openCount = rows.filter((r) => r.status === "open").length;
  const highCount = rows.filter((r) => normalizeSeverity(String(r.severity)) === "high").length;

  // 店舗別（どの店で起きているか）
  const storeMap = new Map((stores ?? []).map((s) => [String(s.id), String(s.name)]));
  const byStore = [...rows.reduce((m, r) => {
    const key = r.store_id ? String(r.store_id) : "unknown";
    m.set(key, (m.get(key) ?? 0) + 1);
    return m;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  // 月別の推移（増えているのか減っているのか）
  const byMonth = [...rows.reduce((m, r) => {
    const ym = new Date(r.occurred_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7);
    m.set(ym, (m.get(ym) ?? 0) + 1);
    return m;
  }, new Map<string, number>())].sort((a, b) => a[0].localeCompare(b[0]));
  const maxMonth = Math.max(1, ...byMonth.map(([, c]) => c));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">イレギュラー分析</h1>
        <div className="flex items-center gap-2">
          <form className="flex items-center gap-2">
            <select name="days" defaultValue={String(days)} className={`${inputCls} !w-auto !py-1 text-xs`}>
              <option value="30">直近30日</option>
              <option value="90">直近90日</option>
              <option value="365">直近1年</option>
            </select>
            <button type="submit" className="text-xs text-(--color-dim) underline">表示</button>
          </form>
          <AnalyzeButton />
        </div>
      </div>
      <p className="mb-6 text-sm text-(--color-dim)">
        店舗スタッフが上げた「いつもと違うこと」の記録と、同じことを繰り返さないための対策です。
      </p>

      {/* サマリー */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "報告", value: rows.length, hint: `直近${days}日` },
          { label: "未対応", value: openCount, hint: "決着していない件数" },
          { label: "重大", value: highCount, hint: "severity=重大" },
          { label: "対策中", value: openInsights.length, hint: "再発防止策" },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-(--color-line) bg-(--color-panel) p-4">
            <p className="text-xs text-(--color-dim)">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
            <p className="mt-0.5 text-[10px] text-(--color-dim)">{c.hint}</p>
          </div>
        ))}
      </div>

      {/* 再発防止策（本題） */}
      <Panel title="再発防止策（AIの分析）">
        {list.length === 0 ? (
          <Empty>
            {rows.length === 0
              ? "報告がまだありません。スタッフアプリの「報告」タブから上がってきます。"
              : "分析はまだ実行されていません。右上の「今すぐ分析」を押すか、翌朝6時の自動実行を待ってください。"}
          </Empty>
        ) : (
          <div className="space-y-3">
            {openInsights.map((i) => (
              <InsightCard
                key={i.id}
                insight={{
                  id: String(i.id),
                  title: String(i.title),
                  pattern: String(i.pattern),
                  cause: i.cause as string | null,
                  prevention: String(i.prevention),
                  categories: (i.categories as string[]) ?? [],
                  incident_count: Number(i.incident_count),
                  status: String(i.status),
                  status_note: i.status_note as string | null,
                  generated_by: String(i.generated_by),
                  store_name: (i.stores as unknown as { name: string } | null)?.name ?? null,
                  created_at: String(i.created_at),
                }}
              />
            ))}
            {doneInsights.length > 0 && (
              <details className="rounded-lg border border-(--color-line) p-3">
                <summary className="cursor-pointer text-xs text-(--color-dim)">
                  完了・見送り（{doneInsights.length}件）
                </summary>
                <div className="mt-3 space-y-3">
                  {doneInsights.map((i) => (
                    <InsightCard
                      key={i.id}
                      insight={{
                        id: String(i.id),
                        title: String(i.title),
                        pattern: String(i.pattern),
                        cause: i.cause as string | null,
                        prevention: String(i.prevention),
                        categories: (i.categories as string[]) ?? [],
                        incident_count: Number(i.incident_count),
                        status: String(i.status),
                        status_note: i.status_note as string | null,
                        generated_by: String(i.generated_by),
                        store_name: (i.stores as unknown as { name: string } | null)?.name ?? null,
                        created_at: String(i.created_at),
                      }}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </Panel>

      {/* 内訳 */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel title="カテゴリー別">
          {byCategory.length === 0 ? (
            <Empty>データなし</Empty>
          ) : (
            <div className="space-y-2">
              {byCategory.map((c) => (
                <div key={c.cat} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-xs">{c.label}</span>
                  <div className="h-2 flex-1 rounded-full bg-(--color-line)">
                    <div className="h-2 rounded-full bg-(--color-accent)" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums">{c.count}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="月別の件数">
          {byMonth.length === 0 ? (
            <Empty>データなし</Empty>
          ) : (
            <div className="space-y-2">
              {byMonth.map(([ym, count]) => (
                <div key={ym} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs tabular-nums">{ym}</span>
                  <div className="h-2 flex-1 rounded-full bg-(--color-line)">
                    <div className="h-2 rounded-full bg-(--color-gold)" style={{ width: `${(count / maxMonth) * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums">{count}</span>
                </div>
              ))}
              <p className="pt-1 text-[10px] text-(--color-dim)">
                件数が増えていても、報告する習慣が根づいた結果のことがあります。中身で判断してください。
              </p>
            </div>
          )}
        </Panel>
      </div>

      {byStore.length > 1 && (
        <Panel title="店舗別" className="mt-4">
          <div className="flex flex-wrap gap-3 text-sm">
            {byStore.map(([id, count]) => (
              <span key={id} className="rounded-lg border border-(--color-line) px-3 py-1.5">
                {storeMap.get(id) ?? "店舗未設定"} <span className="ml-1 font-semibold tabular-nums">{count}</span>
              </span>
            ))}
          </div>
        </Panel>
      )}

      {/* 生の報告 */}
      <Panel title={`報告一覧（${rows.length}件）`} className="mt-6">
        {rows.length === 0 ? (
          <Empty>報告がまだありません</Empty>
        ) : (
          <div className="space-y-2">
            {rows.slice(0, 60).map((r) => {
              const sev = normalizeSeverity(String(r.severity));
              return (
                <div key={r.id} className="rounded-lg border border-(--color-line) p-3">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-(--color-dim)">
                    <Badge tone={sev === "high" ? "danger" : sev === "mid" ? "warn" : "default"}>
                      {INCIDENT_SEVERITY_LABEL[sev]}
                    </Badge>
                    <Badge tone="accent">{incidentCategoryLabel(String(r.category))}</Badge>
                    {r.status === "resolved" && <Badge tone="ok">対応済み</Badge>}
                    <span>
                      {new Date(r.occurred_at).toLocaleString("ja-JP", {
                        timeZone: "Asia/Tokyo",
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>{(r.stores as unknown as { name: string } | null)?.name}</span>
                    {r.place && <span>/ {r.place}</span>}
                    <span className="ml-auto">{(r.staff as unknown as { name: string } | null)?.name}</span>
                  </div>
                  {r.involved && <p className="mt-1 text-xs text-(--color-dim)">対象: {r.involved}</p>}
                  <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>
                  {r.action_taken && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-(--color-dim)">対応: {r.action_taken}</p>
                  )}
                </div>
              );
            })}
            {rows.length > 60 && (
              <p className="pt-1 text-xs text-(--color-dim)">…ほか {rows.length - 60} 件（期間を絞ると全部見られます）</p>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
