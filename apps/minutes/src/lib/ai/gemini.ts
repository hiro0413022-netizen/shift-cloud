import "server-only";
import { transcribeSystem, transcribeUser } from "./prompts";

/**
 * Gemini（L1 / L2 の処理先）
 *
 * 音声をそのまま渡せるので、文字起こしを1回で済ませられる（lesson-os と同じ業者・同じキー）。
 * 18MB を超える音声（持ち込みの長いファイル）は Files API に上げてから参照し、終わったら消す。
 *
 * ⚠ このファイルを直接 import してよいのは router.ts だけ。
 *    画面やAPIから Gemini を直接呼ぶと、機密レベルの振り分けをすり抜ける。
 */

const DEFAULT_MODEL = "gemini-3.5-flash";
const INLINE_MAX = 18 * 1024 * 1024;
const BASE = "https://generativelanguage.googleapis.com";

const key = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const model = () => process.env.MINUTES_MODEL || process.env.LESSON_NOTE_MODEL || DEFAULT_MODEL;

type GenResponse = { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] };

function textOf(json: GenResponse): { text: string; finish: string | null } {
  const c = json.candidates ?? [];
  return {
    text: c.flatMap((x) => x.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim(),
    finish: c[0]?.finishReason ?? null,
  };
}

async function fail(res: Response): Promise<never> {
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  throw new Error(`AIが応答しませんでした（HTTP ${res.status}）${detail ? `: ${detail}` : ""}`);
}

async function generate(body: unknown, timeoutMs: number): Promise<{ text: string; finish: string | null }> {
  const res = await fetch(`${BASE}/v1beta/models/${encodeURIComponent(model())}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) await fail(res);
  return textOf((await res.json()) as GenResponse);
}

/** Files API へ上げる（再開可能アップロードの start → upload,finalize）。ACTIVE になるまで待つ */
async function uploadFile(audio: ArrayBuffer, mime: string): Promise<{ uri: string; name: string }> {
  const start = await fetch(`${BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": key(),
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(audio.byteLength),
      "X-Goog-Upload-Header-Content-Type": mime,
      "content-type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: `minutes-${Date.now()}` } }),
  });
  if (!start.ok) await fail(start);
  const url = start.headers.get("x-goog-upload-url");
  if (!url) throw new Error("音声のアップロード先を受け取れませんでした");
  const up = await fetch(url, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize", "content-length": String(audio.byteLength) },
    body: Buffer.from(audio),
  });
  if (!up.ok) await fail(up);
  const info = (await up.json()) as { file?: { uri?: string; name?: string; state?: string } };
  const name = info.file?.name ?? "";
  const uri = info.file?.uri ?? "";
  if (!name || !uri) throw new Error("音声のアップロード結果を読めませんでした");
  let state = info.file?.state ?? "PROCESSING";
  for (let i = 0; i < 40 && state === "PROCESSING"; i += 1) {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await fetch(`${BASE}/v1beta/${name}`, { headers: { "x-goog-api-key": key() } });
    if (!g.ok) break;
    state = ((await g.json()) as { state?: string }).state ?? state;
  }
  if (state !== "ACTIVE") {
    await deleteFile(name);
    throw new Error("AI側で音声の準備が終わりませんでした。時間をおいてやり直してください");
  }
  return { uri, name };
}

async function deleteFile(name: string) {
  await fetch(`${BASE}/v1beta/${name}`, { method: "DELETE", headers: { "x-goog-api-key": key() } }).catch(() => {});
}

export async function geminiTranscribe(
  audio: ArrayBuffer,
  mime: string,
  opts: { participants?: string; prevTail?: string; segmentLabel?: string }
): Promise<{ text: string; truncated: boolean }> {
  let fileName: string | null = null;
  try {
    let part: unknown;
    if (audio.byteLength > INLINE_MAX) {
      const f = await uploadFile(audio, mime);
      fileName = f.name;
      part = { file_data: { mime_type: mime, file_uri: f.uri } };
    } else {
      part = { inline_data: { mime_type: mime, data: Buffer.from(audio).toString("base64") } };
    }
    const out = await generate(
      {
        system_instruction: { parts: [{ text: transcribeSystem() }] },
        contents: [{ role: "user", parts: [part, { text: transcribeUser(opts) }] }],
        generationConfig: { maxOutputTokens: 60000, temperature: 0 },
      },
      270000
    );
    return { text: out.text, truncated: out.finish === "MAX_TOKENS" };
  } finally {
    // L2 の約束「音声は即削除」は Google 側に置いた一時ファイルにも適用する
    if (fileName) await deleteFile(fileName);
  }
}

export async function geminiJson(system: string, user: string, maxTokens = 8000): Promise<unknown> {
  const out = await generate(
    {
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1, responseMimeType: "application/json" },
    },
    240000
  );
  if (!out.text) throw new Error("AIの返事が空でした");
  try {
    return JSON.parse(out.text);
  } catch {
    throw new Error(out.finish === "MAX_TOKENS" ? "AIの返事が長すぎて途中で切れました" : "AIの返事を読み取れませんでした");
  }
}
