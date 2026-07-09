import { requireCtx } from "@/lib/ctx";
import { notFound } from "next/navigation";
import Link from "next/link";
import { addActivityAction, moveStageAction, addTaskAction } from "../../../actions";

function fmt(d) { return d ? String(d).slice(0, 16).replace("T", " ") : ""; }
function today() { return new Date().toISOString().slice(0, 10); }

const TYPE_LABEL = { call: "電話", mail: "メール", visit: "訪問", web: "Web", note: "メモ" };

export default async function LeadPage({ params }) {
  const { supa, projectId } = await requireCtx();
  const { id } = params;

  const { data: lead } = await supa
    .from("leads")
    .select("*, companies(*), channels(name), pipeline_stages(name), app_users(name)")
    .eq("id", id)
    .maybeSingle();
  if (!lead) notFound();

  const { data: contacts } = await supa.from("contacts").select("*").eq("company_id", lead.company_id).order("sort");
  const { data: stages } = await supa.from("pipeline_stages").select("*").eq("project_id", projectId).order("sort");
  const { data: acts } = await supa.from("activities").select("*, app_users(name)").eq("lead_id", id).order("occurred_at", { ascending: false });
  const { data: tasks } = await supa.from("tasks").select("*").eq("lead_id", id).eq("is_done", false).order("due_date");
  const { data: monitors } = await supa.from("monitors").select("*").eq("lead_id", id).order("created_at", { ascending: false });

  const co = lead.companies || {};

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 340px" }}>
      {/* 左：相手＋履歴 */}
      <div className="grid">
        <div>
          <Link href="/board" className="muted small">← 案件ボード</Link>
          <h1 className="mt">{co.name || lead.title}</h1>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="chip blue">{lead.pipeline_stages?.name || "未設定"}</span>
            {lead.channels?.name && <span className="chip">{lead.channels.name}</span>}
            <span className="muted small">担当：{lead.app_users?.name || "—"}／問合せ日 {String(lead.inquiry_date || "").slice(0, 10)}</span>
          </div>
        </div>

        {/* 段階変更 */}
        <div className="card">
          <h3>段階を進める</h3>
          <form action={moveStageAction} className="row" style={{ gap: 8 }}>
            <input type="hidden" name="leadId" value={lead.id} />
            <select name="stageId" defaultValue={lead.stage_id || ""}>
              {(stages || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn sm">更新</button>
          </form>
        </div>

        {/* やりとり記録 */}
        <div className="card">
          <h2>やりとりを記録</h2>
          <form action={addActivityAction}>
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="projectId" value={projectId} />
            <div className="row" style={{ gap: 8 }}>
              <select name="type" style={{ width: 120 }} defaultValue="call">
                <option value="call">電話</option>
                <option value="mail">メール</option>
                <option value="visit">訪問</option>
                <option value="web">Web商談</option>
                <option value="note">メモ</option>
              </select>
              <input name="body" placeholder="内容（例：モニター検討中。来週再連絡）" />
            </div>
            <div className="cols2 mt">
              <div>
                <label>次にやること（任意）</label>
                <input name="next_title" placeholder="例：再連絡する" />
              </div>
              <div>
                <label>その期限</label>
                <input name="next_due" type="date" />
              </div>
            </div>
            <button className="btn mt">記録する</button>
          </form>
        </div>

        {/* 履歴タイムライン */}
        <div className="card">
          <h2>やりとり履歴</h2>
          {(acts || []).length === 0 && <p className="muted small">まだ記録がありません</p>}
          <div className="timeline">
            {(acts || []).map((a) => (
              <div key={a.id} className="tl-item">
                <div><span className="chip" style={{ marginRight: 6 }}>{TYPE_LABEL[a.type] || a.type}</span>{a.body}</div>
                <div className="muted small">{fmt(a.occurred_at)}・{a.app_users?.name || ""}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右：連絡先・やること・モニター */}
      <div className="grid">
        <div className="card">
          <h3>連絡先</h3>
          {co.address && <div className="small">📍 {co.address}</div>}
          {co.url && <div className="small">🔗 <a href={co.url} target="_blank">{co.url}</a></div>}
          {(contacts || []).map((c) => (
            <div key={c.id} className="mt small">
              <b>{c.name || "—"}</b> {c.role && <span className="muted">（{c.role}）</span>}<br />
              {c.phone && <>📞 {c.phone}<br /></>}
              {c.email && <>✉️ {c.email}</>}
            </div>
          ))}
          {(contacts || []).length === 0 && <p className="muted small">連絡先未登録</p>}
        </div>

        <div className="card">
          <h3>この案件のやること</h3>
          {(tasks || []).map((t) => (
            <div key={t.id} className="small" style={{ padding: "3px 0" }}>◻ {t.title} <span className="muted">{String(t.due_date || "").slice(0, 10)}</span></div>
          ))}
          {(tasks || []).length === 0 && <p className="muted small">なし</p>}
          <form action={addTaskAction} className="mt">
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="projectId" value={projectId} />
            <input name="title" placeholder="やることを追加" />
            <div className="row mt" style={{ gap: 6 }}>
              <input name="due_date" type="date" defaultValue={today()} />
              <button className="btn sm">追加</button>
            </div>
          </form>
        </div>

        {(monitors || []).length > 0 && (
          <div className="card">
            <h3>モニター</h3>
            {monitors.map((m) => (
              <div key={m.id} className="small">ID: {m.monitor_code || "—"}／{m.price_type || ""}／{m.status}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
