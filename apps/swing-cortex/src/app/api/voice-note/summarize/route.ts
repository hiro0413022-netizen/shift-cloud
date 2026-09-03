import { NextResponse } from "next/server";
import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { readVoiceNote, MAX_AUDIO_BYTES } from "@/lib/voice-note-ai";
import { loadStyle } from "@/lib/method";
import { placeCandidate, shouldQueue, PROMOTE_HITS, type SymptomLite, type CheckpointLite } from "@/lib/candidates";

/**
 * 録音を要約して、ナレッジ候補を溜める（2026-09-03）
 *
 * サーバーアクションではなく route handler にした理由は lesson-os と同じ:
 *   50分の音声だと文字起こしに数分かかる。ここだけ maxDuration を伸ばす。
 *
 * ⚠ ここは **ナレッジ本体（sc_symptoms / sc_checkpoints / sc_knowledge）に書かない**。
 *    AIが出した知識は sc_knowledge_candidates に溜めるだけ。
 *    本体に入るのは、設定画面で人が採用ボタンを押したときだけ（candidate-actions.ts）。
 */
export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "cortex-audio";

const mimeOf = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "mp4" || ext === "m4a") return "audio/mp4";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "wav") return "audio/wav";
  return "audio/webm";
};

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export async function POST(req: Request) {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const { noteId, keepAudio } = (await req.json()) as { noteId?: string; keepAudio?: boolean };
  if (!noteId) return NextResponse.json({ error: "noteId がありません" }, { status: 400 });

  const { data } = await admin
    .from("sc_voice_notes")
    .select("id, company_id, audio_path, audio_bytes")
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();
  const note = data as { id: string; company_id: string; audio_path: string | null; audio_bytes: number | null } | null;
  if (!note || note.company_id !== actor.companyId) {
    return NextResponse.json({ error: "メモが見つかりません" }, { status: 404 });
  }
  if (!note.audio_path) return NextResponse.json({ error: "録音がありません" }, { status: 400 });
  if ((note.audio_bytes ?? 0) > MAX_AUDIO_BYTES) {
    await admin.from("sc_voice_notes")
      .update({ status: "failed", error: "録音が長すぎて要約できませんでした。30分ずつに分けて録音してください" })
      .eq("id", note.id);
    return NextResponse.json({ error: "録音が長すぎます" }, { status: 400 });
  }

  const dl = await admin.storage.from(BUCKET).download(note.audio_path);
  if (dl.error || !dl.data) return NextResponse.json({ error: "録音を読めませんでした" }, { status: 500 });
  const audio = await dl.data.arrayBuffer();

  const style = await loadStyle(actor.companyId);
  const read = await readVoiceNote(audio, mimeOf(note.audio_path), style);

  if (!read) {
    await admin.from("sc_voice_notes")
      .update({ status: "failed", error: "AIが使えませんでした（キー未設定か通信エラー）。録音は残っているので、あとから作り直せます" })
      .eq("id", note.id);
    return NextResponse.json({ error: "要約できませんでした" }, { status: 502 });
  }

  await admin
    .from("sc_voice_notes")
    .update({
      transcript: read.transcript || null,
      summary: read.summary,
      comment_body: read.comment || null,
      coach_note: read.coachNote || null,
      ai_raw: read.raw as object,
      status: read.comment ? "summarized" : "failed",
      error: read.warning,
    })
    .eq("id", note.id);

  /* --- ナレッジ候補を溜める（本体には書かない） ------------------------
     寄せ先の判定は AI ではなく jp-search のあいまい一致（lib/candidates.ts）。
     AIに既存IDを選ばせると、無いIDを作って返してくる事故が起きうる。 */
  let collected = 0;
  if (read.candidates.length) {
    const [{ data: sym }, { data: cps }] = await Promise.all([
      admin.from("sc_symptoms").select("id, name, tags")
        .eq("company_id", actor.companyId).eq("active", true).is("deleted_at", null),
      admin.from("sc_checkpoints").select("id, symptom_id, title")
        .eq("company_id", actor.companyId).is("deleted_at", null),
    ]);
    const symptoms: SymptomLite[] = (sym ?? []).map((r) => {
      const x = r as Record<string, unknown>;
      return { id: String(x.id), name: String(x.name), tags: Array.isArray(x.tags) ? (x.tags as string[]) : [] };
    });
    const checkpoints: CheckpointLite[] = (cps ?? []).map((r) => {
      const x = r as Record<string, unknown>;
      return { id: String(x.id), symptomId: String(x.symptom_id), title: String(x.title) };
    });

    const today = jstToday();
    for (const raw of read.candidates) {
      const placed = placeCandidate(raw, symptoms, checkpoints);
      if (!placed) continue;

      const { data: hit } = await admin
        .from("sc_knowledge_candidates")
        .select("id, hits, last_seen_on")
        .eq("company_id", actor.companyId)
        .eq("digest", placed.digest)
        .maybeSingle();
      const found = hit as { id: string; hits: number; last_seen_on: string } | null;

      if (found) {
        // **hits は「出た日数」**。同じレッスンの中で同じ話が繰り返されても1日ぶん。
        // これをしないと1回のレッスンだけで門を通ってしまう。
        if (found.last_seen_on !== today) {
          await admin
            .from("sc_knowledge_candidates")
            .update({ hits: found.hits + 1, last_seen_on: today, last_note_id: note.id })
            .eq("id", found.id);
        } else {
          await admin.from("sc_knowledge_candidates").update({ last_note_id: note.id }).eq("id", found.id);
        }
      } else {
        await admin.from("sc_knowledge_candidates").insert({
          company_id: actor.companyId,
          note_id: note.id,
          last_note_id: note.id,
          kind: placed.kind,
          symptom_id: placed.symptomId,
          checkpoint_id: placed.checkpointId,
          digest: placed.digest,
          title: placed.title,
          proposed: placed.proposed,
          quote: placed.quote,
          hits: 1,
          first_seen_on: today,
          last_seen_on: today,
          status: "collected",
        });
        collected += 1;
      }
    }
  }

  /* --- 昇格（AIを使わない・回数だけを見る） --------------------------
     設計では「毎晩1回のバッチ」だったが、判定は純粋なSQL/計算で軽いので
     録音のたびにここで回す。結果は同じで、cron を1本増やさずに済む。 */
  const { data: pend } = await admin
    .from("sc_knowledge_candidates")
    .select("id, hits, first_seen_on, last_seen_on, status")
    .eq("company_id", actor.companyId)
    .eq("status", "collected")
    .gte("hits", PROMOTE_HITS);
  const promote = ((pend ?? []) as { id: string; hits: number; first_seen_on: string; last_seen_on: string; status: string }[])
    .filter((r) => shouldQueue({ hits: r.hits, firstSeenOn: r.first_seen_on, lastSeenOn: r.last_seen_on, status: r.status }))
    .map((r) => r.id);
  if (promote.length) {
    await admin.from("sc_knowledge_candidates").update({ status: "queued" }).in("id", promote);
  }

  // 約束どおり、要約が取れたら音声は消す（残るのは要約と本文だけ）
  if (!keepAudio && read.comment) {
    await admin.storage.from(BUCKET).remove([note.audio_path]);
    await admin.from("sc_voice_notes")
      .update({ audio_path: null, audio_deleted_at: new Date().toISOString() })
      .eq("id", note.id);
  }

  return NextResponse.json({ ok: true, warning: read.warning, collected, queued: promote.length });
}
