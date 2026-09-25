import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { FRANK_STORE_ID } from "@/lib/store-scope";
import {
  publicCoaches,
  normalizeCoachInput,
  checkPhoto,
  type CoachRow,
  type PublicCoach,
} from "@yozan/core/frank-coach-profile";

/**
 * コーチ紹介の読み書き（#279・2026-09-25 ユーザー依頼）
 *
 * ★ 出さない人を2か所で落とす（ユーザー指示「絶対に名前を出さないこと」）
 *   ① 管理画面の「スタッフから選ぶ」候補に line_hidden の人を入れない（＝間違えて選べない）
 *   ② 公開用に整えるとき、line_hidden のスタッフに紐づく行を落とす（＝入っていても出ない）
 *   隠すだけの守りは、1か所抜けると全部抜ける。
 *
 * ★ 写真は Storage の hp-media（公開バケット・#249 で作成）へ入れる。
 *   DBに画像を持たない／公式サイトからも同じURLで読める。
 */

const COACH_COLS = "id, name, name_en, title, photo_url, bio, quals, sort_order, published, staff_id, link_url, link_label, updated_at";

/** 名前を出さないスタッフ（#243 の line_hidden）。コーチ紹介は公開面なので必ず除く */
export async function hiddenStaffIds(companyId: string): Promise<string[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("staff")
    .select("id")
    .eq("company_id", companyId)
    .eq("line_hidden", true)
    .is("deleted_at", null);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/** 管理画面の一覧（下書きも出す。並び順は公開面と同じ） */
export async function listCoachesForAdmin(companyId: string): Promise<CoachRow[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_coaches")
    .select(COACH_COLS)
    .eq("company_id", companyId)
    .eq("store_id", FRANK_STORE_ID)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as CoachRow[];
}

/** 会員ページ／公式サイトに出すコーチ */
export async function loadPublicCoaches(companyId: string): Promise<PublicCoach[]> {
  const rows = await listCoachesForAdmin(companyId);
  return publicCoaches(rows, await hiddenStaffIds(companyId));
}

/** 「スタッフから選ぶ」の候補。名前を出さない人は**候補に出さない** */
export async function coachCandidates(companyId: string): Promise<Array<{ id: string; name: string; role: string }>> {
  const admin = createAdmin();
  // 配属は staff_store_assignments（staff に store_id は無い）。FRANK配属の人だけ候補にする
  const { data: asg } = await admin
    .from("staff_store_assignments")
    .select("staff_id")
    .eq("store_id", FRANK_STORE_ID);
  const frankStaff = new Set(((asg ?? []) as Array<{ staff_id: string }>).map((a) => a.staff_id));

  const { data } = await admin
    .from("staff")
    .select("id, name, member_page_role, line_hidden")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(300);
  type S = { id: string; name: string | null; member_page_role: string | null; line_hidden: boolean | null };
  return ((data ?? []) as S[])
    .filter((s) => s.line_hidden !== true) // ← ここが「出さない人」の入口の封じ
    .filter((s) => frankStaff.has(s.id))
    .filter((s) => String(s.name ?? "").trim().length > 0)
    .map((s) => ({ id: s.id, name: String(s.name), role: String(s.member_page_role ?? "") }));
}

/** 写真を hp-media に入れて公開URLを返す。失敗したらメッセージ */
export async function uploadCoachPhoto(file: File): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const bad = checkPhoto(file);
  if (bad) return { ok: false, message: bad };
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const now = new Date();
  const path = `frank-golf/coaches/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${ext}`;
  const admin = createAdmin();
  const { error } = await admin.storage.from("hp-media").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return { ok: false, message: "写真を保存できませんでした。もう一度お試しください" };
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  return { ok: true, url: `${base}/storage/v1/object/public/hp-media/${path}` };
}

export type SaveResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * 追加・変更をまとめて受ける。
 * @param id  null なら新規
 * ★ 写真を選んでいないときは photo_url を触らない（「変更しない」＝消さない）
 */
export async function saveCoach(input: {
  companyId: string;
  id: string | null;
  form: Record<string, unknown>;
  photo: File | null;
}): Promise<SaveResult> {
  const norm = normalizeCoachInput(input.form);
  if (!norm.ok) return { ok: false, message: norm.message };

  // 名前を出さないスタッフには紐づけさせない（フォームを細工されても通さない）
  if (norm.value.staff_id) {
    const hidden = await hiddenStaffIds(input.companyId);
    if (hidden.includes(norm.value.staff_id)) {
      return { ok: false, message: "このスタッフはコーチ紹介に掲載できない設定です" };
    }
  }

  let photoUrl = norm.value.photo_url;
  if (input.photo && input.photo.size > 0) {
    const up = await uploadCoachPhoto(input.photo);
    if (!up.ok) return { ok: false, message: up.message };
    photoUrl = up.url;
  }

  const admin = createAdmin();
  const row = { ...norm.value, photo_url: photoUrl, updated_at: new Date().toISOString() };

  if (input.id) {
    const { data, error } = await admin
      .from("frunk_coaches")
      .update(row)
      .eq("id", input.id)
      .eq("company_id", input.companyId)
      .eq("store_id", FRANK_STORE_ID)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data) return { ok: false, message: "保存できませんでした" };
    return { ok: true, id: (data as { id: string }).id };
  }

  const { data, error } = await admin
    .from("frunk_coaches")
    .insert({ ...row, company_id: input.companyId, store_id: FRANK_STORE_ID })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "保存できませんでした" };
  return { ok: true, id: (data as { id: string }).id };
}

/** 掲載をやめる。行は消さずに deleted_at を入れる（戻したいときのため） */
export async function removeCoach(companyId: string, id: string): Promise<boolean> {
  const admin = createAdmin();
  const { error } = await admin
    .from("frunk_coaches")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId)
    .eq("store_id", FRANK_STORE_ID)
    .is("deleted_at", null);
  return !error;
}
