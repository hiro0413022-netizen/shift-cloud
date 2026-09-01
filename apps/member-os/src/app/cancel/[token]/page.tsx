import { redirect } from "next/navigation";
import { FRANK_SITE } from "@yozan/core/frank-links";

/**
 * 体験予約の確認・キャンセルURLの受け口（#188）
 *
 * お客様に出すURLは my.frankgolf.jp に一本化した（メールに2つのドメインが出るのをやめる）。
 * 中身の画面は公式サイトの trial-booking.html のままなので、ここは転送だけする。
 * トークンは「英数字とハイフン」に限る＝他所へ飛ばされる細工を通さない。
 */
export const dynamic = "force-dynamic";

export default async function TrialCancelRedirect({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const safe = /^[A-Za-z0-9_-]{8,128}$/.test(token) ? token : "";
  redirect(safe ? `${FRANK_SITE}/trial-booking.html?cancel=${encodeURIComponent(safe)}` : `${FRANK_SITE}/trial-booking.html`);
}
