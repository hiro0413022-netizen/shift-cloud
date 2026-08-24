import { redirect } from "next/navigation";
import { getMemberSession } from "@/lib/member";
import { frankSiteUrl } from "@/lib/frank-site-link";

/**
 * 会員のWeb予約は公式サイトに一本化しました（#93）。
 *
 * 予約システムが2つあったため（member-os の res_bookings / 公開APIの frunk_bookings）、
 * 台帳を frunk_bookings に統合し、お客様の入口は frankgolf.jp に集約しています。
 * このURLはブックマークされている可能性があるので、消さずに転送します。
 * ログイン済みなら引き渡しトークンを付けて、移動先での再入力を無くします（#152）。
 */
export const dynamic = "force-dynamic";

export default async function MemberBookRedirectPage() {
  const s = await getMemberSession();
  redirect(frankSiteUrl("booking.html", s && !s.isProvisional ? s.memberNo : null));
}
