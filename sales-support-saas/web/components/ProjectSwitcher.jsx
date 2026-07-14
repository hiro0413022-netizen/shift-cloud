"use client";
import { switchProjectAction } from "../app/actions";

export default function ProjectSwitcher({ projects, current }) {
  return (
    <form action={switchProjectAction} className="row">
      <span className="muted small">商品：</span>
      <select
        name="projectId"
        defaultValue={current || ""}
        onChange={(e) => e.target.form.requestSubmit()}
        style={{ width: 200 }}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <noscript><button className="btn sm ghost">切替</button></noscript>
    </form>
  );
}
