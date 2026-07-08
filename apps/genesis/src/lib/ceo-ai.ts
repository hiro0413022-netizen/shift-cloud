import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import {
  getCockpitData,
  computeGenesisScore,
  buildJudgmentList,
  logEvent,
  type CockpitData,
} from "@/lib/kernel";
import { summarizeInquiriesForReport, getInquiryStats } from "@/lib/secretary";

/* ============================================================
   CEO AI — 古川さんの分身（正典: docs/genesis/VISION.md §1/§3/§8）
   毎日出すもの: 何が起きているか / 何が危ないか / 何をすれば売上が上がるか /
   誰に何を指示すべきか / 今日判断すべきこと
   頭脳: ANTHROPIC_API_KEY があればClaude APIで実データ分析、
   無ければルールベースにフォールバック（レポートは必ず出る）
   権限: 分析・提案・指示案の下書きまで（VISION §7）。実行はしない
   ============================================================ */

export type CeoInstruction = { agent_code: string; instruction: string };
export type CeoAnalysis = {
  summary: string; // 今、会社で何が起きているか（2-3文）
  sales_actions: string[]; // 何をすれば売上が上がるか
  instructions: CeoInstruction[]; // 誰に何を指示すべきか
  engine: "claude" | "rules"; // どの頭脳で生成したか
};

/** LLM無しのフォールバック分析（決定的・説明可能） */
function ruleBasedAnalysis(d: CockpitData): CeoAnalysis {
  const kpi = (code: string) => d.kpis.find((k) => k.code === code);
  const disconnected = ["monthly_sales", "members", "trial_bookings", "churn_rate", "labor_cost_ratio"]
    .map((c) => kpi(c))
    .filter((k) => !k || k.current_value == null);

  const sales_actions: string[] = [];
  const instructions: CeoInstruction[] = [];

  if (disconnected.length > 0) {
    sales_actions.push(
      `売上の打ち手はまずデータから: 5大KPIのうち${disconnected.length}件が未接続。数字が入れば打ち手の精度が上がる（/finance と KPI手動更新で入力）`
    );
    instructions.push({
      agent_code: "analyst_ai",
      instruction: "未接続KPIの入力状況を監視し、揃い次第、前月比・目標比の異常検知レポートを作成する",
    });
  }
  const trial = kpi("trial_bookings");
  if (trial?.current_value != null && trial?.target_value != null && Number(trial.current_value) < Number(trial.target_value)) {
    const gap = Number(trial.target_value) - Number(trial.current_value);
    sales_actions.push(`体験予約が目標より${gap}件不足 → 体験導線の強化（SNS投稿・LINE配信・Web予約導線の見直し）`);
    instructions.push({ agent_code: "sns_ai", instruction: `体験レッスン誘導の投稿案を3本作成（不足${gap}件の穴埋め）` });
    instructions.push({ agent_code: "sales_ai", instruction: "過去の体験申込者で未入会のリストから掘り起こし文面を作成" });
  }
  const ratio = kpi("labor_cost_ratio");
  if (ratio?.current_value != null && ratio?.target_value != null && Number(ratio.current_value) > Number(ratio.target_value)) {
    instructions.push({ agent_code: "labor_ai", instruction: "人件費率が目標超過。シフトの過剰配置がないか来週分を点検し、調整案を提示" });
  }
  if (d.blockers.length > 0) {
    instructions.push({ agent_code: "pm_ai", instruction: `オープンブロッカー${d.blockers.length}件の解消計画を整理し、必要な判断を1つずつ明確化` });
  }

  const summary = `稼働モジュール${d.modules.filter((m) => m.status === "live").length}件、AI社員${d.agents.length}体。オープンリスク${d.risks.length}件・ブロッカー${d.blockers.length}件・承認待ち${d.approvals.length}件。`;
  return { summary, sales_actions, instructions, engine: "rules" };
}

