import Link from "next/link";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { cardCls, inputCls, btnCls } from "@/components/ui";
import { INDUSTRIES, STATUSES, type IndustryKey, type StatusKey } from "@/lib/types";
import { createProspect, saveDirective } from "./actions";

export const dynamic = "force-dynamic";

type ProspectRow = {
  id: string;
  name: string;
  industry: string;
  city: string | null;
  status: string;
  score: number | null;
  demo_priority: number | null;
  next_contact_on: string | null;
  next_action: string | null;
  est_build_price: number | null;
  est_monthly_fee: number | null;
};

const FUNNEL: { label: string; keys: StatusKey[] }[] = [
  { label: "候補", keys: ["candidate", "unanalyzed"] },
  { label: "分析済み", keys: ["analyzing", "analyzed", "demo_candidate"] },
  { label: "デモ完成", keys: ["demo_in_progress", "demo_done", "ready"] },
  { label: "連絡中", keys: ["uncontacted", "contacted", "reception", "contact_confirming", "recontact"] },
  { label: "面談", keys: ["scheduling", "meeting_set", "met", "demo_revising"] },
  { label: "見積・検討", keys: ["quoting", "quoted", "considering"] },
  { label: "成約", keys: ["won", "transferred"] },
  { label: "失注・保留", keys: ["lost", "hold", "unreachable"] },
];

const statusColor = (st: string) =>
  ["won", "transferred"].includes(st)
    ? "text-(--color-ok)"
    : ["lost", "unreachable"].includes(st)
      ? "text-(--color-danger)"
      : ["demo_done", "ready", "meeting_set"].includes(st)
        ? "text-(--color-accent)"
        : "text-(--color-dim)";

