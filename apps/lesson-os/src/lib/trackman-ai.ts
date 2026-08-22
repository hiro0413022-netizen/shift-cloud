import "server-only";
import { TRACKMAN_FIELDS, sanitizeTrackman, type TrackmanValues } from "@/lib/trackman";

/**
 * トラックマン画面の写真をAIで読む（2026-08-22 ユーザー依頼）
 *
 * genesis の receipt-ai.ts（証憑OCR）と同じ作りにしてある:
 *   - ANTHROPIC_API_KEY 未設定なら何もしない（画面は手入力で使える）
 *   - 読めない項目は null。推測で埋めさせない
 *   - 出力はJSONのみ。返り値は必ず sanitize を通す（桁違いの誤読を落とす）
 *
 * 読み取り結果は「下書き」。保存前に必ずコーチが画面で確認・修正する。
 */

const MAX_BYTES = 5 * 1024 * 1024; // Claude APIの画像上限に余裕を持たせる
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export type TrackmanRead = {
  values: TrackmanValues;
  /** AIの生出力（人の修正前）。lsn_measurements.ai_raw に残して精度検証に使う */
  raw: unknown;
  club: string | null;
  warning: string | null;
};

const SYSTEM = [
  "あなたはゴルフ計測器トラックマン（TrackMan）の画面を読むアシスタント。",
  "渡された写真は1ショットの計測結果画面。表示されている数値をそのまま書き写す。",
  "厳守すること:",
  "- 写真に写っていない項目は null。絶対に推測・補完しない。",
  "- 単位の換算をしない。画面に出ている数値をそのまま返し、単位は units に文字列で入れる（例 \"m/s\" \"mph\" \"yd\" \"m\" \"°\" \"rpm\"）。",
  "- マイナス表示（左・ダウンブロー等）は符号を保つ。",
  "- 数字が切れている・ぼやけて読めない項目は null にする。",
  "出力は次のJSONのみ（前置き・説明文なし）:",
  "{",
  '  "club": "写真に写っているクラブ名（例 7I, DR）。無ければ null",',
  '  "values": { ' + TRACKMAN_FIELDS.map((f) => `"${f.key}"`).join(", ") + " },",
  '  "units": { "項目キー": "単位文字列" }',
  "}",
  "項目キーと画面表記の対応:",
  ...TRACKMAN_FIELDS.map((f) => `- ${f.key} = ${f.label}${f.unit ? `（既定単位 ${f.unit}）` : ""}`),
].join("\n");

export async function readTrackmanImage(
  bytes: ArrayBuffer,
  mimeType: string
): Promise<TrackmanRead | { error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { error: "AI読み取りは未設定です（ANTHROPIC_API_KEY）。数値は手で入力して保存できます" };
  }
  if (!ALLOWED.includes(mimeType)) return { error: "JPEG / PNG / WebP の写真にしてください" };
  if (bytes.byteLength > MAX_BYTES) return { error: "写真が大きすぎます（5MB以下）" };

  let text = "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.LESSON_AI_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 1200,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: Buffer.from(bytes).toString("base64") },
              },
              { type: "text", text: "この計測画面を読み取ってJSONだけ返してください。" },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return { error: `AIの応答が異常です（${res.status}）。手入力で保存できます` };
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  } catch {
    return { error: "AI読み取りに失敗しました（通信）。手入力で保存できます" };
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { error: "読み取り結果を解釈できませんでした。手入力で保存できます" };

  let parsed: { club?: unknown; values?: unknown; units?: unknown };
  try {
    parsed = JSON.parse(match[0]) as typeof parsed;
  } catch {
    return { error: "読み取り結果を解釈できませんでした。手入力で保存できます" };
  }

  const merged = { ...(parsed.values as Record<string, unknown> | undefined), _units: parsed.units };
  const values = sanitizeTrackman(merged);
  const read = Object.keys(values).filter((k) => k !== "_units").length;

  return {
    values,
    raw: parsed,
    club: typeof parsed.club === "string" && parsed.club.trim() ? parsed.club.trim().slice(0, 20) : null,
    warning:
      read === 0
        ? "数値を1つも読み取れませんでした。写真のピント・明るさを確認するか、手で入力してください"
        : read < 4
        ? `読み取れたのは${read}項目だけです。抜けている項目は手で入れてください`
        : null,
  };
}
