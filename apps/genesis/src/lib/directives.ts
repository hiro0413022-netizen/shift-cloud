import "server-only";
import { jstDateJa, jstYmd } from "@/lib/jst";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import type { GenesisActor } from "@/lib/auth";

/* ============================================================
   実行指示センター（DECISIONS #52 / 0045、工程=#59 / 0059）
   「Genesisから実行指示を出せる」ための唯一の入口。
   台帳 = gn_directives。実体は宛先ごとに配る:
     staff    → sp_tasks（スタッフポータルの「やること」に出る）＋ notifications
     ai_agent → prompts（AI社員宛ての指示書・下書き）＋ ai_agents.current_task
     external → approval_requests（外部送信は承認必須 VISION §7）
     campaign → gn_directive_steps（工程の束。各工程を staff/ai_agent へ配る）
   完了報告は gn_directives.status で一元管理し、Cockpitに戻る。
   ============================================================ */

export type DirectiveTarget = "staff" | "ai_agent" | "external" | "campaign";

export type Directive = {
  id: string;
  target_kind: DirectiveTarget;
  staff_id: string | null;
  agent_id: string | null;
  title: string;
  body: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  origin_kind: string | null;
  origin_id: string | null;
  result: string | null;
  created_at: string;
  done_at: string | null;
};

export type DirectiveRow = Directive & {
  staff_name: string | null;
  agent_name: string | null;
};

export const TARGET_LABELS: Record<DirectiveTarget, string> = {
  staff: "スタッフ",
  ai_agent: "AI社員",
  external: "外部送信（承認）",
  campaign: "キャンペーン（工程）",
};

/* ============================================================
   工程（ステップ）— 1つの指示を「誰が・何を・どの順で」の連鎖にする（DECISIONS #59）
   ============================================================ */
export type StepTarget = "staff" | "ai_agent";

export type DirectiveStepInput = {
  title: string;
  detail?: string | null;
  target_kind: StepTarget;
  staff_id?: string | null;
  agent_id?: string | null;
  due_date?: string | null;
};

export type DirectiveStep = {
  id: string;
  directive_id: string;
  seq: number;
  title: string;
  detail: string | null;
  target_kind: StepTarget;
  staff_id: string | null;
  agent_id: string | null;
  due_date: string | null;
  status: string;
  result: string | null;
  created_at: string;
};

export type DirectiveStepRow = DirectiveStep & {
  staff_name: string | null;
  agent_name: string | null;
};

export const STEP_STATUS_LABELS: Record<string, string> = {
  pending: "未着手",
  in_progress: "対応中",
  done: "完了",
  cancelled: "取消",
};

export const DIRECTIVE_STATUS_LABELS: Record<string, string> = {
  issued: "指示済み",
  in_progress: "対応中",
  done: "完了",
  cancelled: "取消",
};

export async function getDirectives(companyId: string, opts: { open: boolean }): Promise<DirectiveRow[]> {
  const admin = createAdmin();
  let q = admin
    .from("gn_directives")
    .select("*, staff:staff_id(name), agent:agent_id(name)")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  q = opts.open ? q.in("status", ["issued", "in_progress"]) : q.in("status", ["done", "cancelled"]);
  const { data } = await q.order("created_at", { ascending: false }).limit(opts.open ? 50 : 20);

  return ((data ?? []) as unknown as (Directive & { staff: { name: string } | null; agent: { name: string } | null })[]).map(
    (r) => ({ ...r, staff_name: r.staff?.name ?? null, agent_name: r.agent?.name ?? null })
  );
}

export type IssueInput = {
  target_kind: DirectiveTarget;
  staff_id?: string | null;
  agent_id?: string | null;
  title: string;
  body?: string | null;
  due_date?: string | null;
  priority?: "high" | "normal" | "low";
  origin_kind?: string | null; // suggestion / inquiry / judgment / manual
  origin_id?: string | null;
  store_id?: string | null; // スタッフ指示時のsp_tasks用
};

