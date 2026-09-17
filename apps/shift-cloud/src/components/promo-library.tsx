import "server-only";
import { requireActor, can } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PROMO_BUCKET } from "@/lib/promo";
import { PromoClient, type PromoItem } from "./promo-client";

/**
 * 広報素材の一覧（#251）。スタッフ画面 /promo と 管理画面 /admin/promo の両方で使う。
 * 見る・保存・共有・追加はスタッフ全員。消せるのは追加した本人とお知らせ管理の人。
 */
export async function PromoLibrary({ variant }: { variant: "staff" | "admin" }) {
  const actor = await requireActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("sp_promo_assets")
    .select("id, kind, title, note, file_path, mime_type, size_bytes, width, height, duration_sec, uploaded_by, uploaded_by_name, created_at")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as Array<{
    id: string; kind: "logo" | "photo" | "video"; title: string; note: string | null; file_path: string;
    mime_type: string; size_bytes: number; width: number | null; height: number | null;
    duration_sec: number | string | null; uploaded_by: string | null; uploaded_by_name: string | null; created_at: string;
  }>;

  // 表示用の署名URL（1時間）。非公開バケットなので、URLを知っていても1時間で使えなくなる
  const urls = new Map<string, string>();
  if (rows.length) {
    const { data: signed } = await admin.storage
      .from(PROMO_BUCKET)
      .createSignedUrls(rows.map((r) => r.file_path), 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const manager = can(actor, "manage_announcements");

  const items: PromoItem[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    note: r.note,
    filePath: r.file_path,
    mime: r.mime_type,
    size: Number(r.size_bytes),
    width: r.width,
    height: r.height,
    durationSec: r.duration_sec != null ? Number(r.duration_sec) : null,
    uploadedByName: r.uploaded_by_name,
    createdAt: r.created_at,
    viewUrl: urls.get(r.file_path) ?? null,
    canDelete: manager || r.uploaded_by === actor.staffId,
  }));

  return <PromoClient items={items} variant={variant} />;
}
