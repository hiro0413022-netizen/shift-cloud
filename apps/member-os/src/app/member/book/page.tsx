import { redirect } from "next/navigation";

/**
 * 会員のWeb予約は公式サイトに一本化しました（#93）。
 *
 * 予約システムが2つあったため（member-os の res_bookings / 公開APIの frunk_bookings）、
 * 台帳を frunk_bookings に統合し、お客様の入口は frankgolf.jp に集約しています。
 * このURLはブックマークされている可能性があるので、消さずに転送します。
 */
export const dynamic = "force-dynamic";

export default function MemberBookRedirectPage() {
  redirect("https://frankgolf.jp/booking.html");
}