/** 指示を発行する。宛先ごとに実体（sp_tasks / prompts / approval_requests）も作る。 */
export async function issueDirective(actor: GenesisActor, input: IssueInput): Promise<string | null> {
  const admin = createAdmin();
  const companyId = actor.companyId;
  const title = input.title.trim();
  if (!title) return null;

  let spTaskId: string | null = null;
  let promptId: string | null = null;
  let approvalId: string | null = null;

  if (input.target_kind === "staff" && input.staff_id) {
    // 主店舗が分からない場合もタスクは出す（store_idはnull許容）
    const { data: task } = await admin
      .from("sp_tasks")
      .insert({
        company_id: companyId,
        staff_id: input.staff_id,
        store_id: input.store_id ?? null,
        date: input.due_date ?? jstYmd(),
        title,
        note: input.body ?? null,
        status: "open",
        source: "genesis",
        created_by: actor.staffId,
      })
      .select("id")
      .single();
    spTaskId = task?.id ?? null;

    await admin.from("notifications").insert({
      company_id: companyId,
      staff_id: input.staff_id,
      kind: "directive",
      title: `【本部からの指示】${title}`,
      body: input.body ?? null,
      link: "/staff/tasks",
    });
  }

  if (input.target_kind === "ai_agent" && input.agent_id) {
    const { data: agent } = await admin.from("ai_agents").select("id, name, code").eq("id", input.agent_id).single();
    const { data: prompt } = await admin
      .from("prompts")
      .insert({
        company_id: companyId,
        target_ai: "claude",
        title: `【指示→${agent?.name ?? "AI社員"}】${title.slice(0, 60)}`,
        body: [
          `## 指示（${jstDateJa()} 古川さん発行）`,
          `宛先: ${agent?.name ?? input.agent_id}`,
          "",
          "## 指示内容",
          title,
          input.body ? `\n## 補足\n${input.body}` : "",
          "",
          "## 権限",
          "分析・下書き・案の作成まで。外部送信/デプロイ/課金/契約は古川さんの承認が必須（VISION §7）。",
        ].join("\n"),
        status: "draft",
        context: { generated_from: "genesis_directive", origin_kind: input.origin_kind ?? "manual" },
      })
      .select("id")
      .single();
    promptId = prompt?.id ?? null;

    if (agent) {
      await admin
        .from("ai_agents")
        .update({ current_status: "working", current_task: title.slice(0, 120), last_run_at: new Date().toISOString() })
        .eq("id", agent.id);
    }
  }

  if (input.target_kind === "external") {
    const { data: ap } = await admin
      .from("approval_requests")
      .insert({
        company_id: companyId,
        kind: title.slice(0, 80),
        target_table: "gn_directives",
        requested_by: actor.staffId,
        status: "pending",
        payload: { title, body: input.body ?? null, origin_kind: input.origin_kind ?? "manual" },
      })
      .select("id")
      .single();
    approvalId = ap?.id ?? null;
  }

  const { data: dir } = await admin
    .from("gn_directives")
    .insert({
      company_id: companyId,
      target_kind: input.target_kind,
      staff_id: input.staff_id ?? null,
      agent_id: input.agent_id ?? null,
      title,
      body: input.body ?? null,
      due_date: input.due_date ?? null,
      priority: input.priority ?? "normal",
      status: "issued",
      origin_kind: input.origin_kind ?? "manual",
      origin_id: input.origin_id ?? null,
      sp_task_id: spTaskId,
      prompt_id: promptId,
      approval_request_id: approvalId,
      created_by: actor.staffId,
    })
    .select("id")
    .single();

  await logEvent(companyId, {
    event_type: "directive.issued",
    title: `実行指示: ${title}`.slice(0, 120),
    description: `宛先=${TARGET_LABELS[input.target_kind]}`,
    source: "genesis",
    source_type: "human",
  });

  return dir?.id ?? null;
}

/* ---------- 工程を担当（スタッフ/AI社員）へ配る ---------- */
type Admin = ReturnType<typeof createAdmin>;