/** Claude APIによる分析（VISION §3の型でJSONを返させる） */
async function claudeAnalysis(d: CockpitData): Promise<CeoAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const kpiLines = d.kpis.map(
    (k) =>
      `${k.name}(${k.code}): ${k.current_value ?? "未接続"}${k.unit}${k.target_value != null ? ` / 目標${k.target_value}${k.unit}` : ""}`
  );
  const agentList = d.agents.map((a) => `${a.code}=${a.name}`).join(", ");
  const dataSnapshot = [
    "## KPI",
    ...kpiLines,
    "## オープンリスク",
    ...d.risks.map((r) => `[${r.severity}] ${r.title}`),
    "## ブロッカー",
    ...d.blockers.map((b) => `${b.title}（解消条件: ${b.needs ?? "-"}）`),
    "## 承認待ち",
    `${d.approvals.length}件`,
    "## 直近イベント",
    ...d.recentEvents.slice(0, 8).map((e) => `${String(e.occurred_at).slice(0, 10)} ${e.title}`),
    "## 開発状況",
    ...d.devStatuses.map((s) => `${s.module_name}: ${s.progress}%（次: ${s.next_action ?? "-"}）`),
  ].join("\n");

  const system = [
    "あなたはYOZAN（GOLF WING/KALLINOS/RAC等を運営）のCEO AI。古川さん（代表）の分身として経営データを分析する。",
    "最重要KPI: 売上進捗・会員数・体験予約数/入会率・退会率・人件費率（本丸はGOLF WING）。",
    "権限: 分析・提案・指示案の作成まで。実行・送信・デプロイは提案のみ（承認は古川さん）。",
    "出力は必ず次のJSONのみ: {\"summary\": \"今何が起きているか2-3文\", \"sales_actions\": [\"売上を上げる具体的打ち手を最大3つ\"], \"instructions\": [{\"agent_code\": \"下記コードのいずれか\", \"instruction\": \"具体的な指示1文\"}] }",
    `agent_code候補: ${agentList}`,
  ].join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.CEO_AI_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: `本日の経営データ:\n${dataSnapshot}` }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { summary?: string; sales_actions?: string[]; instructions?: CeoInstruction[] };
    if (!parsed.summary) return null;
    return {
      summary: String(parsed.summary),
      sales_actions: (parsed.sales_actions ?? []).map(String).slice(0, 3),
      instructions: (parsed.instructions ?? [])
        .filter((i) => i && i.agent_code && i.instruction)
        .map((i) => ({ agent_code: String(i.agent_code), instruction: String(i.instruction) }))
        .slice(0, 5),
      engine: "claude",
    };
  } catch {
    return null;
  }
}

/** 指示案をAI社員宛てプロンプト（下書き）として保存し、対象AIの状態を更新 */
async function saveInstructions(companyId: string, analysis: CeoAnalysis) {
  if (analysis.instructions.length === 0) return;
  const admin = createAdmin();
  const { data: agents } = await admin
    .from("ai_agents")
    .select("id, code, name")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  const byCode = new Map((agents ?? []).map((a) => [String(a.code), a]));

  for (const ins of analysis.instructions) {
    const agent = byCode.get(ins.agent_code);
    await admin.from("prompts").insert({
      company_id: companyId,
      target_ai: "claude",
      title: `【CEO AI→${agent?.name ?? ins.agent_code}】${ins.instruction.slice(0, 60)}`,
      body: [
        `## CEO AIからの指示（${new Date().toLocaleDateString("ja-JP")}）`,
        `宛先: ${agent?.name ?? ins.agent_code}`,
        "",
        "## 指示内容",
        ins.instruction,
        "",
        "## 背景",
        "正典 docs/genesis/VISION.md（North Star）から逆算した本日の打ち手。分析・下書き・案の作成まで。実行（送信・デプロイ・課金・契約）は古川さんの承認必須（VISION §7）。",
      ].join("\n"),
      status: "draft",
      context: { generated_from: "ceo_ai_daily", agent_code: ins.agent_code, engine: analysis.engine },
    });
    if (agent) {
      await admin
        .from("ai_agents")
        .update({ current_status: "working", current_task: ins.instruction.slice(0, 120), last_run_at: new Date().toISOString() })
        .eq("id", agent.id);
    }
  }
}

