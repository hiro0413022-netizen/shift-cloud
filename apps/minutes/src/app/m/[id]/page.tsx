import Link from "next/link";
import { notFound } from "next/navigation";
import { listSegments, ownMeeting, SEGMENT_SECONDS, MAX_FILE_BYTES } from "@/lib/meetings";
import { MODE_BY_ID, isModeId, modesForLevel, summaryToText } from "@/lib/modes";
import { applySpeakers, countUnverified, listSpeakers } from "@/lib/transcript";
import { STATUS_LABEL, SOURCE_LABEL } from "@/lib/labels";
import { LEVEL_INFO } from "@/lib/levels";
import { Header } from "@/components/header";
import { LevelBadge, Pill } from "@/components/ui";
import { MeetingView } from "./meeting-view";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, admin, meeting } = await ownMeeting(id);
  if (!meeting) notFound();
  const segs = await listSegments(admin, meeting.id);

  const st = STATUS_LABEL[meeting.status] ?? STATUS_LABEL.draft;
  const modeId = isModeId(meeting.mode) ? meeting.mode : null;
  const mode = modeId ? MODE_BY_ID[modeId] : null;
  const transcript = meeting.transcript ? applySpeakers(meeting.transcript, meeting.speakers) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Header name={actor.name} />
      <Link href="/" className="text-sm text-(--color-dim) hover:text-(--color-txt)">
        ← 一覧へ
      </Link>
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-xl font-semibold">{meeting.title}</h2>
        <LevelBadge level={meeting.level} />
        <Pill tone={st.tone}>{st.text}</Pill>
        <span className="text-sm text-(--color-dim)">
          {meeting.meetingDate} ・ {SOURCE_LABEL[meeting.source]}
          {meeting.participants ? ` ・ ${meeting.participants}` : ""}
        </span>
      </div>

      <MeetingView
        meeting={{
          id: meeting.id,
          level: meeting.level,
          levelWhere: LEVEL_INFO[meeting.level].where,
          source: meeting.source,
          status: meeting.status,
          error: meeting.error,
          mode: meeting.mode,
          modeSuggested: meeting.modeSuggested,
          modeLabel: mode?.label ?? null,
          transcript,
          rawSpeakers: meeting.transcript ? listSpeakers(meeting.transcript) : [],
          speakers: meeting.speakers,
          summary: meeting.summary,
          sections: mode ? mode.sections.map((s) => ({ key: s.key, label: s.label })) : [],
          draftBody: meeting.body ?? (meeting.summary && mode ? summaryToText(meeting.summary, mode) : ""),
          todos: meeting.todos ?? meeting.summary?.todos ?? [],
          unverified: meeting.summary ? countUnverified(meeting.summary) : 0,
          confirmedAt: meeting.confirmedAt,
          transcriptExpiresAt: meeting.transcriptExpiresAt,
        }}
        segments={segs.map((s) => ({ idx: s.idx, status: s.status, error: s.error, hasAudio: Boolean(s.audioPath) }))}
        modes={modesForLevel(meeting.level).map((m) => ({ id: m.id, label: m.label }))}
        segmentSeconds={SEGMENT_SECONDS}
        maxFileBytes={MAX_FILE_BYTES}
      />
    </main>
  );
}
