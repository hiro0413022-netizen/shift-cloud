import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import {
  getCockpitData,
  computeGenesisScore,
  applyJudgmentPenalties,
  buildJudgmentList,
  logEvent,
  type CockpitData,
} from "@/lib/kernel";
import { summarizeInquiriesForReport, getInquiryStats, applyFilterRules, generateMissingDrafts } from "@/lib/secretary";
import { generateSuggestions, getOpenSuggestions } from "@/lib/suggestions";
import { runKpiIntegrityChecks } from "@/lib/kpi-checks";
import { runLegalChecks } from "@/lib/legal-checks";
import { runLegalAiExtraction } from "@/lib/legal-ai";
import { runReceiptAiExtraction } from "@/lib/receipt-ai";
import { generateDeliverables, type PromptForRun } from "@/lib/agent-runner";
import { enqueueAction } from "@/lib/ai-execution";

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

/** 指示案をAI社員宛てプロンプト（下書き）として保存し、対象AIの状態を更新。
    生成した指示書（成果物生成の入力になる）を返す */
async function saveInstructions(companyId: string, analysis: CeoAnalysis): Promise<PromptForRun[]> {
  if (analysis.instructions.length === 0) return [];
  const admin = createAdmin();
  const { data: agents } = await admin
    .from("ai_agents")
    .select("id, code, name")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  const byCode = new Map((agents ?? []).map((a) => [String(a.code), a]));

  const created: PromptForRun[] = [];
  for (const ins of analysis.instructions) {
    const agent = byCode.get(ins.agent_code);
    const { data: inserted } = await admin
      .from("prompts")
      .insert({
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
      })
      .select("id")
      .single();
    if (inserted?.id) {
      created.push({
        id: inserted.id,
        agent_id: agent?.id ?? null,
        agent_code: ins.agent_code,
        agent_name: agent?.name ?? ins.agent_code,
        instruction: ins.instruction,
      });
      // #63: 指示をexecutorのキュー経由でAI社員へ配布（内部・auto）。承認待ちにしない。
      await enqueueAction(admin, {
        companyId,
        actionType: "agent_directive",
        title: `${agent?.name ?? ins.agent_code} への指示`,
        payload: { agent_code: ins.agent_code, instruction: ins.instruction, prompt_id: inserted.id },
        originKind: "ceo_ai_daily",
        originId: inserted.id,
        dedupeKey: `agent-directive-${inserted.id}`,
        createdBy: null,
      }).catch(() => null);
    }
    if (agent) {
      await admin
        .from("ai_agents")
        .update({ current_status: "working", current_task: ins.instruction.slice(0, 120), last_run_at: new Date().toISOString() })
        .eq("id", agent.id);
    }
  }
  return created;
}

