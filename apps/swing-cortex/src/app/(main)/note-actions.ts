"use server";

import { revalidatePath } from "next/cache";
import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { MAX_AUDIO_BYTES } from "@/lib/voice-note-ai";

/**
 * 音声メモ（録音 → AI下書き → コーチが直して保存）のサーバー側 / 2026-09-03
 *
 * 生徒には紐づけない（ユーザー判断）。録音1本＝1レッスン＝1行。
 * 音声は cortex-audio バケット。要約が取れた時点で消す（route 側）。
 */

const BUCKET = "cortex-audio";

export type VoiceNoteItem = {
  id: string;
  lessonDate: string;
  status: string;
  seconds: number | null;
  hasAudio: boolean;
  audioDeleted: boolean;
  transcript: string | null;
  comment: string;
  coachNote: string;
  summary: { today: string[]; homework: string[]; points: string[]; clubs: string[]; next: string[] } | null;
  error: string | null;
  savedAt: string | null;
  createdAt: string;
};

type Row = {
  id: string; lesson_date: string; status: string; audio_seconds: number | null;
  audio_path: string | null; audio_deleted_at: string | null; transcript: string | null;
  comment_body: string | null; coach_note: string | null; summary: VoiceNoteItem["summary"];
  error: string | null; saved_at: string | null; created_at: string;
};

const toItem = (r: Row): VoiceNoteItem => ({
  id: r.id,
  lessonDate: r.lesson_date,
  status: r.status,
  seconds: r.audio_seconds,
  hasAudio: !!r.audio_path,
  audioDeleted: !!r.audio_deleted_at,
  transcript: r.transcript,
  comment: r.comment_body ?? "",
  coachNote: r.coach_note ?? "",
  summary: r.summary,
  error: r.error,
  savedAt: r.saved_at,
  createdAt: r.created_at,
});

const COLS =
  "id, lesson_date, status, audio_seconds, audio_path, audio_deleted_at, transcript, comment_body, coach_note, summary, error, saved_at, created_at";

const jstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** 自分の会社のメモだけ触れるようにする門 */
async function ownNote(noteId: string) {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_voice_notes")
    .select("id, company_id, audio_path")
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as { id: string; company_id: string; audio_path: string | null } | null;
  if (!row || row.company_id !== actor.companyId) return { actor, admin, note: null };
  return { actor, admin, note: { id: row.id, audioPath: row.audio_path } };
}

