import { redirect } from "next/navigation";

/**
 * トークンURL式のお客様Web予約は廃止しました（#93）。
 *
 * 予約システムが2つあったため台帳を frunk_bookings に一本化し、
 * お客様の予約は公式サイト frankgolf.jp に集約しています。
 * QRや掲示から来た方が行き止まりにならないよう、サイトへ転送します。
 */
export const dynamic = "force-dynamic";

export default async function BookTokenRedirectPage() {
  redirect("https://frankgolf.jp/trial-booking.html");
}
