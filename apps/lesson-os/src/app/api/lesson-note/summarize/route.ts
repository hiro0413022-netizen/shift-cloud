import { NextResponse } from "next/server";
import { requireLessonActor, canAccessStore } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { readLessonAudio, MAX_AUDIO_BYTES } from "@/lib/lesson-note-ai";

/**
 * レッスンの録音を要約する（2026-08-28）
 *
 * サーバーアクションではなく route handler にした理由:
 *   50分の音声だと文字起こしに数分かかることがあり、既定の実行時間では足りない。
 *   ここだけ maxDuration を伸ばす。
 *
 * 音声はここでしか読まない。要約が取れたら **その場で音声を消す**（既定）。
 * 残すのは要約と文字起こしと、このあとコーチが直す本文だけ。
 */
export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "lesson-videos";

const mimeOf = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "mp4" || ext === "m4a") return "audio/mp4";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "wav") return "audio/wav";
  return "audio/webm";
};

export async function POST(req: Request) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { noteId, keepAudio } = (await req.json()) as { noteId?: string; keepAudio?: boolean };
  if (!noteId) return NextResponse.json({ error: "noteId がありません" }, { status: 400 });

  const { data } = await admin
    .from("lsn_lesson_notes")
    .select("id, student_id, company_id, audio_path, audio_bytes, lsn_students(store_id)")
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();
  type Row = {
    id: string; student_id: string; company_id: string; audio_path: string | null; audio_bytes: number | null;
    lsn_students: { store_id: string | null } | { store_id: string | null }[] | null;
  };
  const note = data as unknown as Row | null;
  if (!note || note.company_id !== actor.companyId) {
    return NextResponse.json({ error: "メモが見つかりません" }, { status: 404 });
  }
  const st = Array.isArray(note.lsn_students) ? note.lsn_students[0] : note.lsn_students;
  if (!canAccessStore(actor, st?.store_id ?? null)) {
    return NextResponse.json({ error: "メモが見つかりません" }, { status: 404 });
  }
  if (!note.audio_path) return NextResponse.json({ error: "録音がありません" }, { status: 400 });
  if ((note.audio_bytes ?? 0) > MAX_AUDIO_BYTES) {
    await admin.from("lsn_lesson_notes")
      .update({ status: "failed", error: "録音が長すぎて要約できませんでした。30分ずつに分けて録音してください" })
      .eq("id", note.id);
    return NextResponse.json({ error: "録音が長すぎます" }, { status: 400 });
  }

  const dl = await admin.storage.from(BUCKET).download(note.audio_path);
  if (dl.error || !dl.data) return NextResponse.json({ error: "録音を読めませんでした" }, { status: 500 });
  const audio = await dl.data.arrayBuffer();

  // そのコーチが普段書いているコメントを文体の見本にする（内容は真似させない）
  const { data: samples } = await admin
    .from("lsn_comments")
    .select("body")
    .eq("company_id", actor.companyId)
    .eq("coach_staff_id", actor.staffId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  const read = await readLessonAudio(
    audio,
    mimeOf(note.audio_path),
    (samples ?? []).map((s) => String((s as { body: string }).body)).filter(Boolean)
  );

  if (!read) {
    await admin.from("lsn_lesson_notes")
      .update({ status: "failed", error: "AIが使えませんでした（キー未設定か通信エラー）。録音は残っているので、あとから要約し直せます" })
      .eq("id", note.id);
    return NextResponse.json({ error: "要約できませんでした" }, { status: 502 });
  }

  await admin
    .from("lsn_lesson_notes")
    .update({
      transcript: read.transcript || null,
      summary: read.summary,
      body: read.body || null,
      ai_raw: read.raw as object,
      // 本文が出ていないなら失敗扱い。音声は消さずに残すので、原因を直して要約し直せる
      status: read.body ? "summarized" : "failed",
      error: read.warning,
      updated_at: new Date().toISOString(),
    })
    .eq("id", note.id);

  // 約束どおり、要約が取れたら音声は消す（残すのは要約と本文だけ）
  if (!keepAudio && read.body) {
    await admin.storage.from(BUCKET).remove([note.audio_path]);
    await admin.from("lsn_lesson_notes")
      .update({ audio_path: null, audio_deleted_at: new Date().toISOString() })
      .eq("id", note.id);
  }

  return NextResponse.json({ ok: true, warning: read.warning });
}
