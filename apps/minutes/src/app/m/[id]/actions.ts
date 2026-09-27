"use server";

// ⚠ "use server" ファイルには async 関数しか export しない（同期関数を出すと本番ビルドが落ちる・#180の教訓）

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BUCKET, MAX_FILE_BYTES, extOfMime, baseMime, listSegments, ownMeeting } from "@/lib/meetings";
import { TRANSCRIPT_KEEP_DAYS } from "@/lib/levels";
import type { Todo } from "@/lib/modes";

type R = { error?: string };

const now = () => new Date().toISOString();

/** 録音を始める（同意が記録されている会議だけ） */
export async function startRecording(id: string): Promise<R> {
  const { admin, meeting } = await ownMeeting(id);
  if (!meeting) return { error: "議事録が見つかりません" };
  if (!meeting.consentAt) return { error: "参加者の了承が記録されていません" };
  if (meeting.source !== "record") return { error: "この議事録は録音ではありません" };
  if (!["draft", "recording"].includes(meeting.status)) return { error: "この議事録はもう録音できません" };
  await admin.from("mtg_meetings").update({ status: "recording", updated_at: now() }).eq("id", id);
  return {};
}

/** 区間1本ぶんの直アップロードURL（音声はブラウザ→Storageへ直接。サーバーを通さない） */
export async function createSegmentUploadUrl(
  id: string,
  idx: number,
  mime: string
): Promise<{ url?: string; path?: string; error?: string }> {
  const { actor, admin, meeting } = await ownMeeting(id);
  if (!meeting) return { error: "議事録が見つかりません" };
  if (!Number.isInteger(idx) || idx < 0 || idx > 999) return { error: "区間の番号が不正です" };
  if (!["draft", "recording", "transcribing"].includes(meeting.status)) return { error: "この議事録はもう音声を受け付けません" };
  const path = `${actor.companyId}/${meeting.id}/${String(idx).padStart(3, "0")}-${Date.now()}.${extOfMime(mime)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl, path };
}

/** 区間を登録する（音声が置けたあと） */
export async function finishSegment(
  id: string,
  seg: { idx: number; path: string; bytes: number; seconds: number | null; offsetSeconds: number; mime: string }
): Promise<R> {
  const { actor, admin, meeting } = await ownMeeting(id);
  if (!meeting) return { error: "議事録が見つかりません" };
  if (!seg.path.startsWith(`${actor.companyId}/${meeting.id}/`)) return { error: "不正なパスです" };
  if (seg.bytes > MAX_FILE_BYTES) return { error: "音声が大きすぎます（50MBまで）" };
  const { error } = await admin.from("mtg_segments").upsert(
    {
      meeting_id: meeting.id,
      company_id: actor.companyId,
      idx: seg.idx,
      offset_seconds: Math.max(0, Math.round(seg.offsetSeconds)),
      seconds: seg.seconds == null ? null : Math.max(0, Math.round(seg.seconds)),
      audio_path: seg.path,
      audio_bytes: Math.round(seg.bytes),
      mime: baseMime(seg.mime),
      status: "uploaded",
      transcript: null,
      error: null,
      updated_at: now(),
    },
    { onConflict: "meeting_id,idx" }
  );
  if (error) return { error: error.message };
  if (meeting.source === "file" && meeting.status === "draft") {
    await admin.from("mtg_meetings").update({ status: "transcribing", updated_at: now() }).eq("id", id);
  }
  return {};
}

/** 録音を終える（ここから先は区間の文字起こしを待って、つないで、要約へ） */
export async function endRecording(id: string): Promise<R> {
  const { admin, meeting } = await ownMeeting(id);
  if (!meeting) return { error: "議事録が見つかりません" };
  if (!["draft", "recording"].includes(meeting.status)) return {};
  const segs = await listSegments(admin, id);
  if (!segs.length) return { error: "録音が1区間も届いていません" };
  await admin.from("mtg_meetings").update({ status: "transcribing", updated_at: now() }).eq("id", id);
  revalidatePath(`/m/${id}`);
  return {};
}

/** 失敗した区間を、音声が残っていればやり直せる状態に戻す */
export async function retrySegments(id: string): Promise<R> {
  const { admin, meeting } = await ownMeeting(id);
  if (!meeting) return { error: "議事録が見つかりません" };
  const segs = await listSegments(admin, id);
  const retry = segs.filter((s) => s.status === "failed" && s.audioPath).map((s) => s.id);
  if (!retry.length) return { error: "やり直せる区間がありません（音声が残っていません）" };
  await admin.from("mtg_segments").update({ status: "uploaded", error: null, updated_at: now() }).in("id", retry);
  await admin.from("mtg_meetings").update({ status: "transcribing", transcript: null, error: null, updated_at: now() }).eq("id", id);
  revalidatePath(`/m/${id}`);
  return {};
}

/** 文字起こしを貼り付けて取り込む（Zoom / Teams / 他のツールの書き起こし） */
export async function setTranscriptText(id: string, text: string): Promise<R> {
  const { admin, meeting } = await ownMeeting(id);
  if (!meeting) return { error: "議事録が見つかりません" };
  if (meeting.level === "L3") return { error: "L3の中身はこのサーバーに置けません" };
  if (meeting.status === "confirmed") return { error: "確定済みです。先に確定を取り消してください" };
  const t = text.replace(/\r\n/g, "\n").trim().slice(0, 200000);
  if (t.length < 20) return { error: "文字起こしが短すぎます" };
  await admin
    .from("mtg_meetings")
    .update({ transcript: t, status: "transcribed", error: null, updated_at: now() })
    .eq("id", id);
  revalidatePath(`/m/${id}`);
  return {};
}

/** 話者名の付け替え（話者A → 古川 など）。文字起こし本体は書き換えず、表示と要約のときに当てる */
export async function saveSpeakers(id: string, map: Record<string, string>): Promise<R> {
  const { admin, meeting } = await ownMeeting(id);
  if (!meeting) return { error: "議事録が見つかりません" };
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(map).slice(0, 20)) {
    const key = k.trim().slice(0, 20);
    const val = String(v ?? "").trim().slice(0, 30);
    if (key && val) clean[key] = val;
  }
  await admin.from("mtg_meetings").update({ speakers: clean, updated_at: now() }).eq("id", id);
  revalidatePath(`/m/${id}`);
  return {};
}

/** 確認して確定する。ここで保存した本文とToDoだけが正式な議事録 */
export async function confirmMeeting(id: string, body: string, todos: Todo[]): Promise<R> {
  const { actor, admin, meeting } = await ownMeeting(id);
  if (!meeting) return { error: "議事録が見つかりません" };
  if (meeting.level === "L3") return { error: "L3の中身はこのサーバーに置けません" };
  const text = body.trim().slice(0, 30000);
  if (!text) return { error: "本文が空です" };
  const cleanTodos = (Array.isArray(todos) ? todos : [])
    .map((t) => ({
      task: String(t.task ?? "").trim().slice(0, 300),
      owner: String(t.owner ?? "").trim().slice(0, 60),
      due: String(t.due ?? "").trim().slice(0, 60),
      q: String(t.q ?? "").slice(0, 200),
      ...(t.check ? { check: t.check } : {}),
    }))
    .filter((t) => t.task)
    .slice(0, 60);
  const keep = TRANSCRIPT_KEEP_DAYS[meeting.level];
  const at = new Date();
  await admin
    .from("mtg_meetings")
    .update({
      body: text,
      todos: cleanTodos,
      status: "confirmed",
      confirmed_at: at.toISOString(),
      confirmed_by: actor.staffId,
      transcript_expires_at: keep == null ? null : new Date(at.getTime() + keep * 86400_000).toISOString(),
      updated_at: at.toISOString(),
    })
    .eq("id", id);
  revalidatePath(`/m/${id}`);
  revalidatePath("/");
  return {};
}

/** 確定を取り消して下書きに戻す（本文は残す。文字起こしが期限で消えていれば要約し直しはできない） */
export async function reopenMeeting(id: string): Promise<R> {
  const { admin, meeting } = await ownMeeting(id);
  if (!meeting) return { error: "議事録が見つかりません" };
  if (meeting.status !== "confirmed") return {};
  await admin
    .from("mtg_meetings")
    .update({ status: "summarized", confirmed_at: null, confirmed_by: null, transcript_expires_at: null, updated_at: now() })
    .eq("id", id);
  revalidatePath(`/m/${id}`);
  return {};
}

/** 削除（論理削除）。音声が残っていればここで消す */
export async function deleteMeeting(id: string): Promise<R> {
  const { admin, meeting } = await ownMeeting(id);
  if (!meeting) return { error: "議事録が見つかりません" };
  const segs = await listSegments(admin, id);
  const paths = segs.map((s) => s.audioPath).filter((p): p is string => Boolean(p));
  if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  await admin.from("mtg_segments").update({ transcript: null, audio_path: null, audio_deleted_at: now() }).eq("meeting_id", id);
  await admin
    .from("mtg_meetings")
    .update({ deleted_at: now(), transcript: null, updated_at: now() })
    .eq("id", id);
  revalidatePath("/");
  redirect("/");
}
