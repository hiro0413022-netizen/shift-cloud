import { currentYM, daysOfMonth, todayJST } from "@/lib/util";
import { getActor, isOwner } from "@/lib/auth";
import { listStores, getStoreKpis, getStoreMonthFeed, getStoreLinks } from "@/lib/store-dash";
import { StoreDashClient } from "./store-client";

/**
 * 店舗ダッシュボードの共通描画。
 * 認証方式（デバイストークン /store/[token] か 店舗ログインCookie /store）で解決した
 * companyId / defaultStoreId を受け取り、同一の画面を描く。
 *
 * 店舗スコープ（#134 / #128 店舗またぎ廃止）:
 *   表示は「認証で解決した店舗」に固定する。以前は会社の全店舗をタブに出し、?store= の直打ちも
 *   素通ししていたため、宝塚の端末から姫路のKPI・予約が丸見えだった。
 *   切替を許すのはオーナー（manage_company を持つスタッフでログインしている場合）だけ。
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
  sp: { ym?: string; store?: string; h?: string };
  basePath: string; // ナビゲーション用。"/store" または `/store/${token}`
  token: string | null; // デバイストークン（Cookie方式では null）
  kioskToken: string | null; // 打刻キオスク導線（トークン方式のみ表示）
  showLogout: boolean; // 店舗ログイン方式ではログアウトを表示
}) {
  // スタッフとしてもログインしている場合のみ actor が取れる（店頭タブレットは null）。
  // オーナー = 全店切替可 / それ以外 = 認証で解決した1店舗に固定（?store= の直打ちも効かない）
  const actor = await getActor();
  const owner = !!actor && actor.companyId === companyId && isOwner(actor);
  const stores = await listStores(companyId, owner ? undefined : defaultStoreId ? [defaultStoreId] : []);
  const store = stores.find((s) => s.id === sp.store) ?? stores.find((s) => s.id === defaultStoreId) ?? stores[0];
  if (!store) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl text-zinc-500">表示できる店舗がありません。管理者に連絡してください。</p>
      </div>
    );
  }
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
      half={sp.h === "2" ? 2 : sp.h === "1" ? 1 : null}
      today={today}
      store={store}
      stores={stores}
      feed={feed}
      kpis={kpis}
      links={links}
    />
  );
}
