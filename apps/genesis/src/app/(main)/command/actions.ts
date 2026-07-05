"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent, getCockpitData } from "@/lib/kernel";

/** AI指示プロンプト生成（背景・現在の状態はDBから自動注入） */
export async function generatePrompt(formData: FormData) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();

  const targetAi = String(formData.get("target_ai") ?? "claude");
  const moduleId = String(formData.get("module_id") ?? "") || null;
  const goal = String(formData.get("goal") ?? "").trim();
  const targets = String(formData.get("targets") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const cautions = String(formData.get("cautions") ?? "").trim();
  const doneCriteria = String(formData.get("done_criteria") ?? "").trim();
  if (!goal) return;

  const [{ data: mod }, { data: dev }, { data: blockers }] = await Promise.all([
    moduleId
      ? admin.from("modules").select("name, code, description, status").eq("id", moduleId).single()
      : Promise.resolve({ data: null }),
    moduleId
      ? admin.from("development_statuses").select("*").eq("module_id", moduleId).is("deleted_at", null).limit(1).single()
      : Promise.resolve({ data: null }),
    admin.from("blockers").select("title, needs").eq("company_id", actor.companyId).eq("status", "open").is("deleted_at", null),
  ]);

  const body = [
    "## 背景",
    "YOZAN GENESIS（会社を動かすOS）の開発。docs/genesis/ の DECISIONS.md / ARCHITECTURE.md / DEVELOPMENT_RULES.md を必ず先に読み、既存決定を再議論しないこと。",
    "",
    "## 現在の状態",
    mod ? `- 対象モジュール: ${mod.name} (${mod.code}) — ${statusJa(String(mod.status))}` : "- 対象モジュール: 指定なし",
    dev ? `- 進捗: ${dev.progress}% / 現在: ${dev.current_task ?? "-"}` : "",
    dev?.remaining_items?.length ? `- 残項目: ${(dev.remaining_items as string[]).join(" / ")}` : "",
    (blockers ?? []).length ? `- オープンブロッカー: ${(blockers ?? []).map((b) => b.title).join(" / ")}` : "- オープンブロッカー: なし",
    "",
    "## 目的",
    goal,
    "",
    "## 変更対象",
    targets || "（実装者が対象ファイルを宣言してから着手すること）",
    "",
    "## 実装内容",
    details || goal,
    "",
    "## 注意点",
    cautions || "既存の稼働機能を壊さない。1作業=1機能。差分のみ出力しCHANGELOG.mdに記録。",
    "",
    "## 完了条件",
    doneCriteria || "next build成功。対象機能が動作する。",
    "",
    "## テスト条件",
    "変更箇所の動作確認。既存画面のリグレッションがないこと。",
    "",
    "## 禁止事項",
    "- 本番への直接デプロイ / 本番DBの破壊的変更 / シークレットのコミット",
    "- 外部へのメール・LINE・Slack実送信",
    "- DECISIONS.mdにある決定の再議論・再生成",
    "",
    "## 承認が必要な作業",
    "本番デプロイ・本番DB変更・課金操作・外部送信は必ず承認待ち（Approval）に回すこと。",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const { data: created } = await admin
    .from("prompts")
    .insert({
      company_id: actor.companyId,
      target_ai: targetAi,
      title: goal.slice(0, 80),
      body,
      status: "draft",
      related_module_id: moduleId,
      context: { generated_from: "command_center" },
    })
    .select("id")
    .single();

  await logAudit(actor, "prompt.generate", "prompts", created?.id ?? null, null, { targetAi, goal });
  await logEvent(actor.companyId, {
    event_type: "ai.prompt_generated",
    title: `AI指示生成: ${goal.slice(0, 60)}`,
    source: "ceo_ai",
    source_type: "ai",
    related_module_id: moduleId,
  });
  revalidatePath("/command");
}

/** 全KPIの実データ再集計（Shift Cloud労務 + 財務） */
async function refreshAllKpis(companyId: string) {
  const admin = createAdmin();
  await admin.rpc("refresh_shift_cloud_kpis", { p_company_id: companyId });
  await admin.rpc("refresh_finance_kpis", { p_company_id: companyId });
}

/** KPI実データ更新（migration 0008 / 0009） */
export async function refreshKpis() {
  const actor = await requireGenesisActor();
  await refreshAllKpis(actor.companyId);
  await logAudit(actor, "kpi.refresh", "kpis", null);
  await logEvent(actor.companyId, {
    event_type: "kpi.refreshed",
    title: "KPIを実データから再集計（労務＋財務）",
    source: "genesis",
    source_type: "system",
  });
  revalidatePath("/command");
  revalidatePath("/future");
  revalidatePath("/");
}

function fmtKpiValue(v: unknown, unit: unknown): string {
  if (v == null) return "未接続";
  const n = Number(v);
  return `${Number.isInteger(n) ? n.toLocaleString("ja-JP") : n}${String(unit ?? "")}`;
}

/** 日次レポート生成（KPI再集計 → DB横断集計 → reports保存 → Company Event記録） */
export async function generateDailyReport() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  await refreshAllKpis(actor.companyId);
  const d = await getCockpitData(actor.companyId);

  const today = new Date().toLocaleDateString("ja-JP");
  const lines = [
    `# YOZAN GENESIS 日次レポート（${today}）`,
    "",
    "## KPI（実データ）",
    ...(d.kpis.length === 0
      ? ["- KPI未登録"]
      : d.kpis.map(
          (k) =>
            `- ${k.name}: ${fmtKpiValue(k.current_value, k.unit)}${
              k.target_value != null ? `（目標 ${fmtKpiValue(k.target_value, k.unit)}）` : ""
            }`
        )),
    "",
    "## 開発状況",
    ...d.devStatuses.map(
      (s) =>
        `- ${s.module_name}: ${s.progress}%（${String(s.status)}）${s.next_action ? ` / 次: ${s.next_action}` : ""}`
    ),
    "",
    "## リスク・ブロッカー",
    d.risks.length === 0 && d.blockers.length === 0
      ? "- オープンなし"
      : [
          ...d.risks.map((r) => `- [リスク/${r.severity}] ${r.title}`),
          ...d.blockers.map((b) => `- [ブロッカー] ${b.title}`),
        ].join("\n"),
    "",
    "## 承認待ち",
    d.approvals.length === 0 ? "- なし" : `- ${d.approvals.length}件（Approvals画面で確認）`,
    "",
    "## AIエージェント",
    `- 登録${d.agents.length}体 / 稼働中${d.agents.filter((a) => a.current_status === "working").length}体`,
    "",
    "## 直近イベント",
    ...d.recentEvents.slice(0, 5).map((e) => `- ${String(e.title)}`),
    "",
    "## 次にやるべきこと",
    ...d.devStatuses
      .filter((s) => s.next_action)
      .map((s) => `- ${s.module_name}: ${s.next_action}`),
  ].join("\n");

  const { data: report } = await admin
    .from("reports")
    .insert({
      company_id: actor.companyId,
      report_type: "daily",
      title: `日次レポート ${today}`,
      body: lines,
      generated_by: "ceo_ai",
      data: {
        dev: d.devStatuses.length,
        risks: d.risks.length,
        blockers: d.blockers.length,
        approvals: d.approvals.length,
      },
    })
    .select("id")
    .single();

  await logAudit(actor, "report.generate", "reports", report?.id ?? null);
  await logEvent(actor.companyId, {
    event_type: "report.daily",
    title: `日次レポート生成（${today}）`,
    source: "ceo_ai",
    source_type: "ai",
  });
  revalidatePath("/command");
}

function statusJa(s: string) {
  const map: Record<string, string> = {
    live: "稼働中", building: "実装中", designing: "設計中", testing: "テスト中",
    planned: "計画", paused: "停止中", error: "エラー",
  };
  return map[s] ?? s;
}
