import { requireCtx } from "@/lib/ctx";
import Link from "next/link";
import StageSelect from "@/components/StageSelect";

export default async function ListPage({ searchParams }) {
  const { supa, projectId } = await requireCtx();
  const q = (searchParams?.q || "").trim();
  const sort = searchParams?.sort || "updated";
  const dir = searchParams?.dir === "desc" ? "desc" : "asc";

  const [stagesRes, leadsRes] = await Promise.all([
    supa.from("pipeline_stages").select("*").eq("project_id", projectId).order("sort"),
    supa
      .from("leads")
      .select("id,stage_id,updated_at, companies(name, rep_name, address, contacts(name, phone, email, sort)), channels(name), app_users(name)")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
  ]);
  const stages = stagesRes.data || [];
  const stageSort = {};
  stages.forEach((s) => (stageSort[s.id] = s.sort ?? 0));
  let leads = leadsRes.data || [];

  function firstContact(co) {
    const cs = (co?.contacts || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    return cs[0] || {};
  }

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

  // 並び替え
  function keyOf(l) {
    const co = l.companies || {};
    const c = firstContact(co);
    switch (sort) {
      case "name": return co.name || "";
      case "contact": return c.name || co.rep_name || "";
      case "phone": return c.phone || "";
      case "channel": return l.channels?.name || "";
      case "stage": return String(stageSort[l.stage_id] ?? 99).padStart(3, "0");
      case "owner": return l.app_users?.name || "";
      default: return l.updated_at || "";
    }
  }
  leads = leads.slice().sort((a, b) => {
    const r = String(keyOf(a)).localeCompare(String(keyOf(b)), "ja", { numeric: true });
    return dir === "desc" ? -r : r;
  });

  // ヘッダーのリンク（同じ列を押すと昇順/降順を切替）
  function qs(nextSort) {
    const nextDir = sort === nextSort && dir === "asc" ? "desc" : "asc";
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    p.set("sort", nextSort);
    p.set("dir", nextDir);
    return `/list?${p.toString()}`;
  }
  function arrow(col) {
    if (sort !== col) return "";
    return dir === "asc" ? " ▲" : " ▼";
  }
  const SortTh = ({ col, children, width }) => (
    <th style={width ? { width } : undefined}>
      <Link href={qs(col)}>{children}{arrow(col)}</Link>
    </th>
  );

  return (
    <div>
      <div className="between mb">
        <h1>施設一覧（{leads.length}）</h1>
        <Link href="/inquiries/new" className="btn">＋ 問い合わせを登録</Link>
      </div>

      {/* 検索 */}
      <form method="get" action="/list" className="row mb" style={{ gap: 8, maxWidth: 520 }}>
        <input name="q" defaultValue={q} placeholder="施設名・担当者・電話番号で検索" />
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <button className="btn">検索</button>
        {q && <Link href={`/list?sort=${sort}&dir=${dir}`} className="btn ghost">クリア</Link>}
      </form>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <SortTh col="name">施設名</SortTh>
              <SortTh col="contact">担当者</SortTh>
              <SortTh col="phone">電話番号</SortTh>
              <SortTh col="channel">経路</SortTh>
              <SortTh col="stage" width={150}>進捗</SortTh>
              <SortTh col="owner">営業担当</SortTh>
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
      <p className="muted small mt">列の見出しをクリックすると並び替え（もう一度で昇順⇔降順）。進捗はドロップダウンからその場で変更できます。施設名をクリックすると詳細（やりとり履歴・連絡先）が開きます。</p>
    </div>
  );
}
