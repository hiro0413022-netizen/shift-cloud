import { redirect } from "next/navigation";

/**
 * 仮会員の自己登録（P########）は廃止しました（2026-08-07）。
 *
 * ここで作られた番号は打席予約が見る frunk_members に存在せず、
 * 予約ページで「会員番号または電話番号下4桁が一致しません」で必ず弾かれていました。
 * FRANK のご入会は Web入会申込に一本化したため、このURLは転送します
 * （公式サイト・ブックマークからのアクセスが残っているため消さない）。
 */
export const dynamic = "force-dynamic";

export default function MemberRegisterRedirectPage() {
  redirect("/join-web");
}
