import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { asOptions, asConfig, type AnswerValue, type Question, type QuestionType } from "@/lib/survey";

export type LoadedSurvey = {
  survey: { id: string; slug: string; title: string; status: string; response_count: number };
  questions: Question[];
  responseIds: string[];
  // 設問code → 回答値配列
  byCode: Map<string, AnswerValue[]>;
  // responseId → (code → 値)  ※CSVワイド出力用
  byResponse: Map<string, Map<string, AnswerValue>>;
  responses: { id: string; submitted_at: string }[];
};

export async function loadSurveyData(surveyId: string, companyId: string): Promise<LoadedSurvey | null> {
  const admin = createAdmin();

  const { data: survey } = await admin
    .from("svy_surveys")
    .select("id, slug, title, status, response_count, company_id")
    .eq("id", surveyId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!survey) return null;

  const { data: qs } = await admin
    .from("svy_questions")
    .select("id, survey_id, section, position, code, type, title, help_text, required, options, config")
    .eq("survey_id", survey.id)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  const questions: Question[] = (qs ?? []).map((q) => ({
    id: q.id as string,
    survey_id: q.survey_id as string,
    section: q.section as string | null,
    position: q.position as number,
    code: q.code as string,
    type: q.type as QuestionType,
    title: q.title as string,
    help_text: q.help_text as string | null,
    required: q.required as boolean,
    options: asOptions(q.options),
    config: asConfig(q.config),
  }));

  const { data: resps } = await admin
    .from("svy_responses")
    .select("id, submitted_at")
    .eq("survey_id", survey.id)
    .is("deleted_at", null)
    .order("submitted_at", { ascending: true });
  const responses = (resps ?? []).map((r) => ({ id: r.id as string, submitted_at: r.submitted_at as string }));
  const responseIds = responses.map((r) => r.id);

  const byCode = new Map<string, AnswerValue[]>();
  const byResponse = new Map<string, Map<string, AnswerValue>>();
  for (const r of responseIds) byResponse.set(r, new Map());

  if (responseIds.length > 0) {
    // 大量時のためにチャンク取得
    const chunk = 500;
    for (let i = 0; i < responseIds.length; i += chunk) {
      const ids = responseIds.slice(i, i + chunk);
      const { data: ans } = await admin
        .from("svy_answers")
        .select("response_id, question_code, value")
        .in("response_id", ids);
      for (const a of ans ?? []) {
        const code = a.question_code as string;
        const val = (a.value ?? {}) as AnswerValue;
        if (!byCode.has(code)) byCode.set(code, []);
        byCode.get(code)!.push(val);
        byResponse.get(a.response_id as string)?.set(code, val);
      }
    }
  }

  return {
    survey: { id: survey.id, slug: survey.slug, title: survey.title, status: survey.status, response_count: survey.response_count },
    questions,
    responseIds,
    byCode,
    byResponse,
    responses,
  };
}

/** 順位付け設問の短縮ラベル（ヒートマップ列見出し用） */
export function shortRankLabel(title: string): string {
  return title
    .replace(/プロを順位付けしてください。?$/, "")
    .replace(/を順位付けしてください。?$/, "")
    .replace(/と(感じる|思う)$/, "")
    .replace(/。$/, "")
    .trim();
}
