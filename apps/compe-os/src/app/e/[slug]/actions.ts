"use server";

import { redirect } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { jstYmd } from "@yozan/core/jst";
import { countEntries, entryGate, getCompByEntrySlug } from "@/lib/compe";

/** 電話番号は数字だけにして比べる（090-1234-5678 と 09012345678 を同じ人とみなす） */
function digits(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

/**
 * 募集ページからのお申し込み。
 *
 * ★ ログイン不要の公開経路なので、ここで通すのは「新しい行を1つ足す」ことだけ。
 *   既存の参加者を書き換えたり、名簿を読み出したりはしない。
 * ★ 定員を超えたら断らずキャンセル待ちにする（キャンセルが出たとき誰に声をかけるか分かるように）。
 */
export async function submitEntry(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const slug = String(formData.get("slug") ?? "");
  const comp = await getCompByEntrySlug(slug);
  if (!comp) return { error: "この募集ページは見つかりませんでした" };

  const gate = entryGate(comp, jstYmd());
  if (!gate.ok) return { error: "現在このコンペのお申し込みは受け付けていません" };

  const name = String(formData.get("name") ?? "").trim();
  const kana = String(formData.get("kana") ?? "").trim();
  const tel = String(formData.get("tel") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const hcpRaw = String(formData.get("hcp") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) return { error: "お名前を入力してください" };
  if (digits(tel).length < 10) return { error: "電話番号を正しく入力してください（携帯番号など）" };

  const admin = createAdmin();

  // 二重申し込みの防止（同じコンペに同じ電話番号）
  const { data: existing } = await admin
    .from("cmp_participants")
    .select("id, name, tel, entry_status")
    .eq("comp_id", comp.id)
    .is("deleted_at", null);
  const mine = ((existing ?? []) as { tel: string | null; entry_status: string }[]).find(
    (p) => p.tel && digits(p.tel) === digits(tel) && p.entry_status !== "cancelled"
  );
  if (mine) {
    redirect(`/e/${slug}?done=already`);
  }

  const { taken } = await countEntries(comp.id);
  const full = comp.entry_capacity != null && taken >= comp.entry_capacity;
  const status = full ? "waitlist" : "applied";

  const { error } = await admin.from("cmp_participants").insert({
    comp_id: comp.id,
    name,
    kana: kana || null,
    tel,
    email: email || null,
    hcp: hcpRaw === "" ? null : Number.parseFloat(hcpRaw),
    notes: notes || null,
    entry_status: status,
    source: "web",
    applied_at: new Date().toISOString(),
    sort_order: taken,
  });
  if (error) return { error: "お申し込みを保存できませんでした。お手数ですがお電話ください" };

  redirect(`/e/${slug}?done=${status}`);
}
