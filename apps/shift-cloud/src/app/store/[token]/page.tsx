import { verifyStoreDevice } from "@/lib/store-dash";
import { StoreDashboard } from "../dashboard";

export const dynamic = "force-dynamic";

/**
 * 店舗ダッシュボード（デバイストークン方式・店頭タブレット/PC共有表示）
 * 認証: kiosk_devices のデバイストークン（/kiosk/[token] と同じトークンで開ける）
 */
export default async function StoreDashTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ym?: string; store?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const device = await verifyStoreDevice(token);
  if (!device) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl text-zinc-500">この端末は無効です。管理者に連絡してください。</p>
      </div>
    );
  }

  return (
    <StoreDashboard
      companyId={device.companyId}
      defaultStoreId={device.storeId}
      sp={sp}
      basePath={`/store/${token}`}
      token={token}
      kioskToken={token}
      showLogout={false}
    />
  );
}
