import Link from "next/link";
import { requireSurveyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { asOptions, asConfig, type Question, type QuestionType } from "@/lib/survey";
import { Panel, Empty } from "@/components/ui";
import { Editor, type SurveyMeta, type DeletedQuestion } from "./editor";

export const dynamic = "force-dynamic";

export default async function EditPage({ params }: { params: Promise<{ surveyId: string }> }) {
  const { surveyId } = await params;
  const actor = await requireSurveyActor();
  const admin = createAdmin();

  const { data: sv } = await admin
    .from("svy_surveys")
    .select("id, company_id, slug, title, description, purpose, status, is_anonymous, intro_text, thanks_text, est_minutes")
    .eq("id", surveyId)
    .is("deleted_at", null)
    .maybeSingle();
  const survey = sv as unknown as (SurveyMeta & { id: string; company_id: string }) | null;
  if (!survey || survey.company_id !== actor.companyId) {
    return <Panel><Empty>アンケートが見つかりません。</Empty></Panel>;
  }

  const { data: qs } = await admin
    .from("svy_questions")
    .select("id, survey_id, section, position, code, type, title, help_text, required, options, config")
    .eq("survey_id", surveyId)
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

  const { data: del } = await admin
    .from("svy_questions")
    .select("id, code, type, title, deleted_at")
    .eq("survey_id", surveyId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  const deletedQuestions: DeletedQuestion[] = (del ?? []).map((q) => ({
    id: q.id as string,
    code: q.code as string,
    type: q.type as QuestionType,
    title: q.title as string,
    deleted_at: q.deleted_at as string,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-xs text-accent">← 一覧</Link>
        <Link href={`/${surveyId}/results`} className="text-xs text-accent">集計を見る →</Link>
      </div>
      <Editor
        surveyId={surveyId}
        meta={{
          title: survey.title,
          description: survey.description,
          purpose: survey.purpose,
          slug: survey.slug,
          status: survey.status,
          is_anonymous: survey.is_anonymous,
          intro_text: survey.intro_text,
          thanks_text: survey.thanks_text,
          est_minutes: survey.est_minutes,
        }}
        questions={questions}
        deletedQuestions={deletedQuestions}
      />
    </div>
  );
}
