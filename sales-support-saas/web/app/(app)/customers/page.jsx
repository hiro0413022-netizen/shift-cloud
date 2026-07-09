import { requireCtx } from "@/lib/ctx";

function fmt(d) { return d ? String(d).slice(0, 10) : ""; }

export default async function CustomersPage() {
  const { supa, projectId } = await requireCtx();
  const { data: customers } = await supa
    .from("customers")
    .select("*, companies(name, address), channels(name)")
    .eq("project_id", projectId)
    .order("contract_date", { ascending: false });

  const rows = customers || [];
  const byService = rows.reduce((a, r) => { const k = r.service_type || "その他"; a[k] = (a[k] || 0) + 1; return a; }, {});

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
          <thead><tr><th>会社名</th><th>商品</th><th>経路</th><th>契約日</th><th>所在地</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><b>{c.companies?.name || "—"}</b></td>
                <td>{c.service_type || "—"}</td>
                <td>{c.channels?.name || "—"}</td>
                <td>{fmt(c.contract_date)}</td>
                <td className="muted small">{c.companies?.address || ""}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">導入先はまだありません</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
