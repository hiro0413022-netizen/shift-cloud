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

/** サムネイル（1コマ目JPEG）のアップロードURL。失敗しても登録は止めない前提の任意処理 */
export async function createPosterUploadUrl(
  studentId: string,
  size: number
): Promise<{ url?: string; path?: string; error?: string }> {
  const { actor, admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  if (size > 2 * 1024 * 1024) return { error: "サムネイルが大きすぎます" };
  const path = `${actor.companyId}/posters/${studentId}_${Date.now()}.jpg`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl, path };
}

export async function registerVideo(
  studentId: string,
  input: {
    path: string;
    posterPath?: string | null;
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
  const poster =
    input.posterPath && input.posterPath.startsWith(`${actor.companyId}/posters/`) ? input.posterPath : null;
  const { error } = await admin.from("lsn_videos").insert({
    company_id: actor.companyId,
    student_id: studentId,
    storage_path: input.path,
    poster_path: poster,
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

/* ------------------------------------------------------------------ */
/* スイング解析（骨格・クラブ軌跡・プレーン） — 2026-08-28              */
/*                                                                      */
/* 解析そのものはブラウザ（src/lib/pose.ts）。ここは保管だけ。          */
/* lsn_videos に列を足さず別テーブルにしたのは、1本あたり数百KBあり、    */
/* カルテの一覧（1人20本超）に載せると重くなるため（0129 / 0130）。     */
/* ------------------------------------------------------------------ */

type PoseDataIn = { v: 1; t: number[]; p: number[][] };
type ClubDataIn = { v: 1; t: number[]; p: number[][]; clubLen: number };
type PlaneIn = { x1: number; y1: number; x2: number; y2: number; _method: "address" | "manual" };
/** クラブ検出がどこで落ちたか。取れなかったときに現場で打つ手を決めるための数字 */
type ClubDiagIn = {
  frames: number; withPose: number; withRay: number; kept: number; final: number;
  thr: number; fill: number; conf: number; gap: number;
};
const DIAG_KEYS = ["frames", "withPose", "withRay", "kept", "final", "thr", "fill", "conf", "gap"] as const;
function cleanDiag(d: unknown): ClubDiagIn | null {
  if (!d || typeof d !== "object") return null;
  const src = d as Record<string, unknown>;
  const out = {} as Record<string, number>;
  for (const k of DIAG_KEYS) {
    const n = Number(src[k]);
    out[k] = isFinite(n) ? Math.round(n) : 0;
  }
  return out as unknown as ClubDiagIn;
}

const num01 = (n: unknown) => (typeof n === "number" && isFinite(n) ? Math.max(-2, Math.min(3, n)) : null);

/** 線が0〜1の座標として妥当かだけ見る（画面外へ伸ばすぶんがあるので少し余裕を持たせる） */
function cleanPlane(pl: unknown): PlaneIn | null {
  const o = pl as Partial<PlaneIn> | null;
  if (!o) return null;
  const v = [num01(o.x1), num01(o.y1), num01(o.x2), num01(o.y2)];
  if (v.some((n) => n === null)) return null;
  const [x1, y1, x2, y2] = v as number[];
  if (Math.hypot(x2 - x1, y2 - y1) < 0.02) return null;
  return { x1, y1, x2, y2, _method: o._method === "manual" ? "manual" : "address" };
}

/** 解析結果の受け取り。壊れた形は入れずに弾く（DBを汚さない） */
export async function savePose(
  videoId: string,
  track: {
    engine: string;
    fps: number;
    srcFps?: number | null;
    width: number;
    height: number;
    frames: number;
    detected: number;
    data: PoseDataIn;
    club?: ClubDataIn | null;
    plane?: PlaneIn | null;
    diag?: ClubDiagIn | null;
  }
): Promise<{ error?: string }> {
  const { actor, admin, video } = await ownVideo(videoId);
  if (!video) return { error: "動画が見つかりません" };

  const t = Array.isArray(track?.data?.t) ? track.data.t : [];
  const p = Array.isArray(track?.data?.p) ? track.data.p : [];
  if (!t.length || t.length !== p.length) return { error: "解析結果が不正です" };
  if (t.length > 1400) return { error: "コマ数が多すぎます" };
  // 1コマは 33関節×3 の 99個ちょうど（未検出は空配列）
  if (p.some((row) => !Array.isArray(row) || (row.length !== 0 && row.length !== 99))) {
    return { error: "解析結果が不正です" };
  }

  // クラブは 1コマ [x, y, conf] の3個ちょうど（未検出は空配列）。骨格とコマ数が揃っていること
  let club: ClubDataIn | null = null;
  const ct = track.club?.t;
  const cp = track.club?.p;
  if (Array.isArray(ct) && Array.isArray(cp) && ct.length === t.length && cp.length === t.length) {
    if (!cp.some((row) => !Array.isArray(row) || (row.length !== 0 && row.length !== 3))) {
      club = { v: 1, t: ct, p: cp, clubLen: Math.round(Number(track.club?.clubLen) || 0) };
    }
  }

  const { error } = await admin.from("lsn_video_pose").upsert(
    {
      video_id: video.id,
      company_id: actor.companyId,
      engine: String(track.engine ?? "").slice(0, 120),
      fps: Number(track.fps) || null,
      src_fps: Number(track.srcFps) || null,
      width: Math.round(Number(track.width) || 0) || null,
      height: Math.round(Number(track.height) || 0) || null,
      frames: t.length,
      detected: Math.max(0, Math.min(t.length, Math.round(Number(track.detected) || 0))),
      data: { v: 1, t, p },
      club,
      plane: cleanPlane(track.plane),
      diag: cleanDiag(track.diag),
      analyzed_by: actor.staffId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "video_id" }
  );
  if (error) return { error: error.message };
  return {};
}

export type LoadedPose = {
  engine: string;
  fps: number | null;
  srcFps: number | null;
  width: number | null;
  height: number | null;
  frames: number;
  detected: number;
  data: PoseDataIn;
  club: ClubDataIn | null;
  plane: PlaneIn | null;
  diag: ClubDiagIn | null;
};

/** プレーヤーを開いたときに1本ぶんだけ取りに行く */
export async function loadPose(videoId: string): Promise<{ pose?: LoadedPose | null; error?: string }> {
  const { admin, video } = await ownVideo(videoId);
  if (!video) return { error: "動画が見つかりません" };
  const { data, error } = await admin
    .from("lsn_video_pose")
    .select("engine, fps, src_fps, width, height, frames, detected, data, club, plane, diag")
    .eq("video_id", video.id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { pose: null };
  const r = data as Record<string, unknown>;
  return {
    pose: {
      engine: String(r.engine ?? ""),
      fps: (r.fps as number | null) ?? null,
      srcFps: (r.src_fps as number | null) ?? null,
      width: (r.width as number | null) ?? null,
      height: (r.height as number | null) ?? null,
      frames: Number(r.frames ?? 0),
      detected: Number(r.detected ?? 0),
      data: r.data as PoseDataIn,
      club: (r.club as ClubDataIn | null) ?? null,
      plane: (r.plane as PlaneIn | null) ?? null,
      diag: (r.diag as ClubDiagIn | null) ?? null,
    },
  };
}

/**
 * プレーンだけ差し替える（自動が外れたときにコーチが線を引き直す逃げ道）。
 * 手で引いた線は _method="manual" になり、解析し直しても手動が優先される。
 */
export async function savePlane(videoId: string, plane: PlaneIn | null): Promise<{ error?: string }> {
  const { admin, video } = await ownVideo(videoId);
  if (!video) return { error: "動画が見つかりません" };
  const cleaned = plane ? cleanPlane(plane) : null;
  if (plane && !cleaned) return { error: "線が短すぎます" };
  const { error } = await admin
    .from("lsn_video_pose")
    .update({ plane: cleaned, updated_at: new Date().toISOString() })
    .eq("video_id", video.id);
  if (error) return { error: error.message };
  return {};
}

/** 撮り直しではなく解析だけやり直したいとき用 */
export async function removePose(videoId: string): Promise<{ error?: string }> {
  const { admin, video } = await ownVideo(videoId);
  if (!video) return { error: "動画が見つかりません" };
  const { error } = await admin.from("lsn_video_pose").delete().eq("video_id", video.id);
  return error ? { error: error.message } : {};
}

/* ------------------------------------------------------------------ */
/* レッスンメモ（会話の録音 → AI要約 → コーチが確認して確定） 2026-08-28  */
/*                                                                      */
/* 設計の柱は3つ。ここを崩さないこと。                                  */
/*   1. 同意なしに録音は始められない（consent_at を必ず立ててから作る）   */
/*   2. 音声は要約が済んだら消す（残すのは要約と、コーチが直した本文）    */
/*   3. AIは下書き。カルテと共有ページに出るのは body だけ               */
/* ------------------------------------------------------------------ */

const MAX_NOTE_AUDIO = 60 * 1024 * 1024; // 音声のみ・1時間ぶんでも十分な余裕

export type LessonNoteItem = {
  id: string;
  lessonDate: string;
  status: string;
  hasAudio: boolean;
  seconds: number | null;
  body: string | null;
  summary: {
    today: string[]; homework: string[]; studentWords: string[]; clubs: string[]; next: string[];
  } | null;
  transcript: string | null;
  shareBody: string | null;
  symptoms: NoteSymptom[];
  coach: string;
  error: string | null;
};

/**
 * 録音を始める前に呼ぶ。**同意の記録がこの行の存在意義**なので、
 * 同意なしでは作らない（録音ボタンはこの戻り値が無いと押せない）。
 */
export async function startLessonNote(
  studentId: string,
  lessonDate: string,
  consent: boolean
): Promise<{ id?: string; error?: string }> {
  const { actor, admin, ok } = await ownStudent(studentId);
  if (!ok) return { error: "生徒が見つかりません" };
  if (!consent) return { error: "お客様の同意を確認してから録音してください" };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(lessonDate) ? lessonDate : new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("lsn_lesson_notes")
    .insert({
      company_id: actor.companyId,
      student_id: studentId,
      lesson_date: date,
      coach_staff_id: actor.staffId,
      status: "draft",
      consent_at: new Date().toISOString(),
      consent_by: actor.staffId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "作成に失敗しました" };
  return { id: (data as { id: string }).id };
}

async function ownNote(noteId: string) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("lsn_lesson_notes")
    .select("id, student_id, company_id, audio_path, lsn_students(store_id)")
    .eq("id", noteId)
    .is("deleted_at", null)
    .maybeSingle();
  type Row = {
    id: string; student_id: string; company_id: string; audio_path: string | null;
    lsn_students: { store_id: string | null } | { store_id: string | null }[] | null;
  };
  const row = data as unknown as Row | null;
  if (!row || row.company_id !== actor.companyId) return { actor, admin, note: null };
  const st = Array.isArray(row.lsn_students) ? row.lsn_students[0] : row.lsn_students;
  if (!canAccessStore(actor, st?.store_id ?? null)) return { actor, admin, note: null };
  return { actor, admin, note: { id: row.id, studentId: row.student_id, audioPath: row.audio_path } };
}

/** 録音が終わったら音声を直PUTするためのURL */
export async function createNoteUploadUrl(
  noteId: string,
  ext: string,
  size: number
): Promise<{ url?: string; path?: string; error?: string }> {
  const { actor, admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  if (size > MAX_NOTE_AUDIO) return { error: "録音が長すぎます。分けて録音してください" };
  const safeExt = /^[a-z0-9]{2,5}$/.test(ext) ? ext : "webm";
  const path = `${actor.companyId}/${note.studentId}/notes/${Date.now()}.${safeExt}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl, path };
}

export async function finishNoteUpload(
  noteId: string,
  path: string,
  seconds: number,
  bytes: number
): Promise<{ error?: string }> {
  const { admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  const { error } = await admin
    .from("lsn_lesson_notes")
    .update({
      audio_path: path,
      audio_seconds: Math.max(0, Math.round(seconds)) || null,
      audio_bytes: Math.max(0, Math.round(bytes)) || null,
      status: "uploaded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", note.id);
  return error ? { error: error.message } : {};
}

/** コーチが直した本文を確定する。カルテに出るのはこれだけ */
export async function saveLessonNote(noteId: string, body: string): Promise<{ error?: string }> {
  const { admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  const text = body.trim().slice(0, 4000);
  if (!text) return { error: "本文を入力してください" };
  const { error } = await admin
    .from("lsn_lesson_notes")
    .update({ body: text, status: "saved", updated_at: new Date().toISOString() })
    .eq("id", note.id);
  if (error) return { error: error.message };
  const { data } = await admin.from("lsn_lesson_notes").select("student_id").eq("id", note.id).maybeSingle();
  revalidatePath(`/students/${(data as { student_id: string } | null)?.student_id ?? note.studentId}`);
  return {};
}

/**
 * 音声を消す。要約が済んだら押せるようにしてあり、確定保存のときは自動で呼ぶ。
 * 「残すのは要約と本文だけ」という約束をコードで守る。
 */
export async function deleteNoteAudio(noteId: string): Promise<{ error?: string }> {
  const { admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  if (note.audioPath) {
    const { error } = await admin.storage.from(BUCKET).remove([note.audioPath]);
    if (error) return { error: error.message };
  }
  const { error } = await admin
    .from("lsn_lesson_notes")
    .update({ audio_path: null, audio_deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", note.id);
  return error ? { error: error.message } : {};
}

/** 文字起こしを消す（本文が正典なので、確認が済んだら消してよい） */
export async function deleteNoteTranscript(noteId: string): Promise<{ error?: string }> {
  const { admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  const { error } = await admin
    .from("lsn_lesson_notes")
    .update({ transcript: null, updated_at: new Date().toISOString() })
    .eq("id", note.id);
  return error ? { error: error.message } : {};
}

export async function removeLessonNote(noteId: string): Promise<{ error?: string }> {
  const { admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  if (note.audioPath) await admin.storage.from(BUCKET).remove([note.audioPath]);
  const { error } = await admin
    .from("lsn_lesson_notes")
    .update({ deleted_at: new Date().toISOString(), audio_path: null })
    .eq("id", note.id);
  if (error) return { error: error.message };
  revalidatePath(`/students/${note.studentId}`);
  return {};
}

/** 1件ぶん読み直す（要約が終わったあとの画面更新用） */
export async function loadLessonNote(noteId: string): Promise<{ note?: LessonNoteItem; error?: string }> {
  const { admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  const { data, error } = await admin
    .from("lsn_lesson_notes")
    .select("id, lesson_date, status, audio_path, audio_seconds, body, summary, transcript, share_body, error, staff:coach_staff_id(name)")
    .eq("id", note.id)
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "読み込めませんでした" };
  const r = data as Record<string, unknown>;
  const tags = await loadNoteSymptoms(noteId);
  return {
    note: {
      id: String(r.id),
      lessonDate: String(r.lesson_date),
      status: String(r.status),
      hasAudio: !!r.audio_path,
      seconds: (r.audio_seconds as number | null) ?? null,
      body: (r.body as string | null) ?? null,
      summary: (r.summary as LessonNoteItem["summary"]) ?? null,
      transcript: (r.transcript as string | null) ?? null,
      shareBody: (r.share_body as string | null) ?? null,
      symptoms: tags.items ?? [],
      coach: ((r.staff as { name: string } | null)?.name) ?? "",
      error: (r.error as string | null) ?? null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* レッスンメモ × AIカルテナレッジ（症状タグ）2026-08-28                */
/*                                                                      */
/* AIがやるのは分類だけ。本文はコーチの言葉のまま。                     */
/* コーチはタップで○×を付けるだけで、記録が「検索できる資産」になる。   */
/* ------------------------------------------------------------------ */

export type NoteSymptom = {
  id: string;
  symptomId: string;
  symptom: string;
  category: string | null;
  checkpointId: string | null;
  checkpoint: string | null;
  quote: string | null;
  confidence: number;
  source: string;
  rejected: boolean;
};

export type SymptomOption = {
  id: string;
  name: string;
  category: string | null;
  checkpoints: { id: string; title: string }[];
};

/** 手でタグを足すための一覧（店のメソッドそのもの） */
export async function listCompanySymptoms(): Promise<{ options?: SymptomOption[]; error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const [{ data: sym }, { data: cps }] = await Promise.all([
    admin.from("sc_symptoms")
      .select("id, name, category, sort_order")
      .eq("company_id", actor.companyId).eq("active", true).is("deleted_at", null)
      .order("sort_order").order("name"),
    admin.from("sc_checkpoints")
      .select("id, symptom_id, title, priority")
      .eq("company_id", actor.companyId).is("deleted_at", null)
      .order("priority"),
  ]);
  const options: SymptomOption[] = (sym ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id),
      name: String(x.name),
      category: (x.category as string | null) ?? null,
      checkpoints: (cps ?? [])
        .filter((c) => String((c as { symptom_id: string }).symptom_id) === String(x.id))
        .map((c) => ({ id: String((c as { id: string }).id), title: String((c as { title: string }).title) })),
    };
  });
  return { options };
}

/**
 * コーチの○×。**外したものは消さずに rejected で残す**。
 * 何が外れやすいかが分かれば、ナレッジ側を直す材料になる。
 */
export async function setNoteSymptomRejected(rowId: string, rejected: boolean): Promise<{ error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { error } = await admin
    .from("lsn_note_symptoms")
    .update({ rejected })
    .eq("id", rowId)
    .eq("company_id", actor.companyId);
  return error ? { error: error.message } : {};
}

export async function addNoteSymptom(
  noteId: string,
  symptomId: string,
  checkpointId: string | null
): Promise<{ error?: string }> {
  const { actor, admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  // 症状が自社のものか必ず確かめる（IDはクライアントから来る）
  const { data: sym } = await admin
    .from("sc_symptoms").select("id").eq("id", symptomId).eq("company_id", actor.companyId).maybeSingle();
  if (!sym) return { error: "症状が見つかりません" };
  if (checkpointId) {
    const { data: cp } = await admin
      .from("sc_checkpoints").select("id").eq("id", checkpointId).eq("company_id", actor.companyId)
      .eq("symptom_id", symptomId).maybeSingle();
    if (!cp) return { error: "確認項目が見つかりません" };
  }
  const { error } = await admin.from("lsn_note_symptoms").upsert(
    {
      company_id: actor.companyId,
      note_id: note.id,
      student_id: note.studentId,
      symptom_id: symptomId,
      checkpoint_id: checkpointId,
      confidence: 100,
      source: "coach",
      rejected: false,
    },
    { onConflict: "note_id,symptom_id,checkpoint_id" }
  );
  return error ? { error: error.message } : {};
}

/** お客様の共有ページに出す説明文。下敷きはナレッジの client_explanation */
export async function saveShareBody(noteId: string, text: string): Promise<{ error?: string }> {
  const { admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  const { error } = await admin
    .from("lsn_lesson_notes")
    .update({ share_body: text.trim().slice(0, 3000) || null, updated_at: new Date().toISOString() })
    .eq("id", note.id);
  if (error) return { error: error.message };
  revalidatePath(`/students/${note.studentId}`);
  return {};
}

/** 1件ぶんのタグを読み直す */
export async function loadNoteSymptoms(noteId: string): Promise<{ items?: NoteSymptom[]; error?: string }> {
  const { actor, admin, note } = await ownNote(noteId);
  if (!note) return { error: "メモが見つかりません" };
  const { data } = await admin
    .from("lsn_note_symptoms")
    .select("id, symptom_id, checkpoint_id, quote, confidence, source, rejected, sc_symptoms(name, category), sc_checkpoints(title)")
    .eq("note_id", note.id)
    .eq("company_id", actor.companyId)
    .order("confidence", { ascending: false });
  return { items: (data ?? []).map(mapNoteSymptom) };
}

/** page.tsx と共用（ネスト取得は配列型に推論されることがあるので両対応・#76と同種） */
export function mapNoteSymptom(r: unknown): NoteSymptom {
  const x = r as Record<string, unknown>;
  const s = Array.isArray(x.sc_symptoms) ? x.sc_symptoms[0] : x.sc_symptoms;
  const c = Array.isArray(x.sc_checkpoints) ? x.sc_checkpoints[0] : x.sc_checkpoints;
  return {
    id: String(x.id),
    symptomId: String(x.symptom_id),
    symptom: String((s as { name?: string } | null)?.name ?? "（不明な症状）"),
    category: ((s as { category?: string | null } | null)?.category) ?? null,
    checkpointId: (x.checkpoint_id as string | null) ?? null,
    checkpoint: ((c as { title?: string } | null)?.title) ?? null,
    quote: (x.quote as string | null) ?? null,
    confidence: Number(x.confidence ?? 0),
    source: String(x.source ?? "ai"),
    rejected: Boolean(x.rejected),
  };
}