/** 録音を始める。**同意チェックが無ければ作らない**（サーバー側でも弾く） */
export async function startVoiceNote(consent: boolean): Promise<{ id?: string; error?: string }> {
  const actor = await requireCoachActor();
  if (!consent) return { error: "お客様の同意を確認してから録音してください" };
  const admin = createAdmin();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("sc_voice_notes")
    .insert({
      company_id: actor.companyId,
      coach_staff_id: actor.staffId,
      lesson_date: jstToday(),
      status: "draft",
      consent_at: now,
      consent_by: actor.staffId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "録音を始められませんでした" };
  return { id: (data as { id: string }).id };
}

/**
 * 録音しながら送る断片のURL（lesson-os #201 と同じやり方）。
 * 止めてから12MBを丸ごと送るとコーチを1分以上待たせるので、5秒ごとに送っておく。
 */
export async function createNotePartUploadUrl(
  noteId: string,
  index: number,
  ext: string
): Promise<{ url?: string; path?: string; error?: string }> {
  const { actor, admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  if (!Number.isInteger(index) || index < 0 || index > 999) return { error: "断片の番号が不正です" };
  const safeExt = /^[a-z0-9]{2,5}$/.test(ext) ? ext : "webm";
  const path = `${actor.companyId}/notes/parts/${note.id}_${String(index).padStart(3, "0")}.${safeExt}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "URLの発行に失敗しました" };
  return { url: data.signedUrl, path };
}

const contentTypeOf = (ext: string) =>
  ext === "m4a" || ext === "mp4" ? "audio/mp4" : ext === "ogg" ? "audio/ogg" : "audio/webm";

/**
 * 送っておいた断片を1本につなぐ（サーバー側で結合＝コーチの回線を使わない）。
 * 1つでも欠けていたらつながない。欠けた音声で要約すると嘘が混ざる。
 */
export async function finishNoteParts(
  noteId: string,
  paths: string[],
  seconds: number
): Promise<{ error?: string; bytes?: number }> {
  const { actor, admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  if (!paths.length) return { error: "録音が空でした" };
  const prefix = `${actor.companyId}/notes/parts/${note.id}_`;
  if (paths.some((p) => !p.startsWith(prefix))) return { error: "不正なパスです" };

  const buffers: Buffer[] = [];
  for (const path of paths) {
    const dl = await admin.storage.from(BUCKET).download(path);
    if (dl.error || !dl.data) return { error: "録音の一部を読めませんでした" };
    buffers.push(Buffer.from(await dl.data.arrayBuffer()));
  }
  const merged = Buffer.concat(buffers);
  if (merged.byteLength > MAX_AUDIO_BYTES) return { error: "録音が長すぎます。30分ずつに分けて録音してください" };

  const ext = paths[0].split(".").pop() ?? "webm";
  const full = `${actor.companyId}/notes/${Date.now()}.${ext}`;
  const up = await admin.storage.from(BUCKET).upload(full, merged, { contentType: contentTypeOf(ext), upsert: true });
  if (up.error) return { error: "音声の保存に失敗しました" };
  await admin.storage.from(BUCKET).remove(paths);

  const { error } = await admin
    .from("sc_voice_notes")
    .update({
      audio_path: full,
      audio_seconds: Math.max(0, Math.round(seconds)) || null,
      audio_bytes: merged.byteLength,
      status: "uploaded",
    })
    .eq("id", note.id);
  return error ? { error: "音声の保存に失敗しました" } : { bytes: merged.byteLength };
}

/** 分割が使えなかったときの逃げ道（丸ごと1本を送る） */
export async function createNoteUploadUrl(
  noteId: string,
  ext: string,
  size: number
): Promise<{ url?: string; path?: string; error?: string }> {
  const { actor, admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  if (size > MAX_AUDIO_BYTES) return { error: "録音が長すぎます。30分ずつに分けて録音してください" };
  const safeExt = /^[a-z0-9]{2,5}$/.test(ext) ? ext : "webm";
  const path = `${actor.companyId}/notes/${Date.now()}.${safeExt}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "URLの発行に失敗しました" };
  return { url: data.signedUrl, path };
}

export async function finishNoteUpload(
  noteId: string,
  path: string,
  seconds: number,
  bytes: number,
  staleParts?: string[]
): Promise<{ error?: string }> {
  const { actor, admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  if (!path.startsWith(`${actor.companyId}/notes/`)) return { error: "不正なパスです" };
  if (staleParts?.length) {
    const prefix = `${actor.companyId}/notes/parts/${note.id}_`;
    const mine = staleParts.filter((p) => p.startsWith(prefix));
    if (mine.length) await admin.storage.from(BUCKET).remove(mine);
  }
  const { error } = await admin
    .from("sc_voice_notes")
    .update({
      audio_path: path,
      audio_seconds: Math.max(0, Math.round(seconds)) || null,
      audio_bytes: bytes,
      status: "uploaded",
    })
    .eq("id", note.id);
  return error ? { error: "音声の保存に失敗しました" } : {};
}

/** 1件読み直す（要約は裏で走るので、画面はこれで追いかける） */
export async function loadVoiceNote(noteId: string): Promise<{ note: VoiceNoteItem | null }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_voice_notes")
    .select(COLS)
    .eq("id", noteId)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  return { note: data ? toItem(data as unknown as Row) : null };
}

/** 直近のメモ（新しい順） */
export async function listVoiceNotes(limit = 20): Promise<VoiceNoteItem[]> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_voice_notes")
    .select(COLS)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)));
  return ((data ?? []) as unknown as Row[]).map(toItem);
}

/** 確認して保存。ここで確定した本文だけが記録として残る（AIの下書きは正典ではない） */
export async function saveVoiceNote(
  noteId: string,
  comment: string,
  coachNote: string
): Promise<{ error?: string }> {
  const { admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  const body = (comment ?? "").trim();
  if (!body) return { error: "コメントが空です" };
  const { error } = await admin
    .from("sc_voice_notes")
    .update({
      comment_body: body.slice(0, 4000),
      coach_note: (coachNote ?? "").trim().slice(0, 4000) || null,
      status: "saved",
      saved_at: new Date().toISOString(),
    })
    .eq("id", note.id);
  if (error) return { error: "保存に失敗しました" };
  revalidatePath("/note");
  return {};
}

/** 音声をいますぐ消す（要約前でも消せる） */
export async function deleteNoteAudio(noteId: string): Promise<{ error?: string }> {
  const { admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  if (note.audioPath) await admin.storage.from(BUCKET).remove([note.audioPath]);
  await admin
    .from("sc_voice_notes")
    .update({ audio_path: null, audio_deleted_at: new Date().toISOString() })
    .eq("id", note.id);
  revalidatePath("/note");
  return {};
}

/** 文字起こしを消す（正典はコーチが確定した本文） */
export async function deleteNoteTranscript(noteId: string): Promise<{ error?: string }> {
  const { admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  await admin.from("sc_voice_notes").update({ transcript: null }).eq("id", note.id);
  revalidatePath("/note");
  return {};
}

/** メモごと下げる（音声も消す） */
export async function removeVoiceNote(noteId: string): Promise<{ error?: string }> {
  const { admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  if (note.audioPath) await admin.storage.from(BUCKET).remove([note.audioPath]);
  await admin
    .from("sc_voice_notes")
    .update({ deleted_at: new Date().toISOString(), audio_path: null, audio_deleted_at: new Date().toISOString() })
    .eq("id", note.id);
  revalidatePath("/note");
  return {};
}