export default async function HomePage() {
  const actor = await requireActor();
  const admin = createAdmin();

  const [{ data: prospects }, { data: demos }, { data: directives }] = await Promise.all([
    admin
      .from("dms_prospects")
      .select("id,name,industry,city,status,score,demo_priority,next_contact_on,next_action,est_build_price,est_monthly_fee")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("demo_priority", { ascending: true, nullsFirst: false })
      .order("score", { ascending: false, nullsFirst: false }),
    admin.from("dms_demos").select("prospect_id,token,status").is("deleted_at", null),
    admin
      .from("dms_activities")
      .select("content,created_at,created_by")
      .eq("kind", "directive")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const rows = (prospects ?? []) as ProspectRow[];
  const demoByProspect = new Map<string, string>();
  for (const d of demos ?? []) if (!demoByProspect.has(d.prospect_id)) demoByProspect.set(d.prospect_id, d.token);

  const count = (keys: StatusKey[]) => rows.filter((r) => keys.includes(r.status as StatusKey)).length;
  const won = rows.filter((r) => ["won", "transferred"].includes(r.status));
  const wonBuild = won.reduce((a, r) => a + (r.est_build_price ?? 0), 0);
  const wonMonthly = won.reduce((a, r) => a + (r.est_monthly_fee ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const todo = rows.filter(
    (r) =>
      (r.next_contact_on && r.next_contact_on <= today && !["won", "lost", "transferred"].includes(r.status)) ||
      r.status === "meeting_set" ||
      (["demo_done", "ready"].includes(r.status))
  );

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">YOZAN — WEB SALES COMMAND CENTER</p>
          <h1 className="text-2xl font-bold tracking-widest">AI DEMO SALES</h1>
          <p className="mt-1 text-sm text-(--color-dim)">営業先専用デモの高速生成 → 完成イメージを見せて営業する</p>
        </div>
        <form action="/api/logout" method="post">
          <button className="text-sm text-(--color-dim) hover:text-(--color-txt)">{actor.name} — ログアウト</button>
        </form>
      </header>

      {/* 営業指示（自然言語） */}
      <section className={`${cardCls} mb-6 border-(--color-accent)`}>
        <h2 className="mb-1 font-semibold">営業指示（自然言語）</h2>
        <p className="mb-3 text-xs text-(--color-dim)">
          例:「宝塚市の動物病院を30件調査して」「上位5件の営業用デモを作成して」— 指示は保存され、Claude（Cowork/GENESIS）が次のセッションで実行します。デモの個別修正は各営業先ページの生成フォームで即時反映できます。
        </p>
        <form action={saveDirective} className="flex gap-2">
          <input name="directive" placeholder="営業指示を入力…" className={inputCls} />
          <button className={btnCls}>保存</button>
        </form>
        {(directives ?? []).length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-(--color-dim)">
            {(directives ?? []).map((d, i) => (
              <li key={i}>
                📌 {d.content} <span className="opacity-60">（{d.created_by}・{String(d.created_at).slice(0, 10)}）</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ファネルKPI */}
      <section className="mb-6 grid grid-cols-4 gap-3 md:grid-cols-8">
        {FUNNEL.map((f) => (
          <div key={f.label} className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3 text-center">
            <div className="text-xl font-bold">{count(f.keys)}</div>
            <div className="text-xs text-(--color-dim)">{f.label}</div>
          </div>
        ))}
      </section>
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3 text-center">
          <div className="text-lg font-bold text-(--color-ok)">{wonBuild.toLocaleString()}円</div>
          <div className="text-xs text-(--color-dim)">成約 想定受注金額</div>
        </div>
        <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3 text-center">
          <div className="text-lg font-bold text-(--color-ok)">{wonMonthly.toLocaleString()}円/月</div>
          <div className="text-xs text-(--color-dim)">成約 想定月額保守</div>
        </div>
        <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3 text-center">
          <div className="text-lg font-bold">{rows.length}</div>
          <div className="text-xs text-(--color-dim)">営業候補 総数</div>
        </div>
        <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3 text-center">
          <div className="text-lg font-bold">{demoByProspect.size}</div>
          <div className="text-xs text-(--color-dim)">デモ作成済み</div>
        </div>
      </section>

      {/* 本日やるべき営業活動 */}
      {todo.length > 0 && (
        <section className={`${cardCls} mb-6`}>
          <h2 className="mb-3 font-semibold">本日の営業活動（連絡期限・面談予定・デモ完成済み未連絡）</h2>
          <ul className="space-y-2 text-sm">
            {todo.slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 border-b border-(--color-line) pb-2">
                <span>
                  <Link href={`/p/${r.id}`} className="font-medium text-(--color-accent) hover:underline">{r.name}</Link>
                  <span className="ml-2 text-xs text-(--color-dim)">{STATUSES[r.status as StatusKey] ?? r.status}</span>
                </span>
                <span className="text-xs text-(--color-dim)">{r.next_action ?? (r.status === "meeting_set" ? "面談準備" : "初回連絡する")}{r.next_contact_on ? `（期限 ${r.next_contact_on}）` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 営業先一覧 */}
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">営業先一覧（{rows.length}件）</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                <th className="py-2 pr-3">院名</th>
                <th className="py-2 pr-3">業種</th>
                <th className="py-2 pr-3">地域</th>
                <th className="py-2 pr-3">ステータス</th>
                <th className="py-2 pr-3">スコア</th>
                <th className="py-2 pr-3">デモ</th>
                <th className="py-2">次のアクション</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-(--color-line) last:border-0">
                  <td className="py-2 pr-3">
                    <Link href={`/p/${r.id}`} className="font-medium text-(--color-accent) hover:underline">{r.name}</Link>
                  </td>
                  <td className="py-2 pr-3">{INDUSTRIES[r.industry as IndustryKey] ?? r.industry}</td>
                  <td className="py-2 pr-3">{r.city ?? "—"}</td>
                  <td className={`py-2 pr-3 ${statusColor(r.status)}`}>{STATUSES[r.status as StatusKey] ?? r.status}</td>
                  <td className="py-2 pr-3">{r.score ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {demoByProspect.has(r.id) ? (
                      <a href={`/d/${demoByProspect.get(r.id)}`} target="_blank" className="text-(--color-ok) hover:underline">表示</a>
                    ) : (
                      <span className="text-(--color-dim)">未作成</span>
                    )}
                  </td>
                  <td className="py-2 text-xs text-(--color-dim)">{r.next_action ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 営業先の追加 */}
      <section className={`${cardCls} mt-6`}>
        <h2 className="mb-3 font-semibold">営業先を追加</h2>
        <form action={createProspect} className="grid gap-2 md:grid-cols-5">
          <input name="name" placeholder="院名（必須）" className={inputCls} required />
          <select name="industry" className={inputCls} defaultValue="naika">
            {Object.entries(INDUSTRIES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input name="city" placeholder="市区町村" className={inputCls} />
          <input name="website_url" placeholder="ホームページURL" className={inputCls} />
          <input name="gmap_url" placeholder="GoogleマップURL" className={inputCls} />
          <button className={`${btnCls} md:col-span-5 w-fit`}>追加して詳細へ</button>
        </form>
      </section>
    </main>
  );
}
