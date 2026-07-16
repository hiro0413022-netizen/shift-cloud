import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import type { GenesisActor } from "@/lib/auth";

/* ============================================================
   AI実行 executor（DECISIONS #62 / migration 0062）

   #61で決めたリスク階層（ai_execution_policies）を実際に動かす関所。
   すべてのAIアクションは enqueueAction() を通り、モードに応じて:
     - auto      : すぐ実行キューに入る（scheduled_at = now）
     - auto_undo : undo_minutes だけ実行を遅らせる（その間は「取消」できる）
     - approval  : awaiting_approval で止まり、承認されて初めてキューに入る
   runDueActions() が scheduled_at を過ぎた queued を拾ってハンドラを実行し、
   audit_logs(actor_type='ai') に必ず記録する。危険な副作用は赤(approval)で止まる。
   ============================================================ */

type Admin = ReturnType<typeof createAdmin>;

export type ExecutionMode = "auto" | "auto_undo" | "approval";

export type QueueRow = {
  id: string;
  company_id: string;
  action_type: string;
  mode: ExecutionMode;
  title: string;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "done" | "cancelled" | "failed" | "awaiting_approval";
  scheduled_at: string;
  undo_deadline: string | null;
  executed_at: string | null;
  cancelled_at: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  origin_kind: string | null;
  origin_id: string | null;
  created_by: string | null;
  created_at: string;
};

/** action_type から実行モードを解決（正典=ai_execution_policies、既定は安全側の approval） */
export async function resolveMode(
  admin: Admin,
  companyId: string,
  actionType: string
): Promise<{ mode: ExecutionMode; undoMinutes: number }> {
  const { data } = await admin
    .from("ai_execution_policies")
    .select("mode, undo_minutes")
    .eq("company_id", companyId)
    .eq("action_type", actionType)
    .maybeSingle();
  if (!data) return { mode: "approval", undoMinutes: 0 };
  return { mode: data.mode as ExecutionMode, undoMinutes: Number(data.undo_minutes ?? 0) };
}

export type EnqueueInput = {
  companyId: string;
  actionType: string;
  title: string;
  payload?: Record<string, unknown>;
  originKind?: string;
  originId?: string | null;
  dedupeKey?: string | null;
  createdBy?: string | null; // null = AI/システム発
};

export type EnqueueResult = {
  id: string | null;
  mode: ExecutionMode;
  status: QueueRow["status"];
  scheduledAt: string;
  skipped?: boolean; // dedupeで既存あり
};

