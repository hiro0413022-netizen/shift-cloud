"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";
import { runDailyCeoReport } from "@/lib/ceo-ai";

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
    "YOZAN GENESIS（会社を動かすOS）の開発。正典 docs/genesis/VISION.md（North Star）を必ず最初に読み、本丸=GOLF WINGと5大KPIへの寄与から逆算すること。次に DECISIONS.md / ARCHITECTURE.md / DEVELOPMENT_RULES.md を読み、既存決定を再議論しないこと。",
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
    "## 禁止事項（VISION §7 AI権限の線引き）",
    "- 本番への直接デプロイ / 本番DBの破壊的変更 / シークレットのコミット",
    "- 外部への実送信（メール・LINE・Slack・顧客連絡）/ 課金 / 個人情報の外部持ち出し",
    "- DECISIONS.mdにある決定の再議論・再生成",
    "",
    "## 承認が必要な作業",
    "本番デプロイ・本番DB変更・課金・外部送信・契約・値上げ・大型支払いは必ず承認待ち（Approval）に回すこと。",
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

/** KPI実データ更新（migration 0008 / 0009 / 0010。会員系0011は適用後に有効） */
export async function refreshKpis() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  await admin.rpc("refresh_shift_cloud_kpis", { p_company_id: actor.companyId });
  await admin.rpc("refresh_finance_kpis", { p_company_id: actor.companyId });
  await admin.rpc("refresh_member_kpis", { p_company_id: actor.companyId }); // 0011未適用時はエラーが返るだけで無害
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

/** KPI手動更新（CRM/予約モジュール接続までの暫定経路。VISION §6） */
export async function updateKpiManual(formData: FormData) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();

  const code = String(formData.get("code") ?? "");
  const valueRaw = String(formData.get("value") ?? "").replace(/[,，\s]/g, "");
  const targetRaw = String(formData.get("target") ?? "").replace(/[,，\s]/g, "");
  if (!code) return;
  const value = valueRaw === "" ? null : Number(valueRaw);
  const target = targetRaw === "" ? null : Number(targetRaw);
  if (value != null && !Number.isFinite(value)) return;
  if (target != null && !Number.isFinite(target)) return;

  const { data: kpi } = await admin
    .from("kpis")
    .select("id, trend, current_value, target_value")
    .eq("company_id", actor.companyId)
    .eq("code", code)
    .single();
  if (!kpi) return;

  const today = new Date().toISOString().slice(0, 10);
  const patch: Record<string, unknown> = {};
  if (value != null) {
    const trend = (Array.isArray(kpi.trend) ? kpi.trend : []).filter(
      (p) => typeof p === "object" && p != null && String((p as { date?: string }).date) !== today
    );
    trend.push({ date: today, value });
    patch.current_value = value;
    patch.trend = trend.slice(-90);
  }
  if (target != null) patch.target_value = target;
  if (Object.keys(patch).length === 0) return;

  await admin.from("kpis").update(patch).eq("id", kpi.id);
  await logAudit(actor, "kpi.manual_update", "kpis", String(kpi.id), { value: kpi.current_value, target: kpi.target_value }, { value, target });
  await logEvent(actor.companyId, {
    event_type: "kpi.manual_updated",
    title: `KPI手動更新: ${code}${value != null ? ` = ${value}` : ""}${target != null ? `（目標 ${target}）` : ""}`,
    source: "genesis",
    source_type: "human",
  });
  revalidatePath("/command");
  revalidatePath("/future");
  revalidatePath("/");
}

/** 日次レポート生成（本体は lib/ceo-ai.ts — Cronと同一ロジック。VISION §3） */
export async function generateDailyReport() {
  const actor = await requireGenesisActor();
  const result = await runDailyCeoReport(actor.companyId, "human");
  await logAudit(actor, "report.generate", "reports", result.reportId);
  revalidatePath("/command");
  revalidatePath("/");
}

function statusJa(s: string) {
  const map: Record<string, string> = {
    live: "稼働中", building: "実装中", designing: "設計中", testing: "テスト中",
    planned: "計画", paused: "停止中", error: "エラー",
  };
  return map[s] ?? s;
}
