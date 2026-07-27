import "server-only";

/**
 * AIクライアント（Claude / Gemini 両対応）。
 *
 * 呼び出し側は `callAi({system, user})` だけを使う。プロバイダはenvで切り替わり、
 * キーが無い／API失敗のときは `null` を返して呼び出し側がテンプレにフォールバックする
 * （＝出力は必ず返る）という Genesis 共通の作法は維持する。
 *
 * env:
 *   CORTEX_AI_PROVIDER = "claude" | "gemini"   … 明示指定（省略時はキーの有無で自動判定）
 *   ANTHROPIC_API_KEY                          … Claude
 *   GEMINI_API_KEY / GOOGLE_API_KEY            … Gemini
 *   CORTEX_AI_MODEL > CEO_AI_MODEL > 既定       … Claude用モデル
 *   CORTEX_GEMINI_MODEL > 既定                  … Gemini用モデル（既定 gemini-3.5-flash）
 *   CORTEX_GEMINI_THINKING                     … 思考の強さ（3系: minimal|low|medium|high / 2.5系: 数値, 0=off）
 */

export type AiProvider = "claude" | "gemini";

const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

function claudeKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY || undefined;
}
function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

/**
 * 使用するプロバイダを決める。
 * 明示指定があればそれを優先し、そのキーが無ければもう一方へフォールバック。
 */
export function resolveProvider(): AiProvider | null {
  const want = (process.env.CORTEX_AI_PROVIDER || "").trim().toLowerCase();
  if (want === "gemini") return geminiKey() ? "gemini" : claudeKey() ? "claude" : null;
  if (want === "claude" || want === "anthropic") return claudeKey() ? "claude" : geminiKey() ? "gemini" : null;
  if (claudeKey()) return "claude";
  if (geminiKey()) return "gemini";
  return null;
}

/** AIが使える状態か（キーが1つでもあるか） */
export function hasAiKey(): boolean {
  return resolveProvider() !== null;
}

/** @deprecated `hasAiKey()` を使う。既存呼び出しの互換用。 */
export function hasClaudeKey(): boolean {
  return hasAiKey();
}

export type AiCallOptions = {
  system: string;
  user: string;
  maxTokens?: number;
  /** JSONだけを返してほしいとき（GeminiはresponseMimeTypeで強制、Claudeはプロンプト側で担保） */
  json?: boolean;
  /** 既定のプロバイダ判定を上書きしたいとき */
  provider?: AiProvider;
};

/** Anthropic Messages API */
async function callClaudeApi(opts: AiCallOptions): Promise<string | null> {
  const apiKey = claudeKey();
  if (!apiKey) return null;
  const model = process.env.CORTEX_AI_MODEL || process.env.CEO_AI_MODEL || DEFAULT_CLAUDE_MODEL;
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

/**
 * 思考(thinking)の設定。Geminiの3系は`thinkingLevel`、2.5系は`thinkingBudget`。
 * レッスンコメント生成は「深い推論」より速さ・安さが効くので既定は最小。
 * `CORTEX_GEMINI_THINKING` で上書き可（3系: minimal|low|medium|high / 2.5系: 数値トークン, 0=off, -1=動的）。
 */
function thinkingConfig(model: string): Record<string, unknown> | null {
  const want = (process.env.CORTEX_GEMINI_THINKING || "").trim();
  const isGen3 = /gemini-3/.test(model);
  if (isGen3) return { thinkingLevel: want || "low" };
  if (/gemini-2\.5/.test(model)) {
    const n = want === "" ? 0 : Number(want);
    return Number.isFinite(n) ? { thinkingBudget: n } : { thinkingBudget: 0 };
  }
  return want ? { thinkingLevel: want } : null;
}

/**
 * Google Gemini generateContent API。
 * - `system` は `system_instruction` へ（Anthropicの`system`相当）
 * - `json:true` で `responseMimeType: application/json`（構造化出力）
 * - **思考トークンも maxOutputTokens を食う**ため、上限は余裕をもって渡す（足りないと本文が空で返る）
 */
async function callGeminiApi(opts: AiCallOptions): Promise<string | null> {
  const apiKey = geminiKey();
  if (!apiKey) return null;
  const model = process.env.CORTEX_GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const thinking = thinkingConfig(model);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts: [{ text: opts.user }] }],
          generationConfig: {
            maxOutputTokens: Math.max(4096, (opts.maxTokens ?? 1200) * 3),
            temperature: 0.7,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
            ...(thinking ? { thinkingConfig: thinking } : {}),
          },
        }),
        signal: AbortSignal.timeout(40000),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const text = (json.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .filter((p) => !p.thought) // 思考サマリは本文から除く
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch {
    return null;
  }
}

/**
 * プロバイダ非依存の呼び出し口。失敗時は `null`（呼び出し側がテンプレへ）。
 * 片方のプロバイダが落ちても、もう一方のキーがあれば自動でリトライする。
 */
export async function callAi(opts: AiCallOptions): Promise<string | null> {
  const provider = opts.provider ?? resolveProvider();
  if (!provider) return null;

  const primary = provider === "gemini" ? callGeminiApi : callClaudeApi;
  const first = await primary(opts);
  if (first) return first;

  // フェイルオーバー（もう一方のキーがあるときだけ）
  const other: AiProvider = provider === "gemini" ? "claude" : "gemini";
  const otherHasKey = other === "gemini" ? !!geminiKey() : !!claudeKey();
  if (!otherHasKey) return null;
  return other === "gemini" ? callGeminiApi(opts) : callClaudeApi(opts);
}

/** @deprecated `callAi()` を使う。既存呼び出しの互換用。 */
export async function callClaude(opts: AiCallOptions): Promise<string | null> {
  return callAi(opts);
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
