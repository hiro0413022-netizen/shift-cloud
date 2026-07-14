"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { requireLessonActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { encSeg } from "@/lib/libkey";
import type { Annotations } from "@/lib/lesson";
import { sanitizePhases, type Phases } from "@/lib/phases";

/**
 * 生徒カルテのアクション（DECISIONS #49/#50）
 * 動画・写真は署名付きアップロードURLでブラウザ→Storage直PUT。キーは日本語不可のためenc。
 */
const BUCKET = "lesson-videos";
const MAX_VIDEO = 200 * 1024 * 1024; // 200MB（Storageグローバル上限に合わせる）
const MAX_PHOTO = 10 * 1024 * 1024;

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
  if (size > MAX_VIDEO) return { error: "200MB以下の動画にしてください" };
  const safe = filename.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100);
  const path = `${actor.companyId}/${studentId}/${Date.now()}_${encSeg(safe)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl, path };
}

export async function registerVideo(
  studentId: string,
  input: {
    path: string;
    shotAt?: string;
    club?: string;
    distanceYd?: number;
    note?: string;
    size?: number;
    phases?: Phases | null;
    duration?: number;
    source?: "recorder" | "upload";
  }
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
    distance_yd: input.distanceYd && input.distanceYd > 0 ? Math.floor(input.distanceYd) : null,
    note: input.note?.trim().slice(0, 500) || null,
    size_bytes: input.size ?? null,
    phases: input.phases ? sanitizePhases(input.phases, input.duration) : {},
    duration_sec: input.duration && input.duration > 0 ? Number(input.duration.toFixed(2)) : null,
    source: input.source ?? "upload",
    uploaded_by: actor.staffId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/students/${studentId}`);
  return {};
}

/** スイングフェーズ（アドレス〜フィニッシュの秒数）の保存 — 自動推定の結果も手動調整もここを通る */
export async function savePhases(
  videoId: string,
  phases: Phases,
  duration?: number
): Promise<{ error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data: video } = await admin
    .from("lsn_videos")
    .select("id, student_id, company_id")
    .eq("id", videoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!video || video.company_id !== actor.companyId) return { error: "動画が見つかりません" };
  const patch: Record<string, unknown> = {
    phases: sanitizePhases(phases, duration),
    updated_at: new Date().toISOString(),
  };
  if (duration && duration > 0) patch.duration_sec = Number(duration.toFixed(2));
  const { error } = await admin.from("lsn_videos").update(patch).eq("id", video.id);
  if (error) return { error: error.message };
  revalidatePath(`/students/${video.student_id}`);
  return {};
}

/** 再生用の署名URL（30分有効・比較再生用に複数まとめて取得可） */
export async function videoPlayUrls(
  videoIds: string[]
): Promise<{ urls?: Record<string, string>; error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  if (videoIds.length === 0 || videoIds.length > 4) return { error: "動画は1〜4本で指定してください" };
  const urls: Record<string, string> = {};
  for (const id of videoIds) {
    const { data: v } = await admin
      .from("lsn_videos")
      .select("storage_path, company_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    let path = v && v.company_id === actor.companyId ? v.storage_path : null;
    if (!path) {
      const { data: m } = await admin
        .from("lsn_model_videos")
        .select("storage_path, company_id")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      path = m && m.company_id === actor.companyId ? m.storage_path : null;
    }
    if (!path) return { error: "動画が見つかりません" };
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 1800);
    if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
    urls[id] = data.signedUrl;
  }
  return { urls };
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

/** ベストスイング印（生徒ごとに1本） */
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

/** 動画への描画（線・円・フリーハンド）を保存 */
export async function saveAnnotations(videoId: string, annotations: Annotations): Promise<{ error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data: video } = await admin
    .from("lsn_videos")
    .select("id, student_id, company_id")
    .eq("id", videoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!video || video.company_id !== actor.companyId) return { error: "動画が見つかりません" };
  const shapes = (annotations?.shapes ?? []).slice(0, 200);
  const { error } = await admin
    .from("lsn_videos")
    .update({ annotations: { shapes }, updated_at: new Date().toISOString() })
    .eq("id", video.id);
  if (error) return { error: error.message };
  revalidatePath(`/students/${video.student_id}`);
  return {};
}

