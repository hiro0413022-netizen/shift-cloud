/**
 * Model Router（Final Architecture §1 横串・Proposal 11章）
 *
 * llm.call({task, privacy}) の1か所に集める。13ファイルに散った fetch 直書きはここへ寄せていく。
 *   classify / extract / sql / summary … haiku（速い・安い）
 *   plan / analyze / merge / draft     … sonnet（品質）
 *   L3（弁護士・契約）                  … Local LLM だけ。無ければエラーで止まる（外に出さない）
 * 呼び出しは gn_llm_calls に記録し、Developer Dashboard の LLM Call / Cost になる。
 */
import type { AdminLike } from "./tool.ts";

export type LlmTask = "classify" | "extract" | "sql" | "summary" | "plan" | "analyze" | "merge" | "draft" | "code";
export type Privacy = "L1" | "L2" | "L3";
export type Provider = "anthropic" | "local";

export type LlmMessage = { role: "user" | "assistant"; content: string };

export type LlmCallInput = {
  task: LlmTask;
  privacy?: Privacy;
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  timeoutMs?: number;
  /** 記録用 */
  admin?: AdminLike;
  companyId?: string | null;
  tool?: string | null;
  /** 明示指定（テスト・移行期の互換） */
  model?: string;
};

export type LlmCallResult = {
  text: string | null;
  model: string;
  provider: Provider;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  ok: boolean;
  error?: string | null;
};

const HAIKU = process.env.GENESIS_MODEL_FAST || "claude-haiku-4-5-20251001";
const SONNET = process.env.GENESIS_MODEL_SMART || "claude-sonnet-4-5-20250929";

/** 概算単価（USD / 1M tokens）。請求の正ではなく Dashboard の目安 */
const PRICE: Record<string, { in: number; out: number }> = {
  [HAIKU]: { in: 1, out: 5 },
  [SONNET]: { in: 3, out: 15 },
};

export function pickModel(task: LlmTask, privacy: Privacy = "L1"): { model: string; provider: Provider } {
  if (privacy === "L3") return { model: process.env.LOCAL_LLM_MODEL || "local", provider: "local" };
  switch (task) {
    case "classify":
    case "extract":
    case "sql":
    case "summary":
      return { model: HAIKU, provider: "anthropic" };
    default:
      return { model: SONNET, provider: "anthropic" };
  }
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICE[model];
  if (!p) return 0;
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
}

async function callAnthropic(model: string, input: LlmCallInput): Promise<LlmCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const started = Date.now();
  if (!apiKey) return { text: null, model, provider: "anthropic", inputTokens: 0, outputTokens: 0, durationMs: 0, ok: false, error: "ANTHROPIC_API_KEY 未設定" };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: input.maxTokens ?? 1024, system: input.system, messages: input.messages }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 45_000),
    });
    const durationMs = Date.now() - started;
    if (!res.ok) return { text: null, model, provider: "anthropic", inputTokens: 0, outputTokens: 0, durationMs, ok: false, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    return {
      text: text || null,
      model,
      provider: "anthropic",
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
      durationMs,
      ok: !!text,
      error: text ? null : "empty",
    };
  } catch (e) {
    return { text: null, model, provider: "anthropic", inputTokens: 0, outputTokens: 0, durationMs: Date.now() - started, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function callLocal(model: string, input: LlmCallInput): Promise<LlmCallResult> {
  const url = process.env.LOCAL_LLM_URL; // 例: http://yozan-llm.local:11434/v1/chat/completions（OpenAI互換）
  const started = Date.now();
  if (!url) return { text: null, model, provider: "local", inputTokens: 0, outputTokens: 0, durationMs: 0, ok: false, error: "LOCAL_LLM_URL 未設定（L3 は外部AIに出せません）" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: input.system }, ...input.messages], max_tokens: input.maxTokens ?? 1024 }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 120_000),
    });
    const durationMs = Date.now() - started;
    if (!res.ok) return { text: null, model, provider: "local", inputTokens: 0, outputTokens: 0, durationMs, ok: false, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    return { text: text || null, model, provider: "local", inputTokens: json.usage?.prompt_tokens ?? 0, outputTokens: json.usage?.completion_tokens ?? 0, durationMs, ok: !!text, error: text ? null : "empty" };
  } catch (e) {
    return { text: null, model, provider: "local", inputTokens: 0, outputTokens: 0, durationMs: Date.now() - started, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function llmCall(input: LlmCallInput): Promise<LlmCallResult> {
  const picked = pickModel(input.task, input.privacy);
  const model = input.model ?? picked.model;
  const result = picked.provider === "local" ? await callLocal(model, input) : await callAnthropic(model, input);
  if (input.admin && input.companyId) {
    try {
      await input.admin.from("gn_llm_calls").insert({
        company_id: input.companyId,
        task: input.task,
        privacy: input.privacy ?? "L1",
        provider: result.provider,
        model: result.model,
        tool: input.tool ?? null,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost_usd: estimateCostUsd(result.model, result.inputTokens, result.outputTokens),
        duration_ms: result.durationMs,
        ok: result.ok,
        error: result.error ?? null,
      });
    } catch {
      /* 記録失敗で本処理を止めない */
    }
  }
  return result;
}
