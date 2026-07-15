import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";

/* ============================================================
   Agent Runner — AI社員の「成果物」を生成する（DECISIONS #60 / migration 0060）
   これまで: CEO AI が毎朝、指示書（prompts, status=draft）まで作って止まっていた。
   ここ:      その指示書を入力に、実際の成果物（SNS投稿案・広告見出し等）を生成し、
              ai_execution_logs.output に保存（review_status='pending'）。
   受け皿:    /deliverables（成果物レビュー）に溜まり、古川さんは承認/却下を押すだけ。
   権限:      成果物＝下書きの生成まで。配信・課金・送信はしない（VISION §7）。
   ============================================================ */

export type PromptForRun = {
  id: string;
  agent_id: string | null;
  agent_code: string;
  agent_name: string;
  instruction: string;
};

/** 成果物の「型」を宛先AIごとに指定する。無い宛先は汎用テンプレにフォールバック */
const DELIVERABLE_GUIDE: Record<string, string> = {
  sns_ai: [
    "次の構成で、そのまま入稿できる成果物を作る:",
    "1. Instagram/TikTok 投稿案を3本（各: フック一言 / 本文 / CTA / ハッシュタグ8個 / 想定ビジュアルや尺）",
    "2. Google広告: 見出し5本（各30字以内）＋説明文2本（各90字以内）",
    "3. ターゲティング（地域・年齢・性別・興味関心キーワード）",
    "4. 予算配分（媒体別の日予算・配信期間・合計、予算上限があれば厳守）",
    "5. 効果目安（想定CPA・週あたり体験予約の見込み・見るべき指標）",
  ].join("\n"),
  sales_ai: [
    "次を含む、そのまま使える成果物を作る:",
    "1. アプローチ文面（メール/LINE/電話トーク）を2〜3案",
    "2. 対象リストの条件（誰に送るか）",
    "3. フォローの手順とタイミング",
  ].join("\n"),
  docs_ai: "指示された資料の本文ドラフトを、見出し付きでそのまま提出できる形で作る。",
  cs_ai: "問い合わせ対応・案内文のテンプレートを、シーン別にそのまま使える形で作る。",
};

const GENERIC_GUIDE =
  "指示に対する『成果物そのもの（そのまま使える下書き）』を、見出し付きの日本語Markdownで作る。分析の説明ではなく、実際に使える完成物を出す。";

/** ざっくり日本語トークン→円のコスト目安（Haiku想定・情報表示用） */
function estimateYen(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens / 1_000_000) * 0.8 + (outputTokens / 1_000_000) * 4;
  return Math.round(usd * 155);
}

/** 1件の指示書に対して成果物を生成し、ai_execution_logs に保存する */
async function generateOne(companyId: string, p: PromptForRun): Promise<"generated" | "skipped" | "failed"> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "skipped"; // 生成物なのでルールベース代替はしない。キー未設定なら下書きのまま
  const admin = createAdmin();

  const guide = DELIVERABLE_GUIDE[p.agent_code] ?? GENERIC_GUIDE;
  const system = [
    `あなたはYOZAN（GOLF WING/KALLINOS/RAC等を運営）の${p.agent_name}。`,
    "CEO AIからの指示に対して『成果物そのもの』を作成する担当。",
    "重要: 実行・配信・課金・送信・契約はしない。あくまで承認前の下書き（案）を作るだけ（VISION §7）。",
    "本丸はGOLF WING（ゴルフスクール/インドアゴルフ）。トーンは親しみやすく具体的に。",
    "出力は日本語Markdownの成果物本文のみ（前置き・自己言及・注釈は不要）。",
    "",
    "## 成果物の要件",
    guide,
  ].join("\n");

  const startedAt = new Date().toISOString();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.AGENT_AI_MODEL || process.env.CEO_AI_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 2200,
        system,
        messages: [{ role: "user", content: `指示:\n${p.instruction}` }],
      }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const output = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    if (!output) throw new Error("empty output");

    const inTok = json.usage?.input_tokens ?? 0;
    const outTok = json.usage?.output_tokens ?? 0;

    await admin.from("ai_execution_logs").insert({
      company_id: companyId,
      agent_id: p.agent_id,
      prompt_id: p.id,
      task: p.instruction.slice(0, 200),
      output,
      status: "succeeded",
      review_status: "pending",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      tokens_used: inTok + outTok,
      cost_estimate_yen: estimateYen(inTok, outTok),
      result_summary: `成果物を生成（${p.agent_name}）— レビュー待ち`,
    });

    // 指示書は「成果物生成済み」に進める（二重生成の防止）
    await admin.from("prompts").update({ status: "generated" }).eq("id", p.id);
    return "generated";
  } catch (e) {
    await admin.from("ai_execution_logs").insert({
      company_id: companyId,
      agent_id: p.agent_id,
      prompt_id: p.id,
      task: p.instruction.slice(0, 200),
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      result_summary: "成果物生成に失敗",
    });
    return "failed";
  }
}

/**
 * 指示書の束に対して成果物をまとめて生成する。
 * 毎朝の日次実行（runDailyCeoReport）と、手動再生成の両方から呼ぶ想定。
 * コスト暴発を避けるため limit で上限を切る（既定5＝日次の指示上限と同じ）。
 */
export async function generateDeliverables(companyId: string, prompts: PromptForRun[], limit = 5): Promise<number> {
  let made = 0;
  for (const p of prompts.slice(0, limit)) {
    const r = await generateOne(companyId, p);
    if (r === "generated") made++;
  }
  if (made > 0) {
    await logEvent(companyId, {
      event_type: "agent.deliverables",
      title: `AI社員の成果物を${made}件生成（レビュー待ち）`,
      source: "agent_runner",
      source_type: "ai",
    });
  }
  return made;
}
