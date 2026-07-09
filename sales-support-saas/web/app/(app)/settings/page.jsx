import { requireCtx } from "@/lib/ctx";
import { addStageAction, addChannelAction, addFieldAction, addProjectAction } from "../../actions";

const CAT = { inbound: "反響", outbound: "アウトバウンド", event: "イベント", referral: "紹介" };
const FTYPE = { text: "文字", number: "数字", select: "選択", date: "日付", bool: "はい/いいえ" };

export default async function SettingsPage() {
  const { supa, projectId, project, projects } = await requireCtx();
  const { data: stages } = await supa.from("pipeline_stages").select("*").eq("project_id", projectId).order("sort");
  const { data: channels } = await supa.from("channels").select("*").eq("project_id", projectId).order("sort");
  const { data: fields } = await supa.from("custom_field_defs").select("*").eq("project_id", projectId).order("sort");

  return (
    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="grid">
        <div className="card">
          <h2>商品（プロジェクト）</h2>
          <p className="muted small">商品ごとに営業のやり方を分けられます。いま編集中：<b>{project?.name}</b></p>
          <table>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}><td><b>{p.name}</b> {p.code && <span className="muted small">/ {p.code}</span>}</td><td>{p.id === projectId ? <span className="chip blue">編集中</span> : ""}</td></tr>
              ))}
            </tbody>
          </table>
          <form action={addProjectAction} className="mt">
            <div className="row" style={{ gap: 8 }}>
              <input name="name" placeholder="新しい商品名（例：HP作成）" />
              <input name="code" placeholder="コード" style={{ width: 110 }} />
              <button className="btn sm">追加</button>
            </div>
            <p className="muted small mt">追加すると「問い合わせ→商談→モニター→導入」の初期段階が自動で入ります。</p>
          </form>
        </div>

        <div className="card">
          <h2>パイプライン段階</h2>
          <p className="muted small">案件が進む順番。ボードの列になります。</p>
          <table><tbody>
            {(stages || []).map((s) => (
              <tr key={s.id}><td>{s.sort}. <b>{s.name}</b></td><td>{s.is_won && <span className="chip green">成約</span>} {s.is_lost && <span className="chip red">失注</span>}</td></tr>
            ))}
          </tbody></table>
          <form action={addStageAction} className="mt row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input name="name" placeholder="段階名（例：保留）" style={{ flex: 1 }} />
            <label className="row small" style={{ margin: 0, gap: 4 }}><input type="checkbox" name="is_won" style={{ width: "auto" }} />成約</label>
            <label className="row small" style={{ margin: 0, gap: 4 }}><input type="checkbox" name="is_lost" style={{ width: "auto" }} />失注</label>
            <button className="btn sm">追加</button>
          </form>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>経路（集客チャネル）</h2>
          <p className="muted small">問い合わせ登録時に選ぶ選択肢。表記ゆれを防ぎます。</p>
          <table><tbody>
            {(channels || []).map((c) => (
              <tr key={c.id}><td><b>{c.name}</b></td><td><span className="chip">{CAT[c.category] || c.category}</span> {!c.is_active && <span className="chip red">停止</span>}</td></tr>
            ))}
          </tbody></table>
          <form action={addChannelAction} className="mt row" style={{ gap: 8 }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input name="name" placeholder="経路名（例：Instagram）" style={{ flex: 1 }} />
            <select name="category" style={{ width: 140 }}>
              <option value="inbound">反響</option>
              <option value="outbound">アウトバウンド</option>
              <option value="event">イベント</option>
              <option value="referral">紹介</option>
            </select>
            <button className="btn sm">追加</button>
          </form>
        </div>

        <div className="card">
          <h2>入力項目（カスタム）</h2>
          <p className="muted small">商品ごとに独自の入力欄を足せます（例：モニターID、公開希望日）。</p>
          <table><tbody>
            {(fields || []).map((f) => (
              <tr key={f.id}><td><b>{f.label}</b> <span className="muted small">{f.key}</span></td><td><span className="chip">{FTYPE[f.type] || f.type}</span></td></tr>
            ))}
            {(fields || []).length === 0 && <tr><td className="muted small">まだありません</td></tr>}
          </tbody></table>
          <form action={addFieldAction} className="mt">
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input type="hidden" name="projectId" value={projectId} />
              <input name="label" placeholder="表示名（例：モニターID）" style={{ flex: 1 }} />
              <input name="key" placeholder="key（英数）" style={{ width: 120 }} />
              <select name="type" style={{ width: 110 }}>
                <option value="text">文字</option>
                <option value="number">数字</option>
                <option value="select">選択</option>
                <option value="date">日付</option>
                <option value="bool">はい/いいえ</option>
              </select>
              <button className="btn sm">追加</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
