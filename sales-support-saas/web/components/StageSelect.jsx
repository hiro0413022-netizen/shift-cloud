"use client";
import { moveStageAction } from "../app/actions";

// 一覧からその場で進捗（段階）を変更するドロップダウン
export default function StageSelect({ leadId, stageId, stages }) {
  return (
    <form action={moveStageAction} style={{ margin: 0 }}>
      <input type="hidden" name="leadId" value={leadId} />
      <select
        name="stageId"
        defaultValue={stageId || ""}
        onChange={(e) => e.target.form.requestSubmit()}
        style={{ width: 130, padding: "4px 8px", fontSize: 12.5 }}
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <noscript><button className="btn sm ghost">変更</button></noscript>
    </form>
  );
}
