import { createAdmin } from "@/lib/supabase/admin";
import { asOptions, asConfig, type Question, type QuestionType } from "@/lib/survey";
import { SurveyForm } from "./survey-form";

export const dynamic = "force-dynamic";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8 sm:px-5">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-[0.4em] text-[--color-gold]">GOLF WING</p>
        <h1 className="mt-1 text-xl font-bold tracking-wide sm:text-2xl">{title}</h1>
      </div>
      {children}
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell title="アンケート">
      <div className="rounded-2xl border border-[--color-line] bg-[--color-panel] p-6 text-center shadow-sm">
        <p className="text-lg font-semibold">{title}</p>
        <p className="mt-2 text-sm text-[--color-dim]">{body}</p>
      </div>
    </Shell>
  );
}

export default async function SurveyPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdmin();

  const { data: survey } = await admin
    .from("svy_surveys")
    .select("id, slug, title, description, status, is_anonymous, intro_text, thanks_text, est_minutes")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!survey) return <Notice title="アンケートが見つかりません" body="URLをご確認ください。" />;
  if (survey.status === "draft") return <Notice title="準備中です" body="このアンケートはまだ公開されていません。" />;
  if (survey.status === "closed")
    return <Notice title="受付を終了しました" body="ご協力ありがとうございました。" />;

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

  return (
    <Shell title={survey.title}>
      <SurveyForm
        slug={survey.slug}
        intro={survey.intro_text}
        thanks={survey.thanks_text}
        estMinutes={survey.est_minutes}
        anonymous={survey.is_anonymous}
        questions={questions}
      />
    </Shell>
  );
}
