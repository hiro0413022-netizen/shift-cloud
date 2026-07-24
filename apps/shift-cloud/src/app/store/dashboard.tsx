import { currentYM, daysOfMonth, todayJST } from "@/lib/util";
import { listStores, getStoreKpis, getStoreMonthFeed, getStoreLinks } from "@/lib/store-dash";
import { StoreDashClient } from "./store-client";

/**
 * 店舗ダッシュボードの共通描画。
 * 認証方式（デバイストークン /store/[token] か 店舗ログインCookie /store）で解決した
 * companyId / defaultStoreId を受け取り、同一の画面を描く。
 */
export async function StoreDashboard({
  companyId,
  defaultStoreId,
  sp,
  basePath,
  token,
  kioskToken,
  showLogout,
}: {
  companyId: string;
  defaultStoreId: string | null;
  sp: { ym?: string; store?: string };
  basePath: string; // ナビゲーション用。"/store" または `/store/${token}`
  token: string | null; // デバイストークン（Cookie方式では null）
  kioskToken: string | null; // 打刻キオスク導線（トークン方式のみ表示）
  showLogout: boolean; // 店舗ログイン方式ではログアウトを表示
}) {
  const stores = await listStores(companyId);
  const store = stores.find((s) => s.id === sp.store) ?? stores.find((s) => s.id === defaultStoreId) ?? stores[0];
  const ym = /^\d{4}-\d{2}$/.test(sp.ym ?? "") ? sp.ym! : currentYM();
  const days = daysOfMonth(ym);
  const today = todayJST();

  const [feed, kpis, links] = await Promise.all([
    getStoreMonthFeed(companyId, store.id, days),
    getStoreKpis(companyId, store, currentYM()), // KPIは常に「今月」（カレンダーの表示月と独立）
    getStoreLinks(companyId, store.id),
  ]);

  return (
    <StoreDashClient
      basePath={basePath}
      token={token}
      kioskToken={kioskToken}
      showLogout={showLogout}
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
