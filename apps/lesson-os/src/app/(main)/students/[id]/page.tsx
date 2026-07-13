import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLessonActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import type { Annotations } from "@/lib/lesson";
import { KarteClient, type VideoItem, type StudentData } from "./karte-client";
import type { CompareSource } from "./compare-view";
import type { ProgressItem } from "./progress-panel";

/** 生徒カルテ（DECISIONS #50: PGA NOTE準拠のタブ構成） */
export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { id } = await params;

  const { data: student } = await admin
    .from("lsn_students")
    .select("id, name, name_kana, member_code, goal, memo, photo_path, profile, skill")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!student) notFound();

  const [{ data: videos }, { data: items }, { data: prog }, { data: models }] = await Promise.all([
    admin
      .from("lsn_videos")
      .select("id, shot_at, club, distance_yd, note, is_best, annotations, created_at, staff:uploaded_by(name)")
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

  const videoItems: VideoItem[] = (videos ?? []).map((v) => ({
    id: v.id,
    shotAt: v.shot_at ?? v.created_at.slice(0, 10),
    club: v.club,
    distanceYd: v.distance_yd,
    note: v.note,
    isBest: v.is_best,
    uploadedBy: (v.staff as unknown as { name: string } | null)?.name ?? "",
    annotations: (v.annotations as Annotations | null) ?? null,
    comments: (comments ?? [])
      .filter((c) => c.video_id === v.id)
      .map((c) => ({
        id: c.id,
        body: c.body,
        coach: (c.staff as unknown as { name: string } | null)?.name ?? "",
        at: c.created_at.slice(0, 16).replace("T", " "),
      })),
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
      <KarteClient student={studentData} videos={videoItems} progress={progressItems} compareSources={compareSources} />
    </div>
  );
}
