"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { requireLessonActor, canAccessStore } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { encSeg } from "@/lib/libkey";
import type { Annotations } from "@/lib/lesson";
import { sanitizePhases, type Phases } from "@/lib/phases";
import { sanitizeTrackman, type TrackmanValues } from "@/lib/trackman";
import { readTrackmanImage } from "@/lib/trackman-ai";

/**
 * 生徒カルテのアクション（DECISIONS #49/#50）
 * 動画・写真は署名付きアップロードURLでブラウザ→Storage直PUT。キーは日本語不可のためenc。
 */
const BUCKET = "lesson-videos";
const MAX_VIDEO = 200 * 1024 * 1024; // 200MB（Storageグローバル上限に合わせる）
const MAX_PHOTO = 10 * 1024 * 1024;
const MAX_MEASURE_PHOTO = 5 * 1024 * 1024; // Claude APIの画像上限に合わせる

/**
 * このカルテを触ってよいか。すべての書き込みアクションがここを通る。
 * 会社だけでなく店舗も見る（#134 / DECISIONS #128。FRANK のカルテを GOLF WING から編集させない）
 */
async function ownStudent(studentId: string) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("lsn_students")
    .select("id, store_id")
    .eq("id", studentId)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as { id: string; store_id: string | null } | null;
  return { actor, admin, ok: !!row && canAccessStore(actor, row.store_id) };
}

/**
 * この動画を触ってよいか（2026-08-22 追加）。
 *
 * それまで動画単位のアクション（コメント・ベスト・削除・描画・フェーズ・再生URL）は
 * company_id しか見ておらず、動画IDさえ分かれば他店舗のカルテを操作できた。
 * ownStudent と同じ判定を通す＝#134「店舗またぎ廃止」の穴を塞ぐ。
 */
async function ownVideo(videoId: string) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("lsn_videos")
    // ネスト取得は配列型に推論されることがある（#76と同種）ので下で両対応にする
    .select("id, student_id, company_id, lsn_students(store_id)")
    .eq("id", videoId)
    .is("deleted_at", null)
    .maybeSingle();
  type Row = {
    id: string;
    student_id: string;
    company_id: string;
    lsn_students: { store_id: string | null } | { store_id: string | null }[] | null;
  };
  const row = data as unknown as Row | null;
  if (!row || row.company_id !== actor.companyId) return { actor, admin, video: null };
  const st = Array.isArray(row.lsn_students) ? row.lsn_students[0] : row.lsn_students;
  if (!canAccessStore(actor, st?.store_id ?? null)) return { actor, admin, video: null };
  return { actor, admin, video: { id: row.id, studentId: row.student_id } };
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
  const { admin, video } = await ownVideo(videoId);
  if (!video) return { error: "動画が見つかりません" };
  const patch: Record<string, unknown> = {
    phases: sanitizePhases(phases, duration),
    updated_at: new Date().toISOString(),
  };
  if (duration && duration > 0) patch.duration_sec = Number(duration.toFixed(2));
  const { error } = await admin.from("lsn_videos").update(patch).eq("id", video.id);
  if (error) return { error: error.message };
  revalidatePath(`/students/${video.studentId}`);
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
    // 生徒の動画は店舗まで見る（#134）。お手本（lsn_model_videos）は会社共通なので会社だけ見る
    const { video } = await ownVideo(id);
    let path: string | null = null;
    if (video) {
      const { data: v } = await admin.from("lsn_videos").select("storage_path").eq("id", video.id).maybeSingle();
      path = (v as { storage_path: string } | null)?.storage_path ?? null;
    } else {
      const { data: m } = await admin
        .from("lsn_model_videos")
        .select("storage_path, company_id")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      const mm = m as { storage_path: string; company_id: string } | null;
      path = mm && mm.company_id === actor.companyId ? mm.storage_path : null;
    }
    if (!path) return { error: "動画が見つかりません" };
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 1800);
    if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
    urls[id] = data.signedUrl;
  }
  return { urls };
}

export async function addComment(videoId: string, body: string): Promise<{ error?: string }> {
  const { actor, admin, video } = await ownVideo(videoId);
  if (!video) return { error: "動画が見つかりません" };
  const text = body.trim();
  if (!text) return { error: "コメントを入力してください" };
  const { error } = await admin.from("lsn_comments").insert({
    company_id: actor.companyId,
    video_id: video.id,
    coach_staff_id: actor.staffId,
    body: text.slice(0, 2000),
  });
  if (error) return { error: error.message };
  revalidatePath(`/students/${video.studentId}`);
  return {};
}

/** ベストスイング印（生徒ごとに1本） */
export async function markBest(videoId: string): Promise<{ error?: string }> {
  const { admin, video } = await ownVideo(videoId);
  if (!video) return { error: "動画が見つかりません" };
  const { data: cur } = await admin.from("lsn_videos").select("is_best").eq("id", video.id).maybeSingle();
  const isBest = Boolean((cur as { is_best: boolean } | null)?.is_best);
  if (!isBest) {
    await admin.from("lsn_videos").update({ is_best: false }).eq("student_id", video.studentId).eq("is_best", true);
  }
  const { error } = await admin.from("lsn_videos").update({ is_best: !isBest }).eq("id", video.id);
  if (error) return { error: error.message };
  revalidatePath(`/students/${video.studentId}`);
  return {};
}

