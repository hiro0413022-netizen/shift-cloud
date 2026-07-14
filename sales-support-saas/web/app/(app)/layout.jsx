import { requireCtx } from "@/lib/ctx";
import Nav from "@/components/Nav";
import ProjectSwitcher from "@/components/ProjectSwitcher";
import { logoutAction } from "../actions";

export default async function AppLayout({ children }) {
  const { session, projects, project } = await requireCtx();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Sales OS
          <small>{session.tenantName}</small>
        </div>
        <Nav />
        <div className="side-foot">
          {session.name}<br />
          <form action={logoutAction}><button className="btn ghost sm mt" style={{ width: "100%" }}>ログアウト</button></form>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <ProjectSwitcher projects={projects} current={project?.id} />
          <div className="grow" />
          <span className="chip blue">{session.role}</span>
        </div>
        <div className="content">
          {project ? children : (
            <div className="card">商品が未登録です。<a href="/settings">設定</a>から商品を追加してください。</div>
          )}
        </div>
      </div>
    </div>
  );
}
