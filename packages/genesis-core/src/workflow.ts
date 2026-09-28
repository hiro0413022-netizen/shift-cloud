/**
 * Workflow（P3-c・#298）— 「イベントが起きたら、この手順（Plan）を走らせる」の宣言。
 *
 *   trigger: gn_events の type@version（＋ payload の条件）
 *   steps:   Skill と同じ SkillStepDef[]（Tool 参照は固定版で書く）
 *
 * 実行は Skill と同じ runPlan → 各 Step は executeTool を通る＝Policy・rateLimit・記録は Step ごと。
 * 起点が人でない（AI Actor・代理元なし）ので risk>=2 の Step は承認待ちになる＝Workflow が勝手に送らない。
 * 宣言はコード（この配列）に置く: git で差分が見え、テストで「参照 Tool が全部ある」を固定できる。
 * DB に置くのは P4（画面から編集）で、そのときもこの形をそのまま行にする。
 */
import type { SkillStepDef } from "./skill.ts";

export type EventRow = { id: string; company_id: string; store_id: string | null; type: string; schema_version: number; entity_kind: string | null; entity_id: string | null; payload: Record<string, unknown>; occurred_at: string };

export type WorkflowContract = {
  name: string; // 'wf.inquiry_replied_waiting'
  version: number;
  description: string;
  trigger: { type: string; version: number; when?: (payload: Record<string, unknown>, event: EventRow) => boolean };
  steps: (event: EventRow) => SkillStepDef[];
  enabled: boolean;
};

export function defineWorkflow(w: WorkflowContract): WorkflowContract {
  return w;
}

const s = (v: unknown, fallback = ""): string => (v == null ? fallback : String(v));

/** P3-c の初期 Workflow。EVENT_HANDLERS（直接 insert）から Tool 経由へ置き換えたもの */
export const WORKFLOWS: WorkflowContract[] = [
  defineWorkflow({
    name: "wf.inquiry_replied_waiting",
    version: 1,
    description: "問い合わせに返信したら「返事待ち」を3日で立てる（返事が来たら inquiry.received の handler が閉じる）",
    trigger: { type: "inquiry.replied", version: 1 },
    steps: (e) => [
      { key: "wait", title: "返事待ちを登録", tool: "waiting.create@1", input: { who: s(e.payload.from, "お客様"), what: "返信への返事", days: 3, entity_kind: "inquiry", entity_id: s(e.entity_id) } },
    ],
    enabled: true,
  }),
  defineWorkflow({
    name: "wf.trial_followup_waiting",
    version: 1,
    description: "体験が受付台帳に載ったら「体験後のフォロー」待ちを3日で立てる（3日過ぎると Inbox に「そろそろフォローしますか？」）",
    trigger: { type: "visit.recorded", version: 1, when: (p) => s(p.visit_type) === "trial" },
    steps: (e) => [
      { key: "wait", title: "体験後フォローの待ちを登録", tool: "waiting.create@1", input: { who: s(e.payload.guest, "体験のお客様"), what: "体験後のフォロー", days: 3, entity_kind: "person", entity_id: s(e.entity_id) } },
    ],
    enabled: true,
  }),
];

export function matchWorkflows(event: EventRow, list: WorkflowContract[] = WORKFLOWS): WorkflowContract[] {
  return list.filter((w) => w.enabled && w.trigger.type === event.type && w.trigger.version === Number(event.schema_version ?? 1) && (!w.trigger.when || safeWhen(w, event)));
}

function safeWhen(w: WorkflowContract, e: EventRow): boolean {
  try {
    return !!w.trigger.when!(e.payload ?? {}, e);
  } catch {
    return false;
  }
}

/** 宣言の静的検証: 参照する Tool が Registry にあるか。テストと起動時に使う */
export function validateWorkflows(list: WorkflowContract[], has: (ref: string) => boolean): string[] {
  const errors: string[] = [];
  const sample: EventRow = { id: "x", company_id: "c", store_id: null, type: "", schema_version: 1, entity_kind: null, entity_id: "e", payload: {}, occurred_at: new Date().toISOString() };
  for (const w of list) {
    if (!/^wf\.[a-z][a-z0-9_]*$/.test(w.name)) errors.push(`${w.name}: 名前は wf.xxx`);
    for (const st of w.steps({ ...sample, type: w.trigger.type })) {
      if (!/@\d+$/.test(st.tool)) errors.push(`${w.name}: Step ${st.key} の Tool は固定版で書く（${st.tool}）`);
      if (!has(st.tool)) errors.push(`${w.name}: Step ${st.key} の Tool が未登録（${st.tool}）`);
    }
  }
  return errors;
}
