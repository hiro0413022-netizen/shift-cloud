import { NextResponse, type NextRequest } from "next/server";
import { getMoneyActor } from "@/lib/auth";
import { getCurrentStore } from "@/lib/money";
import { loadPivot, readParams, rangeLabel } from "@/lib/pivot-load";
import { pivotCsv, DIMS } from "@/lib/pivot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 集計表（#285）をExcelで開けるCSVで書き出す。条件は画面と同じ（URLのまま）。
 * 範囲は画面と同じ判定: 現場は自店舗だけ、オーナーは全店（scope=store で選んだ店舗だけ）。
 */
export async function GET(req: NextRequest) {
  const actor = await getMoneyActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const p = readParams(sp);
  const store = await getCurrentStore(actor);
  const storeId = actor.canManageAll && p.scope === "all" ? null : (store?.id ?? null);
  if (!actor.canManageAll && !storeId) return NextResponse.json({ error: "店舗が選択されていません" }, { status: 400 });

  const { pivot } = await loadPivot(actor.companyId, storeId, p);
  const name = `売上集計_${DIMS[p.rows]}${p.cols ? `x${DIMS[p.cols]}` : ""}${p.q ? `_${p.q}` : ""}_${rangeLabel(p)}.csv`;
  return new NextResponse(pivotCsv(pivot), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "no-store",
    },
  });
}
