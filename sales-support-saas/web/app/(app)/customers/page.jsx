import { requireCtx } from "@/lib/ctx";
import Link from "next/link";

export default async function CustomersPage() {
  const { supa, projectId } = await requireCtx();

  // 「導入」＝成約ステージのリードを正として表示（全情報つき）
  const { data: stages } = await supa.from("pipeline_stages").select("*").eq("project_id", projectId).order("sort");
  const wonIds = (stages || []).filter((s) => s.is_won).map((s) => s.id);

  const { data: leads } = await supa
    .from("leads")
    .select("id,title,status_note,inquiry_date, companies(name, address, rep_name, url, contacts(name, phone, email, role, sort)), channels(name), app_users(name)")
    .eq("project_id", projectId)
    .in("stage_id", wonIds.length ? wonIds : ["x"])
    .order("title");

  const rows = leads || [];
  function product(note) { return note && note.startsWith("契約先(WN)") ? "WN" : "PN"; }
  function contactsOf(co) { return (co?.contacts || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)); }

  const byService = rows.reduce((a, r) => { const k = product(r.status_note); a[k] = (a[k] || 0) + 1; return a; }, {});

  return (
    <div>
      <div className="between mb">
        <h1>導入先（{rows.length}）</h1>
        <div className="row">
          {Object.entries(byService).map(([k, v]) => <span key={k} className="chip green">{k}：{v}</span>)}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>施設名</th><th>商品</th><th>担当者</th><th>電話番号</th><th>メール</th><th>経路</th><th>所在地</th><th>メモ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const co = l.companies || {};
              const cs = contactsOf(co);
              const c = cs[0] || {};
              return (
                <tr key={l.id}>
                  <td><Link href={`/leads/${l.id}`}><b>{co.name || l.title}</b></Link></td>
                  <td><span className="chip green">{product(l.status_note)}</span></td>
                  <td>
                    {c.name || co.rep_name || "—"}
                    {cs.length > 1 && <span className="muted small">（他{cs.length - 1}名）</span>}
                    {c.role && <div className="muted small">{c.role}</div>}
                  </td>
                  <td>{c.phone || "—"}</td>
                  <td className="small">{c.email || "—"}</td>
                  <td>{l.channels?.name ? <span className="chip">{l.channels.name}</span> : "—"}</td>
                  <td className="muted small">{co.address || "—"}</td>
                  <td className="muted small">{l.status_note || ""}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="muted">導入先はまだありません</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small mt">施設名をクリックすると、その導入先の全情報（連絡先すべて・やりとり履歴・やること）が開きます。</p>
    </div>
  );
}
