"use client";

import { useState } from "react";
import { Badge, inputCls, btnCls, btnGhostCls, fmtDate } from "@/components/ui";
import { approveSuggestionAndIssueCampaign, dismissSuggestion, draftStepsForSuggestion } from "./actions";

type Person = { id: string; name: string };
type SuggestionView = {
  id: string;
  kind: string;
  kindLabel: string;
  severity: string;
  sevLabel: string;
  sevTone: "danger" | "warn" | "default";
  title: string;
  body: string | null;
  suggested_action: string | null;
  impact: string | null;
  effort: string | null;
  source: string | null;
  created_at: string;
};

type Step = {
  title: string;
  detail: string;
  target_kind: "staff" | "ai_agent";
  staff_id: string;
  agent_id: string;
  due_date: string;
};

const emptyStep = (): Step => ({ title: "", detail: "", target_kind: "staff", staff_id: "", agent_id: "", due_date: "" });

export function SuggestionCard({ s, staff, agents }: { s: SuggestionView; staff: Person[]; agents: Person[] }) {
  const [title, setTitle] = useState(s.title);
  const [body, setBody] = useState(s.body ?? "");
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<"claude" | "rules" | null>(null);
  const [open, setOpen] = useState(false);

  const borderTone =
    s.severity === "critical" ? "border-red-700/50" : s.severity === "warning" ? "border-amber-700/40" : "border-(--color-line)";

  function patch(i: number, key: keyof Step, val: string) {
    setSteps((prev) => prev.map((st, idx) => (idx === i ? { ...st, [key]: val } : st)));
  }
  function move(i: number, dir: -1 | 1) {
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function remove(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function aiDraft() {
    setBusy(true);
    try {
      const res = await draftStepsForSuggestion(s.id);
      setSteps(
        res.steps.map((d) => ({
          title: d.title,
          detail: d.detail ?? "",
          target_kind: d.target_kind,
          staff_id: d.staff_id ?? "",
          agent_id: d.agent_id ?? "",
          due_date: "",
        }))
      );
      setEngine(res.engine);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  const canIssue = title.trim().length > 0 && steps.some((st) => st.title.trim());

  return (
    <li className={`rounded-xl border bg-(--color-panel) p-4 ${borderTone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={s.sevTone}>{s.sevLabel}</Badge>
        <Badge tone="accent">{s.kindLabel}</Badge>
        {s.source === "claude" && <Badge tone="gold">AI発案</Badge>}
        <span className="ml-auto text-xs text-(--color-dim)">{fmtDate(s.created_at)}</span>
      </div>

      {/* 文面編集（タイトル・背景） */}
      <label className="mt-2 block text-[11px] text-(--color-dim)">施策名（編集できます）</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={`${inputCls} text-base font-bold`}
      />
      <label className="mt-2 block text-[11px] text-(--color-dim)">背景・ねらい（編集できます）</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className={`${inputCls} font-normal`} />

      {s.suggested_action && !open && (
        <div className="mt-2 rounded-lg border border-sky-800/40 bg-(--color-panel-2) p-3 text-sm">
          <p className="mb-1 text-xs text-sky-300">AIが出した実行手順（下のボタンで工程に分解できます）</p>
          <p className="whitespace-pre-wrap text-(--color-dim)">{s.suggested_action}</p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-(--color-dim)">
        {s.impact && <span>効果: {s.impact}</span>}
        {s.effort && <span>手間: {s.effort}</span>}
      </div>

      {/* 工程エディタ */}
      <div className="mt-3 border-t border-(--color-line) pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-(--color-txt)">工程（誰が・何を・どの順で）</span>
          {engine && (
            <span className="text-[11px] text-(--color-dim)">
              {engine === "claude" ? "AIが下書きしました。修正してください" : "手順から自動分割しました。担当を選んでください"}
            </span>
          )}
          <button type="button" onClick={aiDraft} disabled={busy} className={`${btnGhostCls} ml-auto`}>
            {busy ? "AIが工程を作成中…" : "AIに工程を下書きさせる"}
          </button>
        </div>

        {steps.length === 0 ? (
          <p className="py-3 text-center text-xs text-(--color-dim)">
            「AIに工程を下書きさせる」を押すか、［＋工程を追加］で手動で組み立てます
          </p>
        ) : (
          <ol className="space-y-2">
            {steps.map((st, i) => (
              <li key={i} className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 w-5 shrink-0 text-center text-xs font-bold text-sky-300">{i + 1}</span>
                  <div className="flex-1 space-y-2">
                    <input
                      value={st.title}
                      onChange={(e) => patch(i, "title", e.target.value)}
                      placeholder="この工程でやること（例: 体験レッスンの告知動画を撮影）"
                      className={inputCls}
                    />
                    <textarea
                      value={st.detail}
                      onChange={(e) => patch(i, "detail", e.target.value)}
                      placeholder="やり方・台本・補足（例: 縦型15秒／台本『初めての方へ…』／店内で明るく）"
                      rows={2}
                      className={`${inputCls} font-normal`}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={st.target_kind} onChange={(e) => patch(i, "target_kind", e.target.value)} className={inputCls} style={{ width: "auto" }}>
                        <option value="staff">担当: スタッフ</option>
                        <option value="ai_agent">担当: AI社員</option>
                      </select>
                      {st.target_kind === "staff" ? (
                        <select value={st.staff_id} onChange={(e) => patch(i, "staff_id", e.target.value)} className={inputCls} style={{ width: "auto" }}>
                          <option value="">— 誰が</option>
                          {staff.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select value={st.agent_id} onChange={(e) => patch(i, "agent_id", e.target.value)} className={inputCls} style={{ width: "auto" }}>
                          <option value="">— どのAI社員</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <input type="date" value={st.due_date} onChange={(e) => patch(i, "due_date", e.target.value)} className={inputCls} style={{ width: "auto" }} />
                      <span className="ml-auto flex gap-1">
                        <button type="button" onClick={() => move(i, -1)} className={btnGhostCls} aria-label="上へ">↑</button>
                        <button type="button" onClick={() => move(i, 1)} className={btnGhostCls} aria-label="下へ">↓</button>
                        <button type="button" onClick={() => remove(i)} className={btnGhostCls} aria-label="削除">✕</button>
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <button type="button" onClick={() => setSteps((p) => [...p, emptyStep()])} className={`${btnGhostCls} mt-2`}>
          ＋工程を追加
        </button>
      </div>

      {/* 発行 */}
      <form action={approveSuggestionAndIssueCampaign} className="mt-3 flex flex-wrap items-center gap-2 border-t border-(--color-line) pt-3">
        <input type="hidden" name="id" value={s.id} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="body" value={body} />
        <input type="hidden" name="steps" value={JSON.stringify(steps)} />
        <button className={btnCls} disabled={!canIssue}>
          この工程で指示を出す（{steps.filter((st) => st.title.trim()).length}工程を配る）
        </button>
        <button className={btnGhostCls} formAction={dismissSuggestion}>
          却下
        </button>
        {!canIssue && <span className="text-[11px] text-(--color-dim)">※ 施策名と工程を1つ以上入れると発行できます</span>}
      </form>
    </li>
  );
}
