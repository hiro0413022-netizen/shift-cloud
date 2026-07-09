import { requireCtx } from "@/lib/ctx";

function fmt(d) { return d ? String(d).slice(0, 10) : ""; }
const TYPE = { dm: "DM", telemarketing: "テレアポ", seminar: "セミナー", event: "イベント" };

export default async function CampaignsPage() {
  const { supa, projectId } = await requireCtx();
  const { data: campaigns } = await supa
    .from("campaigns").select("*").eq("project_id", projectId).order("run_date", { ascending: false });

  const rows = campaigns || [];
  // 各施策の対象件数
  const counts = {};
  for (const c of rows) {
    const { count } = await supa.from("campaign_targets").select("id", { count: "exact", head: true }).eq("campaign_id", c.id);
    counts[c.id] = count || 0;
  }

  return (
    <div>
      <h1 className="mb">集客の施策</h1>
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>施策名</th><th>種類</th><th>実施日</th><th>外注先</th><th>対象数</th><th>費用</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><b>{c.name}</b></td>
                <td><span className="chip">{TYPE[c.type] || c.type}</span></td>
                <td>{fmt(c.run_date)}</td>
                <td>{c.vendor || "—"}</td>
                <td>{counts[c.id]}件</td>
                <td>{c.cost ? `¥${Number(c.cost).toLocaleString()}` : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">施策はまだありません</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small mt">※ DM送付リストはここに「施策」として取り込まれます。宛名印刷用の書き出しは次フェーズで追加します。</p>
    </div>
  );
}
