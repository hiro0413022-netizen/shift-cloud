import "server-only";
import type { createAdmin } from "@/lib/supabase/admin";

/**
 * 会員番号 FR#### の採番（genesis の assignMemberNo と同じ数え方・company単位）
 *
 * #195 では frunk/actions.ts の中に置いていたが、#206 で会員ページ（お客様側）からも
 * ご利用者を追加できるようにしたため、2か所から呼ぶことになった。
 * 採番が2種類あると番号が飛ぶ・重複するので、ここ1か所に置く。
 *
 * 番号は「発番済みの件数＋1」。同時に押されると衝突する（unique制約）ので、
 * 衝突したら次の番号で5回まで取り直す。既に番号が付いている行はそれを返す（増やさない）。
 */
export async function nextMemberNo(
  admin: ReturnType<typeof createAdmin>,
  companyId: string,
  memberId: string,
): Promise<string | null> {
  for (let i = 0; i < 5; i++) {
    const { count } = await admin
      .from("frunk_members").select("id", { count: "exact", head: true })
      .eq("company_id", companyId).not("member_no", "is", null);
    const no = `FR${String((count ?? 0) + 1 + i).padStart(4, "0")}`;
    const { data: up, error } = await admin
      .from("frunk_members").update({ member_no: no, updated_at: new Date().toISOString() })
      .eq("id", memberId).is("member_no", null).select("member_no");
    if (!error) {
      if ((up ?? []).length > 0) return no;
      const { data: cur } = await admin.from("frunk_members").select("member_no").eq("id", memberId).maybeSingle();
      return cur?.member_no ? String(cur.member_no) : null;
    }
    if (!String(error.code ?? "").includes("23505")) return null;
  }
  return null;
}
