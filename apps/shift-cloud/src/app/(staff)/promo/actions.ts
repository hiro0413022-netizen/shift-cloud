"use server";

import { revalidatePath } from "next/cache";
import { requireActor, can } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import {
  PROMO_BUCKET,
  downloadName,
  promoPath,
  promoUploadError,
  resolveMime,
  type PromoKind,
} from "@/lib/promo";

/**
 * 広報素材（#251）のサーバー処理。
 * ファイル本体はブラウザから Storage へ直接送る（Vercel の関数を通すと 4.5MB で切れるため）。
 *   1) beginPromoUpload  … 検査して、署名つきアップロードURLを発行
 *   2) ブラウザが PUT
 *   3) finishPromoUpload … 本当に置かれたか（大きさ）を Storage で確かめてから台帳に登録
 */

type Begin = { url: string; path: string } | { error: string };

export async function beginPromoUpload(input: {
  kind: string;
  title: string;
  fileName: string;
  mime: string;
  size: number;
  durationSec: number | null;
}): Promise<Begin> {
  const actor = await requireActor();
  const bad = promoUploadError(input);
  if (bad) return { error: bad };
  const resolved = resolveMime(input.fileName, input.mime)!;
  const path = promoPath(
    actor.companyId,
    input.kind as PromoKind,
    resolved.ext,
    new Date(),
    Math.random().toString(36).slice(2, 10),
  );
  const { data, error } = await createAdmin().storage.from(PROMO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "アップロードの準備に失敗しました。時間をおいてもう一度お試しください" };
  return { url: data.signedUrl, path };
}

export async function finishPromoUpload(input: {
  path: string;
  kind: string;
  title: string;
  note: string;
  fileName: string;
  mime: string;
  size: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
}): Promise<{ ok: true } | { error: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  const path = String(input.path ?? "");
  // 自社・その種類のフォルダ以外は受け付けない（パスの差し替え対策）
  if (!path.startsWith(`${actor.companyId}/${input.kind}/`) || path.includes("..")) {
    return { error: "保存先が正しくありません" };
  }
  const bad = promoUploadError(input);
  if (bad) {
    await admin.storage.from(PROMO_BUCKET).remove([path]);
    return { error: bad };
  }

  // 実際に置かれたものの大きさで確かめる（申告を信じない）
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data: listed } = await admin.storage.from(PROMO_BUCKET).list(dir, { search: name, limit: 5 });
  const obj = (listed ?? []).find((o) => o.name === name);
  const realSize = Number((obj?.metadata as { size?: number } | null)?.size ?? 0);
  if (!obj || !(realSize > 0)) return { error: "ファイルが届いていませんでした。もう一度お試しください" };

  const resolved = resolveMime(input.fileName, input.mime)!;
  const row = {
    company_id: actor.companyId,
    kind: input.kind,
    title: String(input.title).trim().slice(0, 80),
    note: String(input.note ?? "").trim().slice(0, 200) || null,
    file_path: path,
    file_name: String(input.fileName ?? "").slice(0, 200) || null,
    mime_type: resolved.mime,
    size_bytes: realSize,
    width: Number.isFinite(input.width) && input.width ? Math.round(Number(input.width)) : null,
    height: Number.isFinite(input.height) && input.height ? Math.round(Number(input.height)) : null,
    duration_sec: input.kind === "video" && input.durationSec != null ? Math.round(Number(input.durationSec) * 10) / 10 : null,
    uploaded_by: actor.staffId,
    uploaded_by_name: actor.name,
  };
  const { data: inserted, error } = await admin.from("sp_promo_assets").insert(row).select("id").single();
  if (error || !inserted) {
    console.error("[promo] insert failed", error);
    await admin.storage.from(PROMO_BUCKET).remove([path]);
    return { error: "登録に失敗しました（動画は30秒まで）" };
  }
  await logAudit(actor, "create", "sp_promo_assets", inserted.id, null, row);
  revalidatePath("/promo");
  revalidatePath("/admin/promo");
  return { ok: true };
}

/** 消せるのは 追加した本人 と お知らせ管理（manage_announcements）の人 */
export async function deletePromo(id: string): Promise<{ ok: true } | { error: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  const { data: cur } = await admin
    .from("sp_promo_assets")
    .select("id, company_id, title, file_path, uploaded_by")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cur) return { error: "見つかりません（すでに消されています）" };
  if (cur.uploaded_by !== actor.staffId && !can(actor, "manage_announcements")) {
    return { error: "消せるのは追加した本人か、お知らせ管理の担当者だけです" };
  }
  const { error } = await admin
    .from("sp_promo_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", cur.id);
  if (error) return { error: "削除に失敗しました" };
  // 実体も消す（非公開バケットなので、残しておく理由がない）
  await admin.storage.from(PROMO_BUCKET).remove([cur.file_path]);
  await logAudit(actor, "delete", "sp_promo_assets", cur.id, cur, null);
  revalidatePath("/promo");
  revalidatePath("/admin/promo");
  return { ok: true };
}

/**
 * 外に渡すリンク（7日間だけ有効）。LINE やメールに貼る用。
 * 期限を付けるのは、退職者や社外に回ったリンクがいつまでも使えないようにするため。
 */
export async function promoShareLink(id: string): Promise<{ url: string } | { error: string }> {
  const actor = await requireActor();
  const admin = createAdmin();
  const { data: cur } = await admin
    .from("sp_promo_assets")
    .select("title, file_path")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!cur) return { error: "見つかりません" };
  const { data, error } = await admin.storage
    .from(PROMO_BUCKET)
    .createSignedUrl(cur.file_path, 7 * 24 * 3600, { download: downloadName(cur.title, cur.file_path) });
  if (error || !data) return { error: "リンクを作れませんでした" };
  return { url: data.signedUrl };
}