/** AIアクションをキューに投入（モードを解決して scheduled_at / status を決める） */
export async function enqueueAction(admin: Admin, input: EnqueueInput): Promise<EnqueueResult> {
  const { mode, undoMinutes } = await resolveMode(admin, input.companyId, input.actionType);
  const now = Date.now();
  const scheduledAt =
    mode === "auto_undo" ? new Date(now + undoMinutes * 60_000).toISOString() : new Date(now).toISOString();
  const status: QueueRow["status"] = mode === "approval" ? "awaiting_approval" : "queued";

  const { data, error } = await admin
    .from("ai_action_queue")
    .insert({
      company_id: input.companyId,
      action_type: input.actionType,
      mode,
      title: input.title,
      payload: input.payload ?? {},
      status,
      scheduled_at: scheduledAt,
      undo_deadline: mode === "auto_undo" ? scheduledAt : null,
      origin_kind: input.originKind ?? null,
      origin_id: input.originId ?? null,
      dedupe_key: input.dedupeKey ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  // dedupeの一意制約に当たった＝既に未処理の同一アクションがある
  if (error) {
    if (error.code === "23505") return { id: null, mode, status, scheduledAt, skipped: true };
    throw new Error(error.message);
  }
  return { id: data?.id ?? null, mode, status, scheduledAt };
}

/* ---------- ハンドラ登録（action_type → 実際の処理） ----------
   ここに無いaction_typeは実行時 failed（no handler）になる。
   副作用の強い外部送信・デプロイは既定でapproval（=ここに来ない）。 */

type HandlerCtx = { admin: Admin; row: QueueRow };
type Handler = (ctx: HandlerCtx) => Promise<Record<string, unknown>>;

async function sendStaffLine(admin: Admin, row: QueueRow): Promise<Record<string, unknown>> {
  const body = String(row.payload.body ?? row.payload.message ?? "").trim();
  if (!body) throw new Error("body が空です");
  const wantGroup = row.payload.group_id ? String(row.payload.group_id) : null;

  const { data: groups } = await admin
    .from("gn_line_groups")
    .select("id, line_group_id, store_id, is_default")
    .eq("company_id", row.company_id)
    .is("deleted_at", null)
    .order("is_default", { ascending: false });
  const list = groups ?? [];
  const group = wantGroup
    ? list.find((g) => g.line_group_id === wantGroup)
    : list.find((g) => g.is_default) ?? list[0];
  if (!group) throw new Error("LINE配信先グループが未登録です");

  const title = body.split("\n")[0].slice(0, 80);
  const { data: dir } = await admin
    .from("gn_directives")
    .insert({
      company_id: row.company_id,
      target_kind: "staff",
      staff_id: null,
      title,
      body,
      status: "issued",
      origin_kind: "notice",
      created_by: null,
    })
    .select("id")
    .single();

  const { error: outErr } = await admin.from("gn_line_outbox").insert({
    company_id: row.company_id,
    to_group_id: group.line_group_id,
    body,
    directive_id: dir?.id ?? null,
    status: "pending", // 取消枠は既に過ぎている＝ここで初めて送信キューへ
    created_by: null,
  });
  if (outErr) throw new Error(outErr.message);
  return { directive_id: dir?.id ?? null, group: group.line_group_id };
}

const HANDLERS: Record<string, Handler> = {
  // 無害な動作確認用
  test_notify: async ({ admin, row }) => {
    await logEvent(row.company_id, {
      event_type: "ai.test_notify",
      title: `動作確認: ${row.title}`.slice(0, 120),
      description: "AI executor のテスト実行（副作用なし）",
      source: "ai_executor",
      source_type: "ai",
    });
    return { noted: true };
  },
  // 社内向け通知（company_events に残すだけ・外部送信なし）
  internal_notify: async ({ admin, row }) => {
    await logEvent(row.company_id, {
      event_type: "ai.internal_notify",
      title: String(row.payload.title ?? row.title).slice(0, 120),
      description: row.payload.body ? String(row.payload.body) : undefined,
      source: "ai_executor",
      source_type: "ai",
    });
    return { noted: true };
  },
  // 日次レポート再生成（内部処理）
  report_generate: async ({ row }) => {
    const { runDailyCeoReport } = await import("@/lib/ceo-ai");
    const r = await runDailyCeoReport(row.company_id, "auto");
    return { report: r } as Record<string, unknown>;
  },
  // AI社員の成果物生成（レビュー待ちで保存・配信はしない #60）
  deliverable_generate: async ({ row }) => {
    const mod = await import("@/lib/agent-runner");
    const gen = (mod as unknown as { generateDeliverables?: (c: string) => Promise<unknown> }).generateDeliverables;
    if (!gen) throw new Error("generateDeliverables が見つかりません");
    const r = await gen(row.company_id);
    return { deliverables: r } as Record<string, unknown>;
  },
  // スタッフへ連絡 / 定型LINE一斉配信（auto_undoの猶予後に実送信）
  staff_directive: async ({ admin, row }) => sendStaffLine(admin, row),
  line_broadcast: async ({ admin, row }) => sendStaffLine(admin, row),
};

export function hasHandler(actionType: string): boolean {
  return actionType in HANDLERS;
}

async function writeAudit(
  admin: Admin,
  companyId: string,
  action: string,
  recordId: string,
  after: Record<string, unknown>
) {
  await admin.from("audit_logs").insert({
    company_id: companyId,
    actor_staff_id: null,
    actor_type: "ai",
    action,
    table_name: "ai_action_queue",
    record_id: recordId,
    before: null,
    after,
  });
}

export type RunSummary = { picked: number; done: number; failed: number };

/** scheduled_at を過ぎた queued を拾って実行する（cron / 手動から呼ぶ） */
export async function runDueActions(admin: Admin, companyId: string, limit = 20): Promise<RunSummary> {
  const nowIso = new Date().toISOString();
  const { data: rows } = await admin
    .from("ai_action_queue")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "queued")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  const summary: RunSummary = { picked: (rows ?? []).length, done: 0, failed: 0 };

  for (const raw of (rows ?? []) as QueueRow[]) {
    // 楽観ロック: まだ queued のものだけ running にできたら実行
    const { data: locked } = await admin
      .from("ai_action_queue")
      .update({ status: "running" })
      .eq("id", raw.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (!locked) continue; // 他プロセスが先に取った

    const handler = HANDLERS[raw.action_type];
    try {
      if (!handler) throw new Error(`ハンドラ未登録: ${raw.action_type}`);
      const result = await handler({ admin, row: raw });
      await admin
        .from("ai_action_queue")
        .update({ status: "done", executed_at: new Date().toISOString(), result })
        .eq("id", raw.id);
      await writeAudit(admin, companyId, "ai_action.execute", raw.id, {
        action_type: raw.action_type,
        mode: raw.mode,
        result,
      });
      summary.done += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin
        .from("ai_action_queue")
        .update({ status: "failed", executed_at: new Date().toISOString(), error: msg })
        .eq("id", raw.id);
      await writeAudit(admin, companyId, "ai_action.failed", raw.id, {
        action_type: raw.action_type,
        error: msg,
      });
      summary.failed += 1;
    }
  }
  return summary;
}

/** auto_undo の取消（scheduled_at 前の queued のみ止められる） */
export async function cancelAction(actor: GenesisActor, id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdmin();
  const { data } = await admin
    .from("ai_action_queue")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: actor.staffId })
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("status", "queued")
    .gt("scheduled_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (!data) return { ok: false, error: "取消できませんでした（既に実行済み・期限切れ・存在しない）" };
  await writeAudit(admin, actor.companyId, "ai_action.cancel", id, { cancelled_by: actor.staffId });
  return { ok: true };
}

/** approval のアクションを承認して実行キューに入れる */
export async function approveAction(actor: GenesisActor, id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdmin();
  const { data } = await admin
    .from("ai_action_queue")
    .update({ status: "queued", scheduled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("status", "awaiting_approval")
    .select("id")
    .maybeSingle();
  if (!data) return { ok: false, error: "承認できませんでした" };
  await admin.from("audit_logs").insert({
    company_id: actor.companyId,
    actor_staff_id: actor.staffId,
    actor_type: "human",
    action: "ai_action.approve",
    table_name: "ai_action_queue",
    record_id: id,
    before: null,
    after: null,
  });
  return { ok: true };
}

/** approval のアクションを却下 */
export async function rejectAction(actor: GenesisActor, id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdmin();
  const { data } = await admin
    .from("ai_action_queue")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: actor.staffId })
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .eq("status", "awaiting_approval")
    .select("id")
    .maybeSingle();
  if (!data) return { ok: false, error: "却下できませんでした" };
  return { ok: true };
}

/** 一覧表示用（最近のキュー） */
export async function listActions(admin: Admin, companyId: string, limit = 50): Promise<QueueRow[]> {
  const { data } = await admin
    .from("ai_action_queue")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as QueueRow[];
}