/** 進捗（カリキュラム達成度%）の保存 */
export async function saveProgress(
  studentId: string,
  values: { itemId: string; percent: number }[]
): Promise<{ error?: string }> {
  const { actor, admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  for (const v of values.slice(0, 30)) {
    const percent = Math.max(0, Math.min(100, Math.floor(v.percent)));
    const { error } = await admin.from("lsn_progress").upsert(
      {
        company_id: actor.companyId,
        student_id: studentId,
        item_id: v.itemId,
        percent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,item_id" }
    );
    if (error) return { error: error.message };
  }
  revalidatePath(`/students/${studentId}`);
  return {};
}

/** 生徒情報（名前・目標・メモ・会員番号・基本/詳細JSONB）の更新 */
export async function updateStudent(
  studentId: string,
  input: {
    goal?: string;
    memo?: string;
    member_code?: string;
    profile?: Record<string, string>;
    skill?: Record<string, string>;
  }
): Promise<{ error?: string }> {
  const { admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.goal !== undefined) patch.goal = input.goal.trim().slice(0, 300) || null;
  if (input.memo !== undefined) patch.memo = input.memo.trim().slice(0, 2000) || null;
  if (input.member_code !== undefined) patch.member_code = input.member_code.trim().slice(0, 40) || null;
  if (input.profile) patch.profile = input.profile;
  if (input.skill) patch.skill = input.skill;
  const { error } = await admin.from("lsn_students").update(patch).eq("id", studentId);
  if (error) return { error: error.message };
  revalidatePath(`/students/${studentId}`);
  return {};
}

/** 顔写真のアップロードURL発行＋登録 */
export async function createPhotoUploadUrl(
  studentId: string,
  filename: string,
  size: number
): Promise<{ url?: string; path?: string; error?: string }> {
  const { actor, admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  if (size > MAX_PHOTO) return { error: "写真は10MB以下にしてください" };
  const safe = filename.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  const path = `${actor.companyId}/photos/${studentId}_${Date.now()}_${encSeg(safe)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl, path };
}

export async function setPhoto(studentId: string, path: string): Promise<{ error?: string }> {
  const { actor, admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  if (!path.startsWith(`${actor.companyId}/photos/`)) return { error: "不正なパスです" };
  const { error } = await admin
    .from("lsn_students")
    .update({ photo_path: path, updated_at: new Date().toISOString() })
    .eq("id", studentId);
  if (error) return { error: error.message };
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/");
  return {};
}

/** 生徒共有リンクの発行（既存があれば再利用）。生徒はアプリ不要のURLで自分のカルテを閲覧できる */
export async function issueShareLink(studentId: string): Promise<{ url?: string; error?: string }> {
  const { actor, admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  const { data: existing } = await admin
    .from("lsn_share_tokens")
    .select("token")
    .eq("student_id", studentId)
    .is("revoked_at", null)
    .maybeSingle();
  let token = existing?.token;
  if (!token) {
    token = randomBytes(16).toString("base64url");
    const { error } = await admin.from("lsn_share_tokens").insert({
      company_id: actor.companyId,
      student_id: studentId,
      token,
    });
    if (error) return { error: error.message };
  }
  return { url: `/s/${token}` };
}

/** 共有リンクの無効化（URLが漏れたとき用） */
export async function revokeShareLink(studentId: string): Promise<{ error?: string }> {
  const { admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  const { error } = await admin
    .from("lsn_share_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("student_id", studentId)
    .is("revoked_at", null);
  if (error) return { error: error.message };
  revalidatePath(`/students/${studentId}`);
  return {};
}
