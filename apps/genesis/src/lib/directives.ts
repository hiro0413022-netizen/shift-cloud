import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import type { GenesisActor } from "@/lib/auth";

/* ============================================================
   実行指示センター（DECISIONS #52 / 0045）
   「Genesisから実行指示を出せる」ための唯一の入口。
   台帳 = gn_directives。実体は宛先ごとに配る:
     staff    → sp_tasks（スタッフポータルの「やること」に出る）＋ notifications
     ai_agent → prompts（AI社員宛ての指示書・下書き）＋ ai_agents.current_task
     external → approval_requests（外部送信は承認必須 VISION §7）
   完了報告は gn_directives.status で一元管理し、Cockpitに戻る。
   ============================================================ */

export type DirectiveTarget = "staff" | "ai_agent" | "external";

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
        date: input.due_date ?? new Date().toISOString().slice(0, 10),
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
          `## 指示（${new Date().toLocaleDateString("ja-JP")} 古川さん発行）`,
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
