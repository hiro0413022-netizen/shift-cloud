import { requireCtx } from "@/lib/ctx";
import Link from "next/link";

function fmt(d) { return d ? String(d).slice(0, 10) : ""; }

export default async function BoardPage() {
  const { supa, projectId } = await requireCtx();

  const { data: stages } = await supa.from("pipeline_stages").select("*").eq("project_id", projectId).order("sort");
  const { data: leads } = await supa
    .from("leads")
    .select("id,title,status_note,expected_value,stage_id, companies(name), channels(name), app_users(name)")
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });

  const byStage = {};
  (stages || []).forEach((s) => (byStage[s.id] = []));
  (leads || []).forEach((l) => { if (byStage[l.stage_id]) byStage[l.stage_id].push(l); });

  return (
    <div>
      <div className="between mb">
        <h1>案件ボード</h1>
        <Link href="/inquiries/new" className="btn">＋ 問い合わせを登録</Link>
      </div>
      <div className="board">
        {(stages || []).map((s) => (
          <div key={s.id} className="col">
            <h3>
              <span>{s.name}{s.is_won ? " 🏆" : ""}</span>
              <span className="count">{byStage[s.id]?.length || 0}</span>
            </h3>
            {(byStage[s.id] || []).map((l) => (
              <Link key={l.id} href={`/leads/${l.id}`} className="lead-card" style={{ display: "block" }}>
                <div className="co">{l.companies?.name || l.title}</div>
                {l.status_note && <div className="meta">{l.status_note.slice(0, 50)}</div>}
                <div className="meta">
                  {l.channels?.name && <span className="chip" style={{ marginRight: 4 }}>{l.channels.name}</span>}
                  {l.app_users?.name || ""}
                </div>
              </Link>
            ))}
            {(byStage[s.id] || []).length === 0 && <div className="muted small" style={{ padding: 6 }}>なし</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