async function fanOutStep(
  admin: Admin,
  actor: GenesisActor,
  input: { target_kind: StepTarget; staff_id?: string | null; agent_id?: string | null; title: string; body?: string | null; due_date?: string | null; origin_kind?: string | null }
): Promise<{ spTaskId: string | null; promptId: string | null }> {
  const companyId = actor.companyId;
  let spTaskId: string | null = null;
  let promptId: string | null = null;

  if (input.target_kind === "staff" && input.staff_id) {
    const { data: task } = await admin
      .from("sp_tasks")
      .insert({
        company_id: companyId,
        staff_id: input.staff_id,
        store_id: null,
        date: input.due_date ?? jstYmd(),
        title: input.title,
        note: input.body ?? null,
        status: "open",
        source: "genesis",
        created_by: actor.staffId,
      })
      .select("id")
      .single();
    spTaskId = task?.id ?? null;

    await admin.from("notifications").insert({
      company_id: companyId,
      staff_id: input.staff_id,
      kind: "directive",
      title: `【本部からの指示】${input.title}`,
      body: input.body ?? null,
      link: "/staff/tasks",
    });
  }

  if (input.target_kind === "ai_agent" && input.agent_id) {
    const { data: agent } = await admin.from("ai_agents").select("id, name, code").eq("id", input.agent_id).single();
    const { data: prompt } = await admin
      .from("prompts")
      .insert({
        company_id: companyId,
        target_ai: "claude",
        title: `【指示→${agent?.name ?? "AI社員"}】${input.title.slice(0, 60)}`,
        body: [
          `## 指示（${jstDateJa()} 古川さん発行）`,
          `宛先: ${agent?.name ?? input.agent_id}`,
          "",
          "## 指示内容",
          input.title,
          input.body ? `\n## 補足\n${input.body}` : "",
          "",
          "## 権限",
          "分析・下書き・案の作成まで。外部送信/デプロイ/課金/契約は古川さんの承認が必須（VISION §7）。",
        ].join("\n"),
        status: "draft",
        context: { generated_from: "genesis_campaign_step", origin_kind: input.origin_kind ?? "campaign" },
      })
      .select("id")
      .single();
    promptId = prompt?.id ?? null;

    if (agent) {
      await admin
        .from("ai_agents")
        .update({ current_status: "working", current_task: input.title.slice(0, 120), last_run_at: new Date().toISOString() })
        .eq("id", agent.id);
    }
  }

  return { spTaskId, promptId };
}

export type CampaignInput = {
  title: string;
  body?: string | null;
  due_date?: string | null;
  priority?: "high" | "normal" | "low";
  origin_kind?: string | null;
  origin_id?: string | null;
  steps: DirectiveStepInput[];
};

/** キャンペーン（工程の束）を発行する。親=gn_directives(target_kind=campaign)、各工程をスタッフ/AIへ配る。 */
export async function issueCampaign(actor: GenesisActor, input: CampaignInput): Promise<string | null> {
  const admin = createAdmin();
  const companyId = actor.companyId;
  const title = input.title.trim();
  const steps = (input.steps ?? []).filter((s) => s.title && s.title.trim());
  if (!title || steps.length === 0) return null;

  // 親（器）
  const { data: dir } = await admin
    .from("gn_directives")
    .insert({
      company_id: companyId,
      target_kind: "campaign",
      staff_id: null,
      agent_id: null,
      title,
      body: input.body ?? null,
      due_date: input.due_date ?? null,
      priority: input.priority ?? "normal",
      status: "issued",
      origin_kind: input.origin_kind ?? "manual",
      origin_id: input.origin_id ?? null,
      created_by: actor.staffId,
    })
    .select("id")
    .single();
  const directiveId = dir?.id ?? null;
  if (!directiveId) return null;

  // 各工程を実体に配る
  let seq = 1;
  for (const s of steps) {
    const { spTaskId, promptId } = await fanOutStep(admin, actor, {
      target_kind: s.target_kind,
      staff_id: s.staff_id ?? null,
      agent_id: s.agent_id ?? null,
      title: s.title.trim(),
      body: s.detail ?? null,
      due_date: s.due_date ?? input.due_date ?? null,
      origin_kind: input.origin_kind ?? "campaign",
    });

    await admin.from("gn_directive_steps").insert({
      company_id: companyId,
      directive_id: directiveId,
      seq,
      title: s.title.trim(),
      detail: s.detail ?? null,
      target_kind: s.target_kind,
      staff_id: s.staff_id ?? null,
      agent_id: s.agent_id ?? null,
      due_date: s.due_date ?? null,
      status: "pending",
      sp_task_id: spTaskId,
      prompt_id: promptId,
      created_by: actor.staffId,
    });
    seq++;
  }

  await logEvent(companyId, {
    event_type: "directive.issued",
    title: `実行指示（キャンペーン ${steps.length}工程）: ${title}`.slice(0, 120),
    description: `工程${steps.length}件を配布`,
    source: "genesis",
    source_type: "human",
  });

  return directiveId;
}