/** 日次レポート本体（VISION §1/§3の型）。actor無しでも実行可（Cron用） */
export async function runDailyCeoReport(companyId: string, triggeredBy: "human" | "cron"): Promise<{ score: number; reportId: string | null; engine: string }> {
  const admin = createAdmin();

  // 1. KPI再集計（労務＋財務＋会員系。会員系はmigration 0011適用後に有効化される — 未適用ならエラーを無視）
  await admin.rpc("refresh_shift_cloud_kpis", { p_company_id: companyId });
  await admin.rpc("refresh_golfwing_membership_forecast", { p_company_id: companyId }); // 当月の月会費予測を先に更新（実績があれば自動停止）
  await admin.rpc("refresh_finance_kpis", { p_company_id: companyId });
  await admin.rpc("refresh_member_kpis", { p_company_id: companyId }); // 0011未適用時はerrorが返るだけで無害

  // 2. データ収集 → 分析（Claude → フォールバック: ルール）
  const d = await getCockpitData(companyId);
  const { score, factors } = computeGenesisScore(d);
  const judgments = buildJudgmentList(d);
  const startedAt = new Date().toISOString();
  const analysis = (await claudeAnalysis(d)) ?? ruleBasedAnalysis(d);

  // 3. 指示案をAI社員に振る（下書き保存）
  await saveInstructions(companyId, analysis);

  // 4. レポート組み立て
  const today = new Date().toLocaleDateString("ja-JP");
  const inquiryLines = await summarizeInquiriesForReport(companyId);
  const lines = [
    `# YOZAN GENESIS 日次レポート（${today}）`,
    "",
    `## 今日のYOZAN全体スコア: ${score}点`,
    factors.length === 0 ? "- 減点要因なし" : factors.map((f) => `- ${f}`).join("\n"),
    "",
    "## 今、会社で何が起きているか",
    analysis.summary,
    "",
    "## 今日、古川さんが判断すべきこと",
    judgments.length === 0
      ? "- なし（順調です）"
      : judgments.map((j, i) => `${i + 1}. ${j.title}${j.detail ? ` — ${j.detail}` : ""}`).join("\n"),
    "",
    "## 何が危ないか",
    d.risks.length === 0 && d.blockers.length === 0
      ? "- オープンなリスク・ブロッカーなし"
      : [
          ...d.blockers.map((b) => `- [ブロッカー] ${b.title}${b.needs ? `（解消条件: ${b.needs}）` : ""}`),
          ...d.risks.map((r) => `- [リスク/${r.severity}] ${r.title}${r.mitigation ? `（対策: ${r.mitigation}）` : ""}`),
        ].join("\n"),
    "",
    "## 何をすれば売上が上がるか",
    analysis.sales_actions.length === 0 ? "- （データ不足。KPI接続を進める）" : analysis.sales_actions.map((a) => `- ${a}`).join("\n"),
    "",
    "## 誰に何を指示すべきか（指示案は生成済み→Command Center）",
    analysis.instructions.length === 0
      ? "- 本日の新規指示なし"
      : analysis.instructions.map((i) => `- ${i.agent_code}: ${i.instruction}`).join("\n"),
    "",
    "## 未対応の問い合わせ（CEO Inboxで確認・承認）",
    inquiryLines.join("\n"),
    "",
    "## KPI（実データ）",
    ...d.kpis.map(
      (k) =>
        `- ${k.name}: ${k.current_value == null ? "未接続" : `${Number(k.current_value).toLocaleString("ja-JP")}${k.unit}`}${
          k.target_value != null ? `（目標 ${Number(k.target_value).toLocaleString("ja-JP")}${k.unit}）` : ""
        }`
    ),
    "",
    "## 開発状況",
    ...d.devStatuses.map(
      (s) => `- ${s.module_name}: ${s.progress}%（${String(s.status)}）${s.next_action ? ` / 次: ${s.next_action}` : ""}`
    ),
    "",
    `---`,
    `生成: CEO AI（${analysis.engine === "claude" ? "Claude分析" : "ルールベース"} / ${triggeredBy === "cron" ? "自動実行" : "手動実行"}）`,
  ].join("\n");

  const { data: report } = await admin
    .from("reports")
    .insert({
      company_id: companyId,
      report_type: "daily",
      title: `日次レポート ${today}（スコア${score}点）`,
      body: lines,
      generated_by: "ceo_ai",
      data: {
        score,
        engine: analysis.engine,
        triggered_by: triggeredBy,
        judgments: judgments.length,
        instructions: analysis.instructions.length,
        risks: d.risks.length,
        blockers: d.blockers.length,
        approvals: d.approvals.length,
        open_inquiries: (await getInquiryStats(companyId)).open,
      },
    })
    .select("id")
    .single();

  // 5. 実行ログ＋イベント記録
  const { data: ceoAgent } = await admin
    .from("ai_agents")
    .select("id")
    .eq("company_id", companyId)
    .eq("code", "ceo_ai")
    .single();
  await admin.from("ai_execution_logs").insert({
    company_id: companyId,
    agent_id: ceoAgent?.id ?? null,
    task: "日次経営分析・レポート生成",
    status: "succeeded",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    result_summary: `スコア${score}点 / 判断${judgments.length}件 / 指示案${analysis.instructions.length}件（${analysis.engine}）`,
  });
  if (ceoAgent) {
    await admin.from("ai_agents").update({ last_run_at: new Date().toISOString(), current_status: "idle", current_task: null }).eq("id", ceoAgent.id);
  }
  await logEvent(companyId, {
    event_type: "report.daily",
    title: `日次レポート生成（${today}・スコア${score}点・判断${judgments.length}件・指示案${analysis.instructions.length}件）`,
    source: "ceo_ai",
    source_type: "ai",
  });

  return { score, reportId: report?.id ?? null, engine: analysis.engine };
}
