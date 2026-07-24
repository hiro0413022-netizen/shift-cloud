import { currentYM, daysOfMonth, todayJST } from "@/lib/util";
import {
  verifyStoreDevice,
  listStores,
  getStoreKpis,
  getStoreMonthFeed,
  getStoreLinks,
} from "@/lib/store-dash";
import { StoreDashClient } from "./store-client";

export const dynamic = "force-dynamic";

/**
 * 店舗ダッシュボード（店頭タブレット共有表示）
 * 認証: kiosk_devices のデバイストークン（/kiosk/[token] と同じトークンで開ける）
 * 構成: カレンダー（出勤者・やること）→ 今月KPI → 業務リンク集
 */
export default async function StoreDashPage({
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

  const stores = await listStores(device.companyId);
  const store = stores.find((s) => s.id === sp.store) ?? stores.find((s) => s.id === device.storeId) ?? stores[0];
  const ym = /^\d{4}-\d{2}$/.test(sp.ym ?? "") ? sp.ym! : currentYM();
  const days = daysOfMonth(ym);
  const today = todayJST();

  const [feed, kpis, links] = await Promise.all([
    getStoreMonthFeed(device.companyId, store.id, days),
    getStoreKpis(device.companyId, store, currentYM()), // KPIは常に「今月」（カレンダーの表示月と独立）
    getStoreLinks(device.companyId, store.id),
  ]);

  return (
    <StoreDashClient
      token={token}
      ym={ym}
      today={today}
      store={store}
      stores={stores}
      feed={feed}
      kpis={kpis}
      links={links}
    />
  );
}
