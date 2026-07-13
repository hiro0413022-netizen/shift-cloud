"use server";

import { revalidatePath } from "next/cache";
import { requireLessonActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { encSeg } from "@/lib/libkey";

/**
 * 生徒カルテのアクション（DECISIONS #49）
 * 動画は署名付きアップロードURLでブラウザ→Storage直PUT（Vercel4.5MB上限回避・キーは日本語不可のためenc）。
 */
const BUCKET = "lesson-videos";
const MAX_SIZE = 200 * 1024 * 1024; // 200MB（Storage側の上限設定に依存。既定50MB→要引き上げはSYSTEM.md §6）

async function ownStudent(studentId: string) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("lsn_students")
    .select("id")
    .eq("id", studentId)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  return { actor, admin, ok: !!data };
}

export async function createVideoUploadUrl(
  studentId: string,
  filename: string,
  size: number
): Promise<{ url?: string; path?: string; error?: string }> {
  const { actor, admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  if (!filename) return { error: "ファイルがありません" };
  if (size > MAX_SIZE) return { error: "200MB以下の動画にしてください（長い動画は分割を）" };
  const safe = filename.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100);
  const path = `${actor.companyId}/${studentId}/${Date.now()}_${encSeg(safe)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl, path };
}

export async function registerVideo(
  studentId: string,
  input: { path: string; shotAt?: string; club?: string; note?: string; size?: number }
): Promise<{ error?: string }> {
  const { actor, admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  if (!input.path.startsWith(`${actor.companyId}/${studentId}/`)) return { error: "不正なパスです" };
  const { error } = await admin.from("lsn_videos").insert({
    company_id: actor.companyId,
    student_id: studentId,
    storage_path: input.path,
    shot_at: input.shotAt || new Date().toISOString().slice(0, 10),
    club: input.club?.trim().slice(0, 20) || null,
    note: input.note?.trim().slice(0, 500) || null,
    size_bytes: input.size ?? null,
    uploaded_by: actor.staffId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/students/${studentId}`);
  return {};
}

/** 再生用の署名URL（10分有効） */
export async function videoPlayUrl(videoId: string): Promise<{ url?: string; error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data: video } = await admin
    .from("lsn_videos")
    .select("storage_path, company_id")
    .eq("id", videoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!video || video.company_id !== actor.companyId) return { error: "動画が見つかりません" };
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(video.storage_path, 600);
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl };
}

export async function addComment(videoId: string, body: string): Promise<{ error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const text = body.trim();
  if (!text) return { error: "コメントを入力してください" };
  const { data: video } = await admin
    .from("lsn_videos")
    .select("id, student_id, company_id")
    .eq("id", videoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!video || video.company_id !== actor.companyId) return { error: "動画が見つかりません" };
  const { error } = await admin.from("lsn_comments").insert({
    company_id: actor.companyId,
    video_id: videoId,
    coach_staff_id: actor.staffId,
    body: text.slice(0, 2000),
  });
  if (error) return { error: error.message };
  revalidatePath(`/students/${video.student_id}`);
  return {};
}

/** ベストスイング印（生徒ごとに1本。WING NOTEの☆相当） */
export async function markBest(videoId: string): Promise<{ error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data: video } = await admin
    .from("lsn_videos")
    .select("id, student_id, company_id, is_best")
    .eq("id", videoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!video || video.company_id !== actor.companyId) return { error: "動画が見つかりません" };
  if (!video.is_best) {
    await admin.from("lsn_videos").update({ is_best: false }).eq("student_id", video.student_id).eq("is_best", true);
  }
  const { error } = await admin.from("lsn_videos").update({ is_best: !video.is_best }).eq("id", video.id);
  if (error) return { error: error.message };
  revalidatePath(`/students/${video.student_id}`);
  return {};
}

export async function removeVideo(videoId: string): Promise<{ error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data: video } = await admin
    .from("lsn_videos")
    .select("id, student_id, company_id")
    .eq("id", videoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!video || video.company_id !== actor.companyId) return { error: "動画が見つかりません" };
  const { error } = await admin
    .from("lsn_videos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", video.id);
  if (error) return { error: error.message };
  revalidatePath(`/students/${video.student_id}`);
  return {};
}

/** 生徒情報（目標・メモ・会員番号）の更新 */
export async function updateStudent(
  studentId: string,
  input: { goal?: string; memo?: string; member_code?: string }
): Promise<{ error?: string }> {
  const { admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  const { error } = await admin
    .from("lsn_students")
    .update({
      goal: input.goal?.trim().slice(0, 300) || null,
      memo: input.memo?.trim().slice(0, 2000) || null,
      member_code: input.member_code?.trim().slice(0, 40) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", studentId);
  if (error) return { error: error.message };
  revalidatePath(`/students/${studentId}`);
  return {};
}
