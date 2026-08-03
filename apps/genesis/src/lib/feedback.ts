import "server-only";
import { createAdmin } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdmin>;

/* ============================================================
   修正指示の記録と学習（migration 0090 / gn_feedback）

   ユーザーが判断フィードで出した「ここを直して」を記録し、
   ① その場のAI書き直し ② 次回以降の文面生成 の両方に注入する。
   APIキーが無い環境では直接編集のみ動く（AI書き直しは明示エラー）。
   ============================================================ */

export type FeedbackSource = "revise" | "edit" | "reject";

export async function recordFeedback(
  admin: Admin,
  input: {
    companyId: string;
    contextKind: string;
    actionQueueId?: string | null;
    instruction: string;
    beforeText?: string | null;
    afterText?: string | null;
    source: FeedbackSource;
    createdBy?: string | null;
  }
): Promise<void> {
  await admin.from("gn_feedback").insert({
    company_id: input.companyId,
    context_kind: input.contextKind,
    action_queue_id: input.actionQueueId ?? null,
    instruction: input.instruction,
    before_text: input.beforeText ?? null,
    after_text: input.afterText ?? null,
    source: input.source,
    created_by: input.createdBy ?? null,
  });
}

/** 過去の修正指示を「学習ルール」として取得（新しい順・最大limit件） */
export async function getLearnedRules(admin: Admin, companyId: string, contextKind: string, limit = 10): Promise<string[]> {
  const { data } = await admin
    .from("gn_feedback")
    .select("instruction, source")
    .eq("company_id", companyId)
    .eq("context_kind", contextKind)
    .neq("instruction", "（直接編集）")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => String(r.instruction));
}

const REVISE_SYSTEM = [
  "あなたはゴルフ練習場YOZAN（GOLF WING / FRANK GOLF）のLINE配信文の編集者。",
  "与えられた現在の文面を、ユーザーの修正指示に従って書き直す。",
  "制約: 顧客に直接届く文章。社内数値・KPI・内部事情は書かない。絵文字は現状程度に。全角500字以内。",
  "過去の学習ルール（これまでの修正指示）にも常に従うこと。",
  "出力は書き直した本文のみ。前置き・説明・引用符は一切付けない。",
].join("\n");

/** ユーザーの修正指示でAIが文面を書き直す（過去の学習ルールも注入） */
export async function reviseWithAi(
  companyId: string,
  contextKind: string,
  currentBody: string,
  instruction: string
): Promise<{ ok: true; body: string } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY 未設定のためAI修正は使えません（直接編集は可能）" };

  const admin = createAdmin();
  const rules = await getLearnedRules(admin, companyId, contextKind).catch(() => []);
  const user = [
    rules.length > 0 ? `## 過去の学習ルール\n${rules.map((r) => `- ${r}`).join("\n")}` : null,
    `## 現在の文面\n${currentBody}`,
    `## 今回の修正指示\n${instruction}`,
  ]
    .filter(Boolean)
    .join("\n\n");

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
        max_tokens: 1000,
        system: REVISE_SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { ok: false, error: `AI修正に失敗（HTTP ${res.status}）` };
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    if (!text) return { ok: false, error: "AIの応答が空でした" };
    return { ok: true, body: text.slice(0, 2000) };
  } catch {
    return { ok: false, error: "AI修正がタイムアウトしました。もう一度お試しください" };
  }
}

/**
 * 文面生成時の学習適用（sales-loop等から呼ぶ）。
 * ベース文面に過去の学習ルールをAIで適用する。ルール無し/キー無し/失敗時はベースのまま返す。
 */
export async function applyLearnedRules(
  admin: Admin,
  companyId: string,
  contextKind: string,
  baseBody: string
): Promise<{ body: string; appliedRules: string[] }> {
  const rules = await getLearnedRules(admin, companyId, contextKind).catch(() => []);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (rules.length === 0 || !apiKey) return { body: baseBody, appliedRules: [] };

  const r = await reviseWithAi(companyId, contextKind, baseBody, "過去の学習ルールをすべて反映して自然に整えてください（内容の骨子は変えない）");
  if (!r.ok) return { body: baseBody, appliedRules: [] };
  return { body: r.body, appliedRules: rules };
}
