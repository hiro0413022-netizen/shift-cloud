import "server-only";
import {
  buildReplySystem,
  buildReplyUser,
  parseReplyOutput,
  type ReplyRequest,
} from "./reply-kb.ts";

/* ============================================================
   返信文アシスタント（公式LINE・メール）
   - 事実は reply-kb.ts のナレッジだけ。AIはそこに無いことを書かない。
   - 「下書きを作る」まで。送信はスタッフが自分で行う（外部送信は人が押す / VISION §7）。
   - お客様の文面（個人情報を含みうる）はDBに保存しない。
   ============================================================ */

export type ReplyDraftResult = {
  reply: string;
  checks: string[];
  error: string | null;
};

const MODEL = process.env.REPLY_DRAFT_MODEL || process.env.ASK_DATA_MODEL || "claude-haiku-4-5-20251001";

export async function draftReply(req: ReplyRequest): Promise<ReplyDraftResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { reply: "", checks: [], error: "AI接続が未設定です（ANTHROPIC_API_KEY）。管理者に連絡してください。" };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1200,
        system: buildReplySystem(req.brand, req.channel),
        messages: [{ role: "user", content: buildReplyUser(req) }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      return { reply: "", checks: [], error: "AIの応答に失敗しました。少し待ってもう一度お試しください。" };
    }
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    const parsed = parseReplyOutput(text);
    if (!parsed.reply) {
      return { reply: "", checks: [], error: "返信文を作れませんでした。もう一度お試しください。" };
    }
    return { ...parsed, error: null };
  } catch {
    return { reply: "", checks: [], error: "AIの応答がタイムアウトしました。もう一度お試しください。" };
  }
}
