"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { encSeg, decSeg } from "@/lib/libkey";

/**
 * 資料室（2026-07-13）
 * アップロードは「署名付きアップロードURL」をサーバで発行し、ブラウザからStorageへ直接PUTする。
 * （旧方式=Server Action経由はVercelのリクエスト上限約4.5MBで大きいファイルが失敗するため変更）
 * 保存先はプライベートバケット `library`。リポジトリはPublicのため資料をリポジトリに置かない。
 */
const BUCKET = "library";
const MAX_SIZE = 50 * 1024 * 1024; // 50MB（Storageの既定上限）

function sanitize(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

/**
 * 署名付きアップロードURLの発行（ブラウザはこのURLへ直接PUTする）。
 * Storageキーは日本語不可（"Invalid key"）のため、分類・ファイル名はbase64urlで持つ（lib/libkey.ts）。
 */
export async function createUploadUrl(
  filename: string,
  category: string,
  size: number
): Promise<{ url?: string; path?: string; error?: string }> {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  if (!filename) return { error: "ファイル名がありません" };
  if (size > MAX_SIZE) return { error: "50MB以下のファイルにしてください" };
  const cat = sanitize(category).slice(0, 40) || "その他";
  const path = `${actor.companyId}/${encSeg(cat)}/${Date.now()}_${encSeg(sanitize(filename).slice(0, 120))}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl, path };
}

/** アップロード完了後の一覧更新 */
export async function refreshLibrary(): Promise<void> {
  await requireGenesisActor();
  revalidatePath("/library");
}

/** 署名付きダウンロードURL（60秒有効・元のファイル名でDL） */
export async function downloadUrl(path: string): Promise<{ url?: string; error?: string }> {
  const actor = await requireGenesisActor();
  if (!path.startsWith(`${actor.companyId}/`)) return { error: "不正なパスです" };
  const admin = createAdmin();
  const original = decSeg(path.split("/").pop()?.replace(/^\d+_/, "") ?? "download");
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60, { download: original });
  if (error || !data) return { error: error?.message ?? "URLの発行に失敗しました" };
  return { url: data.signedUrl };
}

export async function removeDoc(path: string): Promise<{ error?: string }> {
  const actor = await requireGenesisActor();
  if (!path.startsWith(`${actor.companyId}/`)) return { error: "不正なパスです" };
  const admin = createAdmin();
  const { error } = await admin.storage.from(BUCKET).remove([path]);
  if (error) return { error: error.message };
  revalidatePath("/library");
  return {};
}
