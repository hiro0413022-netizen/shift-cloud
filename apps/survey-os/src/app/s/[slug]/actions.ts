"use server";

import { z } from "zod";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import { asOptions, asConfig, type AnswerValue, type QuestionType } from "@/lib/survey";

export type SubmitState = { ok?: boolean; error?: string };

const answerSchema = z.object({
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
  other: z.string().optional(),
  text: z.string().optional(),
  order: z.array(z.string()).optional(),
});
const payloadSchema = z.record(z.string(), answerSchema);

/** 公開回答の送信（匿名・トークンレス、slug + status='open' を検証） */
export async function submitSurvey(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const slug = String(formData.get("slug") ?? "");
  const clientKey = String(formData.get("client_key") ?? "").slice(0, 64) || null;
  const raw = String(formData.get("payload") ?? "{}");

  let parsed: Record<string, AnswerValue>;
  try {
    parsed = payloadSchema.parse(JSON.parse(raw));
  } catch {
    return { error: "回答データの形式が正しくありません。" };
  }

  const admin = createAdmin();
  const { data: survey } = await admin
    .from("svy_surveys")
    .select("id, company_id, status, thanks_text")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!survey) return { error: "アンケートが見つかりません。" };
  if (survey.status !== "open") return { error: "このアンケートは現在受付を終了しています。" };

  const { data: qs } = await admin
    .from("svy_questions")
    .select("id, code, type, title, required, options, config")
    .eq("survey_id", survey.id)
    .is("deleted_at", null);

  const questions = (qs ?? []) as Array<{
    id: string; code: string; type: QuestionType; title: string; required: boolean; options: unknown; config: unknown;
  }>;

  // 必須チェック
  for (const q of questions) {
    if (!q.required) continue;
    const a = parsed[q.code];
    const answered =
      !!a &&
      ((a.value != null && a.value !== "") ||
        (a.values != null && a.values.length > 0) ||
        (a.text != null && a.text.trim() !== "") ||
        (a.order != null && a.order.length > 0));
    if (!answered) return { error: `「${q.title}」は必須です。` };
  }

  // 回答行を構築（既知の設問のみ・値をサニタイズ）
  const byCode = new Map(questions.map((q) => [q.code, q]));
  const rows: { question_id: string; question_code: string; value: AnswerValue }[] = [];
  for (const [code, a] of Object.entries(parsed)) {
    const q = byCode.get(code);
    if (!q) continue;
    const opts = asOptions(q.options);
    const cfg = asConfig(q.config);
    const optValues = new Set(opts.map((o) => o.value));
    const poolValues = new Set((cfg.pool ?? opts).map((o) => o.value));
    let value: AnswerValue = {};
    switch (q.type) {
      case "single":
      case "scale":
        if (a.value && optValues.has(a.value)) value = { value: a.value };
        break;
      case "multi": {
        const vals = (a.values ?? []).filter((v) => optValues.has(v));
        value = { values: vals };
        if (cfg.allow_other && a.other) value.other = a.other.slice(0, 500);
        break;
      }
      case "text":
      case "textarea":
        if (a.text) value = { text: a.text.slice(0, 2000) };
        break;
      case "ranking": {
        const order = (a.order ?? []).filter((v) => poolValues.has(v));
        if (order.length > 0) value = { order };
        break;
      }
    }
    const hasContent =
      value.value != null || (value.values && value.values.length) || value.text || (value.order && value.order.length) || value.other;
    if (hasContent) rows.push({ question_id: q.id, question_code: code, value });
  }

  if (rows.length === 0) return { error: "回答が入力されていません。" };

  // 挿入（response → answers）
  const { data: resp, error: rErr } = await admin
    .from("svy_responses")
    .insert({ company_id: survey.company_id, survey_id: survey.id, client_key: clientKey })
    .select("id")
    .single();
  if (rErr || !resp) return { error: "送信に失敗しました。時間をおいて再度お試しください。" };

  const { error: aErr } = await admin.from("svy_answers").insert(
    rows.map((r) => ({
      company_id: survey.company_id,
      response_id: resp.id,
      question_id: r.question_id,
      question_code: r.question_code,
      value: r.value,
    }))
  );
  if (aErr) return { error: "送信に失敗しました。時間をおいて再度お試しください。" };

  // 回答数キャッシュを更新
  const { count } = await admin
    .from("svy_responses")
    .select("id", { count: "exact", head: true })
    .eq("survey_id", survey.id)
    .is("deleted_at", null);
  await admin.from("svy_surveys").update({ response_count: count ?? 0 }).eq("id", survey.id);

  // 節目でCompany Eventに記録（10件ごと・ノイズ抑制）
  if (count != null && count % 10 === 0) {
    await logEvent(survey.company_id, {
      event_type: "survey_milestone",
      title: `アンケート回答が${count}件に到達`,
      description: `slug=${slug}`,
      source: "survey-os",
      source_type: "system",
      severity: "info",
      tags: ["survey"],
    });
  }

  return { ok: true };
}
