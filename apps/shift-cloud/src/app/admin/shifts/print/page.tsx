import { requireActor, visibleStores, pickStore } from "@/lib/auth";
import { ShiftPrintSheet, resolvePrintRange } from "@/components/shift-print";

/**
 * 紙シフト（管理側の入口）。
 * 紙の描画そのものは components/shift-print.tsx に共通化した（#172）。
 * 店頭からの印刷は /store/print・/store/<token>/print（同じ紙・店舗は認証で固定）。
 */

/**
 * 印刷の range → シフト作成画面の span/d へ変換（#135）。
 * half1/half2 は shift-span.ts の「半月」と同じ区切り（1〜15 / 16〜末）なのでそのまま対応する。
 */
function backHref(storeId: string, range: string, start: string, end: string): string {
  const q = (span: string, d: string) => `/admin/shifts?store=${storeId}&span=${span}&d=${d}`;
  if (range === "half1" || range === "half2") return q("half", start);
  if (range === "custom") return q(start === end ? "day" : "week", start);
  return q("month", start);
}

export default async function ShiftPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; ym?: string; range?: string; start?: string; end?: string }>;
}) {
  const actor = await requireActor("create_shifts");
  const sp = await searchParams;
  const { ym, range, start, end } = resolvePrintRange(sp);

  const stores = await visibleStores(actor); // オーナー=全店 / それ以外=配属店舗のみ（#128）
  const storeId = pickStore(stores, sp.store, actor.primaryStoreId);
  if (!storeId) return <p className="p-8">店舗がありません</p>;
  const store = stores?.find((s) => s.id === storeId);

  return (
    <ShiftPrintSheet
      companyId={actor.companyId}
      storeId={storeId}
      storeName={store?.name ?? ""}
      stores={stores ?? []}
      ym={ym}
      range={range}
      start={start}
      end={end}
      printPath="/admin/shifts/print"
      backLink={{ href: backHref(storeId, range, start, end), label: "← シフト作成に戻る" }}
    />
  );
}
