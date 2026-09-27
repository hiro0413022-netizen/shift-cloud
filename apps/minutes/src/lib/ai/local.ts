import "server-only";

/**
 * YOZAN専用LLMサーバー（L3 の処理先・フェーズ3で稼働）
 *
 * サーバー側は OpenAI 互換の口を2つ持つ前提にしておく（vLLM / Ollama / faster-whisper-server などが
 * そのまま話せる形）。こうしておけば、サーバーの中身（モデル・機種）を入れ替えてもこのファイルは変わらない。
 *   LOCAL_STT_BASE_URL  … /v1/audio/transcriptions（Whisper系）
 *   LOCAL_LLM_BASE_URL  … /v1/chat/completions（公開モデル）
 *   LOCAL_LLM_API_KEY   … 端末証明書/VPNに加えた合言葉（任意）
 *   LOCAL_LLM_MODEL / LOCAL_STT_MODEL … サーバーに載せたモデル名
 *
 * ⚠ フェーズ1では L3 の会議はそもそも作れない（levels.ts / DBのcheck制約）。
 *    ここは「切り替え口」を先に作っておくための実装で、実サーバーでの検証はフェーズ3で行う。
 *    話者の区別（誰が言ったか）は Whisper 単体では出ないので、フェーズ3でサーバー側に足す。
 */

const auth = (): Record<string, string> =>
  process.env.LOCAL_LLM_API_KEY ? { authorization: `Bearer ${process.env.LOCAL_LLM_API_KEY}` } : {};

const trimSlash = (s: string) => s.replace(/\/+$/, "");

export async function localTranscribe(audio: ArrayBuffer, mime: string): Promise<{ text: string; truncated: boolean }> {
  const base = process.env.LOCAL_STT_BASE_URL;
  if (!base) throw new Error("YOZANサーバー（文字起こし）が未設定です");
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mime }), "audio");
  form.append("model", process.env.LOCAL_STT_MODEL || "whisper-large-v3");
  form.append("language", "ja");
  form.append("response_format", "verbose_json");
  const res = await fetch(`${trimSlash(base)}/v1/audio/transcriptions`, {
    method: "POST",
    headers: auth(),
    body: form,
    signal: AbortSignal.timeout(280000),
  });
  if (!res.ok) throw new Error(`YOZANサーバーが応答しませんでした（HTTP ${res.status}）`);
  const json = (await res.json()) as { text?: string; segments?: { start?: number; text?: string }[] };
  const lines = (json.segments ?? [])
    .filter((s) => s.text?.trim())
    .map((s) => {
      const t = Math.floor(s.start ?? 0);
      return `[${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}] 話者: ${s.text!.trim()}`;
    });
  return { text: lines.length ? lines.join("\n") : (json.text ?? "").trim(), truncated: false };
}

export async function localJson(system: string, user: string, maxTokens = 8000): Promise<unknown> {
  const base = process.env.LOCAL_LLM_BASE_URL;
  if (!base) throw new Error("YOZANサーバー（LLM）が未設定です");
  const res = await fetch(`${trimSlash(base)}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth() },
    body: JSON.stringify({
      model: process.env.LOCAL_LLM_MODEL || "default",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(280000),
  });
  if (!res.ok) throw new Error(`YOZANサーバーが応答しませんでした（HTTP ${res.status}）`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("YOZANサーバーの返事を読み取れませんでした");
  }
}
