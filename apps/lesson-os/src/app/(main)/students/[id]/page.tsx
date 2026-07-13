import Link from "next/link";
import { notFound } from "next/navigation";
import { requireLessonActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { KarteClient, type VideoItem } from "./karte-client";

/** 生徒カルテ — 動画タイムライン＋コメント（WING NOTEのライブラリー相当を1画面に） */
export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { id } = await params;

  const { data: student } = await admin
    .from("lsn_students")
    .select("id, name, name_kana, member_code, goal, memo")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!student) notFound();

  const { data: videos } = await admin
    .from("lsn_videos")
    .select("id, shot_at, club, note, is_best, created_at, staff:uploaded_by(name)")
    .eq("student_id", id)
    .is("deleted_at", null)
    .order("shot_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const videoIds = (videos ?? []).map((v) => v.id);
  const { data: comments } = videoIds.length
    ? await admin
        .from("lsn_comments")
        .select("id, video_id, body, created_at, staff:coach_staff_id(name)")
        .in("video_id", videoIds)
        .is("deleted_at", null)
        .order("created_at")
    : { data: [] };

  const items: VideoItem[] = (videos ?? []).map((v) => ({
    id: v.id,
    shotAt: v.shot_at ?? v.created_at.slice(0, 10),
    club: v.club,
    note: v.note,
    isBest: v.is_best,
    uploadedBy: (v.staff as unknown as { name: string } | null)?.name ?? "",
    comments: (comments ?? [])
      .filter((c) => c.video_id === v.id)
      .map((c) => ({
        id: c.id,
        body: c.body,
        coach: (c.staff as unknown as { name: string } | null)?.name ?? "",
        at: c.created_at.slice(0, 16).replace("T", " "),
      })),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-[--color-dim]">
        <Link href="/" className="underline underline-offset-2">生徒一覧</Link>
        <span>›</span>
        <span className="text-[--color-txt]">{student.name}</span>
      </div>
      <KarteClient
        student={{
          id: student.id,
          name: student.name,
          kana: student.name_kana,
          memberCode: student.member_code,
          goal: student.goal,
          memo: student.memo,
        }}
        videos={items}
      />
    </div>
  );
}