/** 指示IDごとの工程一覧（担当名つき）を取得 */
export async function getStepsFor(companyId: string, directiveIds: string[]): Promise<Map<string, DirectiveStepRow[]>> {
  const map = new Map<string, DirectiveStepRow[]>();
  if (directiveIds.length === 0) return map;
  const admin = createAdmin();
  const { data } = await admin
    .from("gn_directive_steps")
    .select("*, staff:staff_id(name), agent:agent_id(name)")
    .eq("company_id", companyId)
    .in("directive_id", directiveIds)
    .is("deleted_at", null)
    .order("seq", { ascending: true });

  for (const r of (data ?? []) as unknown as (DirectiveStep & { staff: { name: string } | null; agent: { name: string } | null })[]) {
    const row: DirectiveStepRow = { ...r, staff_name: r.staff?.name ?? null, agent_name: r.agent?.name ?? null };
    const arr = map.get(r.directive_id) ?? [];
    arr.push(row);
    map.set(r.directive_id, arr);
  }
  return map;
}

/** 指示のステータス更新（完了・取消・対応中） */
export async function updateDirectiveStatus(
  actor: GenesisActor,
  id: string,
  status: "in_progress" | "done" | "cancelled",
  result?: string
) {
  const admin = createAdmin();
  const { data: before } = await admin
    .from("gn_directives")
    .select("*")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!before) return;

  await admin
    .from("gn_directives")
    .update({
      status,
      result: result ?? before.result,
      done_at: status === "done" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  // スタッフ指示の実体（sp_tasks）も追随させる
  if (before.sp_task_id && (status === "done" || status === "cancelled")) {
    await admin.from("sp_tasks").update({ status: "done" }).eq("id", before.sp_task_id);
  }
}

/** 工程のステータス更新。実体（sp_tasks）を追随させ、全工程完了で親をdoneへロールアップ。 */
export async function updateStepStatus(
  actor: GenesisActor,
  stepId: string,
  status: "in_progress" | "done" | "cancelled",
  result?: string
) {
  const admin = createAdmin();
  const { data: step } = await admin
    .from("gn_directive_steps")
    .select("*")
    .eq("id", stepId)
    .eq("company_id", actor.companyId)
    .single();
  if (!step) return;

  await admin
    .from("gn_directive_steps")
    .update({ status, result: result ?? step.result, updated_at: new Date().toISOString() })
    .eq("id", stepId)
    .eq("company_id", actor.companyId);

  if (step.sp_task_id && (status === "done" || status === "cancelled")) {
    await admin.from("sp_tasks").update({ status: "done" }).eq("id", step.sp_task_id);
  }

  // ロールアップ: 残り工程が全て done/cancelled なら親も完了
  const { data: siblings } = await admin
    .from("gn_directive_steps")
    .select("status")
    .eq("directive_id", step.directive_id)
    .is("deleted_at", null);
  const allClosed = (siblings ?? []).every((s) => s.status === "done" || s.status === "cancelled");
  if (allClosed) {
    await admin
      .from("gn_directives")
      .update({ status: "done", done_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", step.directive_id)
      .eq("company_id", actor.companyId);
  } else {
    // 1つでも動き出したら親は対応中
    await admin
      .from("gn_directives")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", step.directive_id)
      .eq("company_id", actor.companyId)
      .eq("status", "issued");
  }
}

/** 未完了の指示件数（Cockpit表示用） */
export async function countOpenDirectives(companyId: string): Promise<number> {
  const admin = createAdmin();
  const { count } = await admin
    .from("gn_directives")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .in("status", ["issued", "in_progress"]);
  return count ?? 0;
}