/** 日次レポート本体（VISION §1/§3の型）。actor無しでも実行可（Cron用） */
export async function runDailyCeoReport(companyId: string, triggeredBy: "human" | "cron"): Promise<{ score: number; reportId: string | null; engine: string }> {
  const admin = createAdmin();

  // 1. KPI再集計（労務＋財務＋会員系。会員系はmigration 0011適用後に有効化される — 未適用ならエラーを無視）
  await admin.rpc("refresh_shift_cloud_kpis", { p_company_id: companyId });
  await admin.rpc("refresh_golfwing_membership_forecast", { p_company_id: companyId }); // 当月の月会費予測を先に更新（実績があれば自動停止）
  await admin.rpc("refresh_finance_kpis", { p_company_id: companyId });
  await admin.rpc("refresh_member_kpis", { p_company_id: companyId }); // 0011未適用時はerrorが返るだけで無害

  // 1.4 秘書: 受信フィルタ（リッチメニュー押下を対応要件から外す）。ルールベースで速いのでレポート前に実行。
  //     返信案の下書き生成（Claude）は重いので、レポート保存後の「後工程」へ回す（DECISIONS #64）。
  await applyFilterRules(companyId).catch(() => 0);

  // 2. データ収集 → 分析（Claude → フォールバック: ルール）
  const d = await getCockpitData(companyId);
  // KPI整合性チェック（経費0円月/予測残存/売上急変/目標未設定）を判断リストの先頭に合流
  // — 「間違った数字でCEO AIが判断する」事故を止める（AUDIT_2026-07-11 D-4）
  const integrity = await runKpiIntegrityChecks(companyId, d.kpis).catch(() => []);
  // 契約の期限・リスク（Legal OS フェーズ2a）も判断リストへ合流
  const legal = await runLegalChecks(companyId).catch(() => []);
  const judgments = [...integrity, ...legal, ...buildJudgmentList(d)];
  // スコアは整合性・法務の警告も反映する（DECISIONS #43）。
  // 反映しないと「判断リストに警告3件あるのにスコア100点」になり、朝の一目で安心してしまう。
  const { score, factors } = applyJudgmentPenalties(computeGenesisScore(d), judgments);
  const startedAt = new Date().toISOString();
  const analysis = (await claudeAnalysis(d)) ?? ruleBasedAnalysis(d);

  // 3. 指示案をAI社員に振る（下書き保存）。DBのみなので速い。
  //    その指示書を入力にした成果物生成（DECISIONS #60・Claude数回）はレポート保存後の後工程へ。
  const createdPrompts = await saveInstructions(companyId, analysis);

  // 3.5 改善提案を生成（DECISIONS #52）。Cockpit/一覧に出て、そのまま実行指示にできる
  await generateSuggestions(companyId).catch(() => 0);
  const suggestions = await getOpenSuggestions(companyId, 5).catch(() => []);

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
    "## 改善提案（/suggestions で「指示を出す」を押すとそのまま実行指示になります）",
    suggestions.length === 0
      ? "- 提案なし"
      : suggestions
          .map(
            (s) =>
              `- [${s.severity === "critical" ? "最優先" : s.severity === "warning" ? "推奨" : "余力"}] ${s.title}\n    → 実行: ${
                s.suggested_action ?? "-"
              }${s.impact ? `（効果: ${s.impact}）` : ""}`
          )
          .join("\n"),
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

  // 6. スタッフ向けの朝の要約を executor に投入（#63）。
  //    試運転ポリシー(#63)により staff_directive は approval＝/executions で承認後にLINE配信。
  //    dedupeで1日1件。判断すべきことがあれば先頭に添える。
  try {
    const ymd = new Date().toISOString().slice(0, 10);
    const topJudge = judgments[0]?.title;
    const briefLines = [
      `おはようございます。本日のポイントです（${today}）。`,
      analysis.summary,
      analysis.sales_actions[0] ? `・重点: ${analysis.sales_actions[0]}` : "",
      topJudge ? `・確認: ${topJudge}` : "",
      "気になる点があれば店長・本部まで。",
    ].filter(Boolean);
    await enqueueAction(admin, {
      companyId,
      actionType: "staff_directive",
      title: `スタッフ朝連絡 ${today}`,
      payload: { body: briefLines.join("\n") },
      originKind: "ceo_ai_daily",
      originId: report?.id ?? null,
      dedupeKey: `staff-brief-${ymd}`,
      createdBy: null,
    });
  } catch {
    /* 連絡投入の失敗はレポート生成を止めない */
  }

  // 7. 後工程（DECISIONS #64）: Claudeを何度も呼ぶ重い処理は「レポートを保存し終えた後」にまとめる。
  //    ここで時間切れになっても、朝のレポートだけは必ず残る（2026-07-15〜17に日次が丸ごと欠落した事故の再発防止）。
  //    残り時間の予算を持たせ、超えたら静かに打ち切る（次の実行、または /api/cron/execute の10分tickで拾われる）。
  await runDailyAfterwork(companyId, createdPrompts);

  return { score, reportId: report?.id ?? null, engine: analysis.engine };
}

/**
 * 日次レポート保存後に回す重い処理。実行時間の予算内で、優先度順に「できるところまで」やる。
 * 呼び出し側（cron）のmaxDurationより短い予算にしておくこと。
 */
async function runDailyAfterwork(companyId: string, createdPrompts: Awaited<ReturnType<typeof saveInstructions>>): Promise<void> {
  const budgetMs = Number(process.env.DAILY_AFTERWORK_BUDGET_MS ?? 180_000);
  const deadline = Date.now() + budgetMs;
  const left = () => deadline - Date.now();

  const steps: Array<[string, () => Promise<unknown>]> = [
    // 成果物（/deliverables で承認）— 「指示は出たのに成果物が無い」を解消する本命なので先頭
    ["deliverables", () => generateDeliverables(companyId, createdPrompts)],
    // 朝、承認を押すだけにするための返信下書き
    ["drafts", () => generateMissingDrafts(companyId, 8)],
    // 契約書の抽出・証憑OCR（対象が無ければ即終わる）
    ["legal", () => runLegalAiExtraction(companyId)],
    ["receipt", () => runReceiptAiExtraction(companyId)],
  ];

  for (const [name, fn] of steps) {
    if (left() <= 5_000) break; // 残り僅かなら打ち切り
    try {
      await Promise.race([
        fn(),
        new Promise((resolve) => setTimeout(() => resolve(`timeout:${name}`), left())),
      ]);
    } catch {
      /* 個々の失敗は無視して次へ。レポートは既に保存済み */
    }
  }
}
