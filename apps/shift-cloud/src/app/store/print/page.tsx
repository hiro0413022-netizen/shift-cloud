import { redirect } from "next/navigation";
import { getStoreSession } from "@/lib/store-session";
import { StorePrintView } from "../print-view";

export const dynamic = "force-dynamic";

/** 紙シフト（店舗ログインCookie方式）。/store と同じセッションで開ける（#172） */
export default async function StorePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; ym?: string; range?: string; start?: string; end?: string }>;
}) {
  const session = await getStoreSession();
  if (!session) redirect("/login");
  const sp = await searchParams;

  return (
    <StorePrintView
      companyId={session.companyId}
      defaultStoreId={session.storeId}
      sp={sp}
      basePath="/store"
    />
  );
}
