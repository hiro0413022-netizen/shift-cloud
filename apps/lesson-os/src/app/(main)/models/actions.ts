"use server";

import { revalidatePath } from "next/cache";
import { requireLessonActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { encSeg } from "@/lib/libkey";

/** コーチのお手本スイング（PGA NOTE準拠 / DECISIONS #50） */
const BUCKET = "lesson-videos";
const MAX_VIDEO = 200 * 1024 * 1024;

export async function createModelUploadUrl(
  filename: string,
  size: number
): Promise<{ url?: string; path?: string; error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  if (!filename) return { error: "ファイルがありません" };
  if (size > MAX_VIDEO) return { error: "200MB以下の動画にしてください" };
  const safe = filename.replace(/[\\/:*?"<>|]/g, "_").slice(0, 100);
  const path = `${actor.companyId}/models/${Date.now()}_${encSeg(safe)}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl, path };
}

export async function registerModel(input: {
  path: string;
  club?: string;
  distanceYd?: number;
  note?: string;
}): Promise<{ error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  if (!input.path.startsWith(`${actor.companyId}/models/`)) return { error: "不正なパスです" };
  const { error } = await admin.from("lsn_model_videos").insert({
    company_id: actor.companyId,
    coach_staff_id: actor.staffId,
    storage_path: input.path,
    club: input.club?.trim().slice(0, 20) || null,
    distance_yd: input.distanceYd && input.distanceYd > 0 ? Math.floor(input.distanceYd) : null,
    note: input.note?.trim().slice(0, 300) || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/models");
  return {};
}

export async function modelPlayUrl(id: string): Promise<{ url?: string; error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data: m } = await admin
    .from("lsn_model_videos")
    .select("storage_path, company_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!m || m.company_id !== actor.companyId) return { error: "動画が見つかりません" };
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(m.storage_path, 1800);
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl };
}

export async function removeModel(id: string): Promise<{ error?: string }> {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { error } = await admin
    .from("lsn_model_videos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  if (error) return { error: error.message };
  revalidatePath("/models");
  return {};
}
