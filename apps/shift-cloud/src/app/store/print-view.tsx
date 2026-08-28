import { getActor, isOwner } from "@/lib/auth";
import { listStores } from "@/lib/store-dash";
import { ShiftPrintSheet, resolvePrintRange, type PrintRangeParams } from "@/components/shift-print";

/**
 * 店頭から紙シフトを印刷する画面（#172）。
 * 紙そのものは /admin/shifts/print と同じ（components/shift-print.tsx）。違うのは認証と店舗の決め方だけ。
 *
 * 店舗スコープ（#134 / #128 店舗またぎ廃止）:
 *   印刷できるのは「認証で解決した店舗」だけ。?store= の直打ちは効かない。
 *   切替を許すのはオーナー（manage_company を持つスタッフとしてもログインしている場合）のみ。
 */
export async function StorePrintView({
  companyId,
  defaultStoreId,
  sp,
  basePath,
}: {
  companyId: string;
  defaultStoreId: string | null;
  sp: PrintRangeParams & { store?: string };
  basePath: string; // "/store" または `/store/${token}`
}) {
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

  const { ym, range, start, end } = resolvePrintRange(sp);

  return (
    <div className="p-4 lg:p-6">
      <ShiftPrintSheet
        companyId={companyId}
        storeId={store.id}
        storeName={store.name}
        stores={stores}
        ym={ym}
        range={range}
        start={start}
        end={end}
        printPath={`${basePath}/print`}
        backLink={{ href: basePath, label: "← 店舗ダッシュボードに戻る" }}
      />
    </div>
  );
}
