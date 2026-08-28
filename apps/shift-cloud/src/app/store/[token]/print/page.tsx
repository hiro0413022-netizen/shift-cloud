import { verifyStoreDevice } from "@/lib/store-dash";
import { StorePrintView } from "../../print-view";

export const dynamic = "force-dynamic";

/** 紙シフト（デバイストークン方式・店頭タブレット/PC共有表示）。/store/<token> と同じトークンで開ける（#172） */
export default async function StorePrintTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ store?: string; ym?: string; range?: string; start?: string; end?: string }>;
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
    <StorePrintView
      companyId={device.companyId}
      defaultStoreId={device.storeId}
      sp={sp}
      basePath={`/store/${token}`}
    />
  );
}
