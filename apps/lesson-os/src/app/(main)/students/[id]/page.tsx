import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLessonActor, canAccessStore } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import type { Annotations } from "@/lib/lesson";
import type { Phases } from "@/lib/phases";
import { KarteClient, type VideoItem, type StudentData } from "./karte-client";
import type { CompareSource } from "./compare-view";
import type { ProgressItem } from "./progress-panel";
import type { MeasurementItem } from "./measure-panel";
import { type LessonNoteItem } from "./actions";
import { mapNoteSymptom } from "./note-symptom";
import type { TrackmanValues } from "@/lib/trackman";

/** 生徒カルテ（DECISIONS #50: PGA NOTE準拠のタブ構成） */
export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { id } = await params;

  const { data: student } = await admin
    .from("lsn_students")
    .select("id, store_id, name, name_kana, member_code, goal, memo, photo_path, profile, skill")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!student) notFound();
  // URL直打ちで他店舗のカルテを開けないようにする（#134）
  if (!canAccessStore(actor, (student as { store_id: string | null }).store_id)) notFound();

  const [{ data: videos }, { data: items }, { data: prog }, { data: models }, { data: measures }, { data: noteRows }] = await Promise.all([
    admin
      .from("lsn_videos")
      .select("id, shot_at, club, distance_yd, note, is_best, annotations, phases, created_at, storage_path, poster_path, staff:uploaded_by(name)")
      .eq("student_id", id)
      .is("deleted_at", null)
      .order("shot_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("lsn_progress_items")
      .select("id, name, sort")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("sort"),
    admin.from("lsn_progress").select("item_id, percent").eq("student_id", id),
    admin
      .from("lsn_model_videos")
      .select("id, club, distance_yd, note, staff:coach_staff_id(name)")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(30),
    // トラックマン計測（2026-08-22）。写真は一覧では出さず、押されたときだけ署名URLを出す
    admin
      .from("lsn_measurements")
      .select("id, measured_at, club, note, data, photo_path, video_id")
      .eq("student_id", id)
      .is("deleted_at", null)
      .order("measured_at", { ascending: false })
      .limit(60),
    // レッスンメモ（会話の録音→AI要約）。音声そのものは一覧では触らない
    admin
      .from("lsn_lesson_notes")
      .select("id, lesson_date, status, audio_path, audio_seconds, body, summary, transcript, share_body, video_id, error, staff:coach_staff_id(name)")
      .eq("student_id", id)
      .is("deleted_at", null)
      .order("lesson_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const videoIds = (videos ?? []).map((v) => v.id);
  const { data: comments } = videoIds.length
    ? await admin
        .from("lsn_comments")
        .select("id, video_id, body, created_at, staff:coach_staff_id(name)")
        .in("video_id", videoIds)
        .is("deleted_at", null)
        .order("created_at")
    : { data: [] };

  /**
   * 再生URLとサムネイルをページ表示の時点でまとめて発行する（2026-08-22）。
   * 以前は「▶ 再生をひらく」を押すたびにサーバーアクションで1本ずつ署名URLを取っていて、
   * タップしてから読み込みが始まるまで一拍待たされていた。
   * createSignedUrls なら往復1回で全部出せる（有効30分）。
   */
  const signPaths = [
    ...(videos ?? []).map((v) => v.storage_path as string),
    ...(videos ?? []).map((v) => v.poster_path as string | null).filter((p): p is string => !!p),
  ];
  const signed = new Map<string, string>();
  if (signPaths.length) {
    const { data: urls } = await admin.storage.from("lesson-videos").createSignedUrls(signPaths, 1800);
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }
  }

  const videoItems: VideoItem[] = (videos ?? []).map((v) => ({
    id: v.id,
    shotAt: v.shot_at ?? v.created_at.slice(0, 10),
    club: v.club,
    distanceYd: v.distance_yd,
    note: v.note,
    isBest: v.is_best,
    uploadedBy: (v.staff as unknown as { name: string } | null)?.name ?? "",
    annotations: (v.annotations as Annotations | null) ?? null,
    phases: (v.phases as Phases | null) ?? null,
    url: signed.get(v.storage_path as string) ?? null,
    posterUrl: v.poster_path ? signed.get(v.poster_path as string) ?? null : null,
    comments: (comments ?? [])
      .filter((c) => c.video_id === v.id)
      .map((c) => ({
        id: c.id,
        body: c.body,
        coach: (c.staff as unknown as { name: string } | null)?.name ?? "",
        at: c.created_at.slice(0, 16).replace("T", " "),
      })),
  }));

  const measurements: MeasurementItem[] = (measures ?? []).map((m) => ({
    id: String(m.id),
    measuredAt: m.measured_at ? String(m.measured_at).slice(0, 10) : "",
    club: (m.club as string | null) ?? null,
    note: (m.note as string | null) ?? null,
    hasPhoto: Boolean(m.photo_path),
    videoId: (m.video_id as string | null) ?? null,
    values: ((m.data as TrackmanValues | null) ?? {}) as TrackmanValues,
  }));

  // 症状タグ（AIカルテナレッジへの紐づけ）。メモを開いた瞬間に出したいのでここでまとめて引く
  const noteIds = (noteRows ?? []).map((n) => String(n.id));
  const { data: tagRows } = noteIds.length
    ? await admin
        .from("lsn_note_symptoms")
        .select("id, note_id, symptom_id, checkpoint_id, quote, confidence, source, rejected, sc_symptoms(name, category), sc_checkpoints(title)")
        .in("note_id", noteIds)
        .order("confidence", { ascending: false })
    : { data: [] };

  const lessonNotes: LessonNoteItem[] = (noteRows ?? []).map((n) => ({
    id: String(n.id),
    lessonDate: String(n.lesson_date),
    status: String(n.status),
    hasAudio: Boolean(n.audio_path),
    seconds: (n.audio_seconds as number | null) ?? null,
    body: (n.body as string | null) ?? null,
    summary: (n.summary as LessonNoteItem["summary"]) ?? null,
    transcript: (n.transcript as string | null) ?? null,
    shareBody: (n.share_body as string | null) ?? null,
    videoId: (n.video_id as string | null) ?? null,
    symptoms: (tagRows ?? []).filter((t) => String((t as { note_id: string }).note_id) === String(n.id)).map(mapNoteSymptom),
    coach: (n.staff as unknown as { name: string } | null)?.name ?? "",
    error: (n.error as string | null) ?? null,
  }));

  const progMap = new Map((prog ?? []).map((p) => [p.item_id, p.percent]));
  const progressItems: ProgressItem[] = (items ?? []).map((it) => ({
    itemId: it.id,
    name: it.name,
    percent: progMap.get(it.id) ?? 0,
  }));

  const compareSources: CompareSource[] = [
    ...videoItems.map((v) => ({
      id: v.id,
      label: `${v.shotAt}${v.club ? ` ${v.club}` : ""}${v.distanceYd ? ` ${v.distanceYd}yd` : ""}${v.isBest ? " ★" : ""}`,
      kind: "student" as const,
    })),
    ...(models ?? []).map((m) => ({
      id: m.id,
      label: `お手本: ${(m.staff as unknown as { name: string } | null)?.name ?? ""}${m.club ? ` ${m.club}` : ""}${m.distance_yd ? ` ${m.distance_yd}yd` : ""}`,
      kind: "model" as const,
    })),
  ];

  let photoUrl: string | null = null;
  if (student.photo_path) {
    const { data } = await admin.storage.from("lesson-videos").createSignedUrl(student.photo_path, 3600);
    photoUrl = data?.signedUrl ?? null;
  }

  const studentData: StudentData = {
    id: student.id,
    name: student.name,
    kana: student.name_kana,
    memberCode: student.member_code,
    goal: student.goal,
    memo: student.memo,
    photoUrl,
    profile: (student.profile as Record<string, string>) ?? {},
    skill: (student.skill as Record<string, string>) ?? {},
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-(--color-dim)">
        <Link href="/" className="underline underline-offset-2">生徒一覧</Link>
        <span>›</span>
        <span className="text-(--color-txt)">{student.name}</span>
      </div>
      <KarteClient
        student={studentData}
        videos={videoItems}
        progress={progressItems}
        compareSources={compareSources}
        measurements={measurements}
        lessonNotes={lessonNotes}
      />
    </div>
  );
}