export async function removeVideo(videoId: string): Promise<{ error?: string }> {
  const { admin, video } = await ownVideo(videoId);
  if (!video) return { error: "動画が見つかりません" };
  const { error } = await admin
    .from("lsn_videos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", video.id);
  if (error) return { error: error.message };
  revalidatePath(`/students/${video.studentId}`);
  return {};
}

/** 動画への描画（線・円・フリーハンド）を保存 */
export async function saveAnnotations(videoId: string, annotations: Annotations): Promise<{ error?: string }> {
  const { admin, video } = await ownVideo(videoId);
  if (!video) return { error: "動画が見つかりません" };
  const shapes = (annotations?.shapes ?? []).slice(0, 200);
  const { error } = await admin
    .from("lsn_videos")
    .update({ annotations: { shapes }, updated_at: new Date().toISOString() })
    .eq("id", video.id);
  if (error) return { error: error.message };
  revalidatePath(`/students/${video.studentId}`);
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

/* ============================================================
   トラックマン計測（写真をAIで読む → 人が直して確定）2026-08-22
   ============================================================ */

/** 計測写真のアップロードURL */
export async function createMeasureUploadUrl(
  studentId: string,
  filename: string,
  size: number
): Promise<{ url?: string; path?: string; error?: string }> {
  const { actor, admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  if (size > MAX_MEASURE_PHOTO) return { error: "写真は5MB以下にしてください（撮り直すか小さくしてください）" };
  const safe = (filename || "trackman.jpg").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
  const path = `${actor.companyId}/measurements/${studentId}_${Date.now()}_${encSeg(safe)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl, path };
}

/** アップロード済みの写真をAIに読ませる（保存はしない。返した値を画面で直してもらう） */
export async function readMeasurePhoto(
  studentId: string,
  path: string,
  mimeType: string
): Promise<{ values?: TrackmanValues; raw?: unknown; club?: string | null; warning?: string | null; error?: string }> {
  const { actor, admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  if (!path.startsWith(`${actor.companyId}/measurements/`)) return { error: "不正なパスです" };
  const dl = await admin.storage.from(BUCKET).download(path);
  if (!dl.data) return { error: "写真を読み込めませんでした" };
  const result = await readTrackmanImage(await dl.data.arrayBuffer(), mimeType);
  if ("error" in result) return { error: result.error };
  return { values: result.values, raw: result.raw, club: result.club, warning: result.warning };
}

/** 確定保存（人が確認・修正したあとの値） */
export async function saveMeasurement(
  studentId: string,
  input: {
    path?: string | null;
    measuredAt?: string;
    club?: string;
    note?: string;
    values: TrackmanValues;
    aiRaw?: unknown;
  }
): Promise<{ error?: string }> {
  const { actor, admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  if (input.path && !input.path.startsWith(`${actor.companyId}/measurements/`)) return { error: "不正なパスです" };
  const values = sanitizeTrackman(input.values);
  if (Object.keys(values).filter((k) => k !== "_units").length === 0) {
    return { error: "数値が1つも入っていません" };
  }
  // measured_at は日付だけ受け取る（トラックマンの写真から時刻までは取らない）
  const day = /^\d{4}-\d{2}-\d{2}$/.test(input.measuredAt ?? "")
    ? `${input.measuredAt}T00:00:00+09:00`
    : new Date().toISOString();
  const { error } = await admin.from("lsn_measurements").insert({
    company_id: actor.companyId,
    student_id: studentId,
    source: "trackman",
    measured_at: day,
    club: input.club?.trim().slice(0, 20) || null,
    note: input.note?.trim().slice(0, 500) || null,
    data: values,
    ai_raw: input.aiRaw ?? null,
    photo_path: input.path ?? null,
    imported_by: actor.staffId,
    confirmed_at: new Date().toISOString(),
    confirmed_by: actor.staffId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/students/${studentId}`);
  return {};
}

export async function removeMeasurement(measurementId: string): Promise<{ error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("lsn_measurements")
    .select("id, student_id, company_id")
    .eq("id", measurementId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as { id: string; student_id: string; company_id: string } | null;
  if (!row || row.company_id !== actor.companyId) return { error: "計測が見つかりません" };
  const { ok } = await ownStudent(row.student_id);
  if (!ok) return { error: "計測が見つかりません" };
  const { error } = await admin
    .from("lsn_measurements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) return { error: error.message };
  revalidatePath(`/students/${row.student_id}`);
  return {};
}

/** 保存済みの計測写真を見る（30分有効） */
export async function measurePhotoUrl(measurementId: string): Promise<{ url?: string; error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("lsn_measurements")
    .select("student_id, company_id, photo_path")
    .eq("id", measurementId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as { student_id: string; company_id: string; photo_path: string | null } | null;
  if (!row || row.company_id !== actor.companyId || !row.photo_path) return { error: "写真がありません" };
  const { ok } = await ownStudent(row.student_id);
  if (!ok) return { error: "写真がありません" };
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(row.photo_path, 1800);
  return signed?.signedUrl ? { url: signed.signedUrl } : { error: "URLの発行に失敗しました" };
}
