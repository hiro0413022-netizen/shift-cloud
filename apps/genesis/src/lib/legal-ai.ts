import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";

/* ============================================================
   legal_ai — 契約書の自動抽出（フェーズ2b / NEXT_TASKS 7・DECISIONS #40）
   アップロード済み契約書（PDF/画像）をClaude APIで読み、
   相手方・契約期間・自動更新・解約通知日数・リスク・要点を抽出して
   leg_documents へ「提案」として保存する（status=under_review、確定は人）。

   安全設計:
   - 人が入力済みの項目は上書きしない（nullの項目のみ埋める）
   - 提案の全文は detail.ai_extracted に保存（監査・やり直し可能）
   - ANTHROPIC_API_KEY 未設定なら何もしない（日次レポートは影響なし）
   - 1回の実行で1文書のみ（cronのタイムアウト・コスト管理）
   ============================================================ */

const MAX_FILE_BYTES = 4 * 1024 * 1024; // Claude APIに送る上限（約4MB）
const READABLE_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export type LegalAiRun = { processed: number; skipped: string | null; docTitle?: string };

type LegDocRow = {
  id: string;
  title: string;
  counterparty: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  auto_renew: boolean;
  renewal_notice_days: number | null;
  next_action_date: string | null;
  risk_level: string | null;
  summary: string | null;
  status: string;
  detail: Record<string, unknown> | null;
};

type Extraction = {
  counterparty?: string | null;
  effective_date?: string | null;
  expiry_date?: string | null;
  auto_renew?: boolean | null;
  renewal_notice_days?: number | null;
  risk_level?: "low" | "medium" | "high" | null;
  summary?: string | null;
  key_points?: string[];
  risks?: string[];
};

function isoDateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function runLegalAiExtraction(companyId: string): Promise<LegalAiRun> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { processed: 0, skipped: "no_api_key" };
  const admin = createAdmin();

  // 対象: 未抽出かつ主要項目が欠けている draft/under_review 文書（1件）
  const { data: docsData } = await admin
    .from("leg_documents")
    .select(
      "id, title, counterparty, effective_date, expiry_date, auto_renew, renewal_notice_days, next_action_date, risk_level, summary, status, detail"
    )
    .eq("company_id", companyId)
    .in("status", ["draft", "under_review"])
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(20);
  const docs = (docsData ?? []) as unknown as LegDocRow[];
  const target = docs.find(
    (d) =>
      !(d.detail ?? {})["ai_extracted"] &&
      (!d.counterparty || !d.expiry_date || !d.summary || !d.risk_level)
  );
  if (!target) return { processed: 0, skipped: "no_target" };

  // 読めるファイルを1つ選ぶ
  const { data: filesData } = await admin
    .from("leg_files")
    .select("id, storage_path, file_name, mime_type, size_bytes")
    .eq("company_id", companyId)
    .eq("document_id", target.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(5);
  const file = (filesData ?? []).find(
    (f) => READABLE_MIME.includes(String(f.mime_type)) && Number(f.size_bytes ?? 0) <= MAX_FILE_BYTES
  );
  if (!file) return { processed: 0, skipped: "no_readable_file", docTitle: target.title };

  const dl = await admin.storage.from("legal-docs").download(String(file.storage_path));
  if (!dl.data) return { processed: 0, skipped: "download_failed", docTitle: target.title };
  const b64 = Buffer.from(await dl.data.arrayBuffer()).toString("base64");
  const isPdf = String(file.mime_type) === "application/pdf";
  const fileBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
    : { type: "image", source: { type: "base64", media_type: String(file.mime_type), data: b64 } };

  const system = [
    "あなたはYOZANの法務AI。日本語の契約書・覚書・規約・NDAから事実を抽出する。",
    "推測で埋めない。書面から読み取れない項目は null にする。",
    "出力は次のJSONのみ（説明文なし）:",
    '{"counterparty": "相手方の会社名/氏名 or null", "effective_date": "YYYY-MM-DD or null", "expiry_date": "YYYY-MM-DD or null", "auto_renew": true/false/null, "renewal_notice_days": 数値 or null（解約通知は満了の何日前までか）, "risk_level": "low/medium/high or null", "summary": "契約の要点2-3文", "key_points": ["重要条項を最大5つ"], "risks": ["注意すべきリスクを最大3つ（無ければ空配列）"]}',
  ].join("\n");

  const startedAt = new Date().toISOString();
  let parsed: Extraction | null = null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.LEGAL_AI_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system,
        messages: [
          {
            role: "user",
            content: [
              fileBlock,
              { type: "text", text: `この書面（${target.title}）から情報を抽出してください。` },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return { processed: 0, skipped: `api_${res.status}`, docTitle: target.title };
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { processed: 0, skipped: "no_json", docTitle: target.title };
    parsed = JSON.parse(match[0]) as Extraction;
  } catch {
    return { processed: 0, skipped: "api_error", docTitle: target.title };
  }

  // 提案の反映: 人の入力を上書きしない（null/未設定の項目のみ埋める）
  const patch: Record<string, unknown> = {
    status: target.status === "draft" ? "under_review" : target.status,
    detail: {
      ...(target.detail ?? {}),
      ai_extracted: {
        at: new Date().toISOString(),
        model: process.env.LEGAL_AI_MODEL || "claude-haiku-4-5-20251001",
        file_id: file.id,
        proposal: parsed,
      },
    },
  };
  if (!target.counterparty && parsed.counterparty) patch.counterparty = String(parsed.counterparty);
  if (!target.effective_date && isoDateOrNull(parsed.effective_date)) patch.effective_date = parsed.effective_date;
  if (!target.expiry_date && isoDateOrNull(parsed.expiry_date)) patch.expiry_date = parsed.expiry_date;
  if (target.renewal_notice_days == null && typeof parsed.renewal_notice_days === "number") {
    patch.renewal_notice_days = Math.max(0, Math.floor(parsed.renewal_notice_days));
  }
  if (!target.risk_level && parsed.risk_level && ["low", "medium", "high"].includes(parsed.risk_level)) {
    patch.risk_level = parsed.risk_level;
  }
  if (!target.summary && parsed.summary) patch.summary = String(parsed.summary);

  // 解約判断期日の自動計算（未設定時のみ）
  const expiry = (patch.expiry_date as string | undefined) ?? target.expiry_date;
  const notice = (patch.renewal_notice_days as number | undefined) ?? target.renewal_notice_days;
  if (!target.next_action_date && expiry && notice != null) {
    const d = new Date(`${expiry}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - notice);
    patch.next_action_date = d.toISOString().slice(0, 10);
  }

  await admin.from("leg_documents").update(patch).eq("id", target.id).eq("company_id", companyId);

  // 全文検索の足がかり（要点をocr_textへ。全文転写はコスト過大のため行わない）
  const ocrDigest = [parsed.summary ?? "", ...(parsed.key_points ?? []), ...(parsed.risks ?? [])]
    .filter(Boolean)
    .join("\n");
  if (ocrDigest) {
    await admin.from("leg_files").update({ ocr_text: ocrDigest }).eq("id", file.id);
  }

  // リマインダー生成（この文書にscheduledが1件も無い場合のみ）
  const { count } = await admin
    .from("leg_reminders")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("document_id", target.id)
    .eq("status", "scheduled")
    .is("deleted_at", null);
  if ((count ?? 0) === 0) {
    const reminders: Array<Record<string, unknown>> = [];
    const nextAction = (patch.next_action_date as string | undefined) ?? target.next_action_date;
    if (nextAction) {
      reminders.push({
        company_id: companyId,
        document_id: target.id,
        kind: "termination_notice",
        due_date: nextAction,
        lead_days: 30,
        note: "legal_ai抽出から自動生成（解約通知期限）",
      });
    }
    if (expiry) {
      reminders.push({
        company_id: companyId,
        document_id: target.id,
        kind: "expiry",
        due_date: expiry,
        lead_days: 30,
        note: "legal_ai抽出から自動生成（契約満了）",
      });
    }
    if (reminders.length > 0) await admin.from("leg_reminders").insert(reminders);
  }

  // 実行ログ・イベント
  const { data: agent } = await admin
    .from("ai_agents")
    .select("id")
    .eq("company_id", companyId)
    .eq("code", "legal_ai")
    .maybeSingle();
  await admin.from("ai_execution_logs").insert({
    company_id: companyId,
    agent_id: agent?.id ?? null,
    task: `契約書の自動抽出: ${target.title}`,
    status: "succeeded",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    result_summary: `相手方/期間/リスクを抽出し提案保存（status=under_review、確定は人）`,
  });
  await logEvent(companyId, {
    event_type: "legal.ai_extracted",
    title: `legal_ai: 「${target.title}」の内容を抽出（確認待ち）`,
    source: "legal_ai",
    source_type: "ai",
  });

  return { processed: 1, skipped: null, docTitle: target.title };
}
