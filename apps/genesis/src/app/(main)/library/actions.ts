"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * 資料室（2026-07-13ユーザー要望）
 * PCに保存されている資料をGenesisからダウンロードできるようにする置き場。
 * 保存先はプライベートバケット `library`（service_role専用・ポリシーなし）。
 * リポジトリはPublicのため、資料をリポジトリ/デプロイに同梱しない（この設計が重要）。
 */
const BUCKET = "library";
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

export async function uploadDoc(formData: FormData): Promise<{ error?: string }> {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const file = formData.get("file") as File | null;
  const category = String(formData.get("category") || "その他").trim().slice(0, 40).replace(/[\\/:*?"<>|]/g, "_") || "その他";
  if (!file || file.size === 0) return { error: "ファイルを選択してください" };
  if (file.size > MAX_SIZE) return { error: "25MB以下のファイルにしてください" };
  const safeName = file.name.replace(/[\\/:*?"<>|]/g, "_");
  const path = `${actor.companyId}/${category}/${Date.now()}_${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return { error: error.message };
  revalidatePath("/library");
  return {};
}

/** 署名付きダウンロードURL（60秒有効・元のファイル名でDL） */
export async function downloadUrl(path: string): Promise<{ url?: string; error?: string }> {
  const actor = await requireGenesisActor();
  if (!path.startsWith(`${actor.companyId}/`)) return { error: "不正なパスです" };
  const admin = createAdmin();
  const original = path.split("/").pop()?.replace(/^\d+_/, "") ?? "download";
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
