"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank } from "@/lib/store-scope";
import { logAudit } from "@/lib/kernel";
import { saveCoach, removeCoach } from "@/lib/frank-coaches";

/**
 * コーチ紹介の編集（#279・2026-09-25 ユーザー依頼）
 *
 * ★ 触れるのはFRANK配属者だけ。画面で出し分けるだけでは守れないので、ここでも必ず見る。
 * ★ 保存したら会員ページのトップも作り直す（revalidate）。
 *   公式サイトは静的だが、cms.js が毎回APIを読むのでデプロイは要らない。
 */

const str = (v: FormDataEntryValue | null): string => (typeof v === "string" ? v.trim() : "");

async function requireFrank() {
  const actor = await requireReceptionActor();
  if (!canAccessFrank(actor)) throw new Error("FORBIDDEN: store");
  return actor;
}

/** 追加・変更。id は .bind で渡す（React はボタンの name/value を上書きするため・#276で踏んだ） */
export async function saveCoachAction(id: string | null, formData: FormData) {
  const actor = await requireFrank();
  const photo = formData.get("photo");
  const r = await saveCoach({
    companyId: actor.companyId,
    id: id || null,
    photo: photo instanceof File ? photo : null,
    form: {
      name: str(formData.get("name")),
      name_en: str(formData.get("name_en")),
      title: str(formData.get("title")),
      photo_url: str(formData.get("photo_url")),
      bio: typeof formData.get("bio") === "string" ? String(formData.get("bio")) : "",
      quals: typeof formData.get("quals") === "string" ? String(formData.get("quals")) : "",
      sort_order: str(formData.get("sort_order")),
      published: str(formData.get("published")) === "on",
      staff_id: str(formData.get("staff_id")),
      link_url: str(formData.get("link_url")),
      link_label: str(formData.get("link_label")),
    },
  });

  if (!r.ok) redirect(`/frunk/coaches?err=${encodeURIComponent(r.message)}`);
  await logAudit(actor, id ? "frunk.coach_update" : "frunk.coach_create", "frunk_coaches", r.id, null, { name: str(formData.get("name")) });
  revalidatePath("/frunk/coaches");
  revalidatePath("/member");
  redirect("/frunk/coaches?saved=1");
}

/** 掲載をやめる（行は残す） */
export async function removeCoachAction(id: string) {
  const actor = await requireFrank();
  const ok = await removeCoach(actor.companyId, id);
  if (!ok) redirect("/frunk/coaches?err=" + encodeURIComponent("削除できませんでした"));
  await logAudit(actor, "frunk.coach_delete", "frunk_coaches", id, null, null);
  revalidatePath("/frunk/coaches");
  revalidatePath("/member");
  redirect("/frunk/coaches?removed=1");
}
