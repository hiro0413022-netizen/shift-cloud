import { requireCtx } from "@/lib/ctx";
import Link from "next/link";
import StageSelect from "@/components/StageSelect";

export default async function ListPage({ searchParams }) {
  const { supa, projectId } = await requireCtx();
  const q = (searchParams?.q || "").trim();

  const [stagesRes, leadsRes] = await Promise.all([
    supa.from("pipeline_stages").select("*").eq("project_id", projectId).order("sort"),
    supa
      .from("leads")
      .select("id,stage_id, companies(name, rep_name, address, contacts(name, phone, email, sort)), channels(name), app_users(name)")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
  ]);
  const stages = stagesRes.data || [];
  let leads = leadsRes.data || [];

  // 検索（施設名・担当者・電話・メールを対象）
  if (q) {
    const key = q.toLowerCase();
    leads = leads.filter((l) => {
      const co = l.companies || {};
      const cs = co.contacts || [];
      const hay = [
        co.name, co.rep_name, co.address,
        ...cs.map((c) => c.name), ...cs.map((c) => c.phone), ...cs.map((c) => c.email),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(key);
    });
  }

  function firstContact(co) {
    const cs = (co?.contacts || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    return cs[0] || {};
  }

  return (
    <div>
      <div className="between mb">
        <h1>施設一覧（{leads.length}）</h1>
        <Link href="/inquiries/new" className="btn">＋ 問い合わせを登録</Link>
      </div>

      {/* 検索 */}
      <form method="get" action="/list" className="row mb" style={{ gap: 8, maxWidth: 520 }}>
        <input name="q" defaultValue={q} placeholder="施設名・担当者・電話番号で検索" />
        <button className="btn">検索</button>
        {q && <Link href="/list" className="btn ghost">クリア</Link>}
      </form>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>施設名</th><th>担当者</th><th>電話番号</th><th>経路</th>
              <th style={{ width: 150 }}>進捗</th><th>営業担当</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const co = l.companies || {};
              const c = firstContact(co);
              return (
                <tr key={l.id}>
                  <td><Link href={`/leads/${l.id}`}><b>{co.name || "—"}</b></Link></td>
                  <td>{c.name || co.rep_name || "—"}</td>
                  <td>{c.phone || "—"}</td>
                  <td>{l.channels?.name ? <span className="chip">{l.channels.name}</span> : "—"}</td>
                  <td><StageSelect leadId={l.id} stageId={l.stage_id} stages={stages} /></td>
                  <td className="muted small">{l.app_users?.name || "—"}</td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr><td colSpan={6} className="muted">該当する施設がありません{q ? "（検索条件を変えてみてください）" : ""}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="muted small mt">進捗はこの一覧のドロップダウンからその場で変更できます。施設名をクリックすると詳細（やりとり履歴・連絡先）が開きます。</p>
    </div>
  );
}
