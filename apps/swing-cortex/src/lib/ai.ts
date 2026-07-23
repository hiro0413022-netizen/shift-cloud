import "server-only";

/**
 * Claude API クライアント（Genesis既存: ceo-ai / legal-ai / agent-runner と同型）。
 * ANTHROPIC_API_KEY があればClaude、無ければ null を返し呼び出し側がルール/テンプレにフォールバック。
 * モデルは CORTEX_AI_MODEL > CEO_AI_MODEL > 既定。
 */

export function hasClaudeKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.CORTEX_AI_MODEL || process.env.CEO_AI_MODEL || "claude-haiku-4-5-20251001";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1200,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

/** ```json ... ``` や前置きが混ざっても最初のJSONオブジェクトを取り出す */
export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
