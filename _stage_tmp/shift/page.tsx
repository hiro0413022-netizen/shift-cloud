import { redirect } from "next/navigation";
import { getStoreSession } from "@/lib/store-session";
import { StoreDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

/**
 * 店舗ダッシュボード（店舗ログインCookie方式）
 * Shift Cloud のログイン画面で「店舗用ID＋パスワード」を入力すると sd_session Cookie が発行され、
 * このページ（URLにトークンを出さない）で店舗ダッシュボードを表示する。
 */
export default async function StoreDashPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; store?: string }>;
}) {
  const session = await getStoreSession();
  if (!session) redirect("/login");
  const sp = await searchParams;

  return (
    <StoreDashboard
      companyId={session.companyId}
      defaultStoreId={session.storeId}
      sp={sp}
      basePath="/store"
      token={null}
      kioskToken={null}
      showLogout
    />
  );
}
