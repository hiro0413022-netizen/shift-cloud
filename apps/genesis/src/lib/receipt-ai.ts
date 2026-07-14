import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";

/* ============================================================
   経理AI（フェーズ1）— 証憑のOCR自動読取（DECISIONS #42）
   mon_receipts にアップロードされたレシート・請求書の画像/PDFを
   Claude APIで読み、発行日・金額・発行元・種別を読み取って
   「空欄の項目だけ」埋める（人が入力済みの値は上書きしない）。

   経費の自動起票（mon_expenseへのinsert）はフェーズ2 —
   まず読取精度を実運用で確認してから（VISION §7の段階導入）。

   legal-ai.ts と同じ安全設計:
   - ANTHROPIC_API_KEY 未設定なら何もしない
   - 1回の実行で最大3件（コスト・タイムアウト管理）
   - 読取済みの目印は ocr_text（nullのみ対象）
   ============================================================ */

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const READABLE_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const BATCH = 3;

type ReceiptRow = {
  id: string;
  kind: string;
  issue_date: string | null;
  counterparty: string | null;
  amount: number | null;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

type ReceiptExtraction = {
  kind?: "invoice" | "quote" | "receipt" | "delivery" | "other" | null;
  issue_date?: string | null;
  counterparty?: string | null;
  total_amount?: number | null;
  tax_amount?: number | null;
  line_summary?: string | null;
};

export type ReceiptAiRun = { processed: number; skipped: string | null };

function isoDateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function runReceiptAiExtraction(companyId: string): Promise<ReceiptAiRun> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { processed: 0, skipped: "no_api_key" };
  const admin = createAdmin();

  // 対象: 未読取（ocr_text null）かつ主要項目が欠けている証憑（最大3件/日）
  const { data } = await admin
    .from("mon_receipts")
    .select("id, kind, issue_date, counterparty, amount, storage_path, file_name, mime_type, size_bytes")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .is("ocr_text", null)
    .or("issue_date.is.null,amount.is.null,counterparty.is.null")
    .order("created_at", { ascending: true })
    .limit(BATCH * 2);
  const targets = ((data ?? []) as unknown as ReceiptRow[])
    .filter(
      (r) => READABLE_MIME.includes(String(r.mime_type)) && Number(r.size_bytes ?? 0) <= MAX_FILE_BYTES
    )
    .slice(0, BATCH);
  if (targets.length === 0) return { processed: 0, skipped: "no_target" };

  const system = [
    "あなたはYOZANの経理AI。日本のレシート・請求書・領収書・見積書から事実を読み取る。",
    "推測で埋めない。読み取れない項目は null。金額は税込合計を整数円で。",
    "出力は次のJSONのみ:",
    '{"kind": "invoice/quote/receipt/delivery/other", "issue_date": "YYYY-MM-DD or null", "counterparty": "発行元の店名・会社名 or null", "total_amount": 整数円 or null, "tax_amount": 整数円 or null, "line_summary": "内容の要約1行（例: ガソリン代 / 事務用品3点）"}',
  ].join("\n");

  let processed = 0;
  for (const r of targets) {
    const dl = await admin.storage.from("mon-receipts").download(r.storage_path);
    if (!dl.data) continue;
    const b64 = Buffer.from(await dl.data.arrayBuffer()).toString("base64");
    const isPdf = String(r.mime_type) === "application/pdf";
    const fileBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
      : { type: "image", source: { type: "base64", media_type: String(r.mime_type), data: b64 } };

    let parsed: ReceiptExtraction | null = null;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.RECEIPT_AI_MODEL || "claude-haiku-4-5-20251001",
          max_tokens: 500,
          system,
          messages: [
            { role: "user", content: [fileBlock, { type: "text", text: "この証憑を読み取ってください。" }] },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      parsed = JSON.parse(match[0]) as ReceiptExtraction;
    } catch {
      continue;
    }

    // 空欄のみ埋める（人の入力は上書きしない）。ocr_text=読取ダイジェスト（再処理の目印を兼ねる）
    const patch: Record<string, unknown> = {
      ocr_text: [
        parsed.line_summary ?? "",
        parsed.counterparty ? `発行元: ${parsed.counterparty}` : "",
        parsed.total_amount != null ? `合計: ${parsed.total_amount}円` : "",
        parsed.issue_date ? `日付: ${parsed.issue_date}` : "",
      ]
        .filter(Boolean)
        .join("\n") || "（読取結果なし）",
    };
    if (!r.issue_date && isoDateOrNull(parsed.issue_date)) patch.issue_date = parsed.issue_date;
    if (!r.counterparty && parsed.counterparty) patch.counterparty = String(parsed.counterparty);
    if (r.amount == null && typeof parsed.total_amount === "number" && parsed.total_amount > 0) {
      patch.amount = Math.floor(parsed.total_amount);
    }
    if (
      r.kind === "receipt" && // 既定値のままの行のみ種別提案を反映
      parsed.kind &&
      ["invoice", "quote", "receipt", "delivery", "other"].includes(parsed.kind)
    ) {
      patch.kind = parsed.kind;
    }

    await admin.from("mon_receipts").update(patch).eq("id", r.id).eq("company_id", companyId);
    processed += 1;
  }

  if (processed > 0) {
    const { data: agent } = await admin
      .from("ai_agents")
      .select("id")
      .eq("company_id", companyId)
      .eq("code", "finance_ai")
      .maybeSingle();
    await admin.from("ai_execution_logs").insert({
      company_id: companyId,
      agent_id: agent?.id ?? null,
      task: `証憑OCR読取 ${processed}件`,
      status: "succeeded",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      result_summary: `発行日・金額・発行元を読取り空欄を補完（人の入力は上書きせず。起票はフェーズ2）`,
    });
    await logEvent(companyId, {
      event_type: "money.receipt_ocr",
      title: `経理AI: 証憑${processed}件を自動読取（/receiptsで確認）`,
      source: "finance_ai",
      source_type: "ai",
    });
  }

  return { processed, skipped: processed === 0 ? "all_failed" : null };
}
