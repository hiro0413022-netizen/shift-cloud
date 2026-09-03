import { NextResponse } from "next/server";
import { requireLessonActor, canAccessStore } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { readLessonAudio, matchSymptoms, MAX_AUDIO_BYTES } from "@/lib/lesson-note-ai";

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
      // お客様への説明も同じ1回の呼び出しで作っている（2026-09-03）。
      // 先生の記録(body)とは別物で、宛先が違うだけ。どちらも保存前に先生が直す下書き。
      share_body: read.client || null,
      ai_raw: read.raw as object,
      // 本文が出ていないなら失敗扱い。音声は消さずに残すので、原因を直して要約し直せる
      status: read.body ? "summarized" : "failed",
      error: read.warning,
      updated_at: new Date().toISOString(),
    })
    .eq("id", note.id);

  /* --- 店のメソッド（AIカルテナレッジ）に紐づける ------------------
     AIに文章を書かせるのではなく、分類だけさせる。本文はコーチの言葉のまま。
     ナレッジが無い会社では素通り（画面から手でタグ付けできる）。 */
  if (read.body || read.transcript) {
    const [{ data: sym }, { data: cps }] = await Promise.all([
      admin.from("sc_symptoms")
        .select("id, name, category, flight_dir, tags")
        .eq("company_id", actor.companyId).eq("active", true).is("deleted_at", null),
      admin.from("sc_checkpoints")
        .select("id, symptom_id, title")
        .eq("company_id", actor.companyId).is("deleted_at", null),
    ]);
    const symptoms = (sym ?? []).map((r) => {
      const x = r as Record<string, unknown>;
      return {
        id: String(x.id), name: String(x.name),
        category: (x.category as string | null) ?? null,
        flight: (x.flight_dir as string | null) ?? null,
        tags: Array.isArray(x.tags) ? (x.tags as string[]) : [],
      };
    });
    const checkpoints = (cps ?? []).map((r) => {
      const x = r as Record<string, unknown>;
      return { id: String(x.id), symptomId: String(x.symptom_id), title: String(x.title) };
    });

    const material = [read.body, read.transcript].filter(Boolean).join("\n\n");
    const matches = await matchSymptoms(material, symptoms, checkpoints);

    if (matches.length) {
      await admin.from("lsn_note_symptoms").upsert(
        matches.map((m) => ({
          company_id: actor.companyId,
          note_id: note.id,
          student_id: note.student_id,
          symptom_id: m.symptomId,
          checkpoint_id: m.checkpointId,
          quote: m.quote || null,
          confidence: m.confidence,
          source: "ai",
        })),
        { onConflict: "note_id,symptom_id,checkpoint_id" }
      );

      /* お客様への説明は 2026-09-03 から **AIが今日の会話から書く**（ユーザー判断）。
         それまではナレッジの標準説明(sc_knowledge.client_explanation)をそのまま貼っていたが、
         毎回ほぼ同じ文になり「今日の話」にならなかった。
         ナレッジとの連携（標準説明を下敷きにする）はあらためて別途入れる。
         症状タグ（上の upsert）は続ける＝記録が数えられる資産であることは変わらない。 */
    }
  }

  // 約束どおり、要約が取れたら音声は消す（残すのは要約と本文だけ）
  if (!keepAudio && read.body) {
    await admin.storage.from(BUCKET).remove([note.audio_path]);
    await admin.from("lsn_lesson_notes")
      .update({ audio_path: null, audio_deleted_at: new Date().toISOString() })
      .eq("id", note.id);
  }

  return NextResponse.json({ ok: true, warning: read.warning });
}
