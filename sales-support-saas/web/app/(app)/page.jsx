import { requireCtx } from "@/lib/ctx";
import Link from "next/link";
import { toggleTaskAction, addTaskAction } from "../actions";

function today() { return new Date().toISOString().slice(0, 10); }
function fmt(d) { return d ? String(d).slice(0, 10) : ""; }

export default async function HomePage() {
  const { supa, session, project, projectId } = await requireCtx();
  const t = today();

  // 段階（勝ち/負け判定用）
  const { data: stages } = await supa.from("pipeline_stages").select("*").eq("project_id", projectId).order("sort");
  const firstStageId = stages?.[0]?.id;
  // 「対応中」は先頭ステージ（DM送付済みなどの初期リスト）と、勝ち(導入)・負け(見送り)を除いた“進行中”のみ
  const openStageIds = (stages || []).filter((s) => !s.is_won && !s.is_lost && s.id !== firstStageId).map((s) => s.id);
  // 「新しい問い合わせ」は先頭ステージの次（問い合わせ）を表示。無ければ進行中の先頭
  const inquiryStageId = stages?.[1]?.id || openStageIds[0];

  // まとめて並列取得（レイテンシ削減）
  const monthStart = t.slice(0, 7) + "-01";
  const [tasksRes, newLeadsRes, activeRes, meetRes, custRes] = await Promise.all([
    supa.from("tasks").select("*, leads(id,title,company_id, companies(name))").eq("owner_id", session.uid).eq("is_done", false).order("due_date", { ascending: true, nullsFirst: false }),
    supa.from("leads").select("id,title,inquiry_date,status_note, companies(name), channels(name)").eq("project_id", projectId).eq("stage_id", inquiryStageId || "00000000-0000-0000-0000-000000000000").order("inquiry_date", { ascending: false }).limit(6),
    supa.from("leads").select("id", { count: "exact", head: true }).eq("project_id", projectId).in("stage_id", openStageIds.length ? openStageIds : ["x"]),
    supa.from("activities").select("id", { count: "exact", head: true }).eq("type", "visit").gte("occurred_at", monthStart),
    supa.from("customers").select("id", { count: "exact", head: true }).eq("project_id", projectId).gte("contract_date", monthStart),
  ]);
  const tasks = tasksRes.data;
  const newLeads = newLeadsRes.data;
  const activeLeads = activeRes.count;
  const monthMeetings = meetRes.count;
  const monthCustomers = custRes.count;

  const all = tasks || [];
  const overdue = all.filter((x) => x.due_date && x.due_date < t);
  const todayTasks = all.filter((x) => !x.due_date || x.due_date === t);
  const upcoming = all.filter((x) => x.due_date && x.due_date > t).slice(0, 8);

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 340px" }}>
      <div className="grid">
        <div className="between">
          <div>
            <h1>おはようございます、{session.name} さん</h1>
            <p className="muted small">{project?.name}／{t} の動き</p>
          </div>
          <Link href="/inquiries/new" className="btn">＋ 問い合わせを登録</Link>
        </div>

        {/* 数字 */}
        <div className="grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <div className="card stat"><span className="num">{activeLeads ?? 0}</span><span className="lbl">対応中の案件</span></div>
          <div className="card stat"><span className="num">{monthMeetings ?? 0}</span><span className="lbl">今月の商談（訪問）</span></div>
          <div className="card stat"><span className="num">{monthCustomers ?? 0}</span><span className="lbl">今月の導入</span></div>
        </div>

        {/* 期限超過 */}
        {overdue.length > 0 && (
          <div className="card" style={{ borderColor: "#f3c4c4" }}>
            <h2 style={{ color: "var(--red)" }}>⚠️ 期限が過ぎています（{overdue.length}）</h2>
            {overdue.map((x) => <TodoRow key={x.id} x={x} overdue />)}
          </div>
        )}

        {/* 今日のやること */}
        <div className="card">
          <div className="between mb">
            <h2 style={{ margin: 0 }}>✅ 今日のやること（{todayTasks.length}）</h2>
          </div>
          {todayTasks.length === 0 && <p className="muted small">今日のやることはありません。お疲れさまです。</p>}
          {todayTasks.map((x) => <TodoRow key={x.id} x={x} />)}

          {/* さっと追加 */}
          <form action={addTaskAction} className="row mt" style={{ gap: 8 }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input name="title" placeholder="やることを追加（例：〇〇に電話）" />
            <input name="due_date" type="date" defaultValue={t} style={{ width: 150 }} />
            <button className="btn sm">追加</button>
          </form>
        </div>
      </div>

      {/* 右カラム */}
      <div className="grid">
        <div className="card">
          <h2>📥 新しい問い合わせ</h2>
          {(newLeads || []).length === 0 && <p className="muted small">新規はありません</p>}
          {(newLeads || []).map((l) => (
            <Link key={l.id} href={`/leads/${l.id}`} className="todo" style={{ display: "block" }}>
              <div className="title">{l.companies?.name || l.title}</div>
              <div className="muted small">
                {l.channels?.name && <span className="chip" style={{ marginRight: 6 }}>{l.channels.name}</span>}
                {fmt(l.inquiry_date)}
              </div>
              {l.status_note && <div className="muted small">{l.status_note.slice(0, 40)}</div>}
            </Link>
          ))}
        </div>

        <div className="card">
          <h2>🔔 もうすぐの予定</h2>
          {upcoming.length === 0 && <p className="muted small">直近の予定はありません</p>}
          {upcoming.map((x) => (
            <div key={x.id} className="todo">
              <div className="body">
                <div className="title small">{x.title}</div>
                <div className="muted small">{fmt(x.due_date)}{x.leads?.companies?.name ? `・${x.leads.companies.name}` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TodoRow({ x, overdue }) {
  return (
    <div className={`todo ${overdue ? "overdue" : ""}`}>
      <form action={toggleTaskAction}>
        <input type="hidden" name="id" value={x.id} />
        <input type="hidden" name="done" value="true" />
        <button className="check-btn" title="完了にする" />
      </form>
      <div className="body">
        <div className="title">{x.title}</div>
        <div className="muted small">
          {x.due_date ? `期限 ${fmt(x.due_date)}` : "期限なし"}
          {x.leads?.companies?.name && (
            <> ・ <a href={`/leads/${x.leads.id}`}>{x.leads.companies.name}</a></>
          )}
        </div>
      </div>
    </div>
  );
}
