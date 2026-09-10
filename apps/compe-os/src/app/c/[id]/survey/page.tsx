import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { DEFAULT_SURVEY_QUESTIONS, getComp } from "@/lib/compe";
import { CompNav } from "@/components/nav";
import { cardCls } from "@/components/ui";
import { SurveyEditor } from "./editor";

export default async function SurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();
  const questions = comp.survey_questions.length ? comp.survey_questions : DEFAULT_SURVEY_QUESTIONS;

  return (
    <>
      <CompNav compId={id} active="survey" />
      <div className="mb-5">
        <Link href={`/c/${id}/print/survey`} target="_blank" className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white">
          紙のアンケートを印刷
        </Link>
      </div>
      <section className={cardCls}>
        <p className="mb-4 text-xs text-(--color-dim)">
          その場で書いてもらう紙のアンケートです。Webで集めて集計したい場合は Survey OS を使ってください（回答の集計はあちらの担当です）。
        </p>
        <SurveyEditor
          compId={id}
          title={comp.survey_title ?? `${comp.name} アンケート`}
          desc={comp.survey_desc ?? "ご参加いただきありがとうございました。今後のコンペをより良くするため、アンケートにご協力をお願いします。"}
          questions={questions}
        />
      </section>
    </>
  );
}
