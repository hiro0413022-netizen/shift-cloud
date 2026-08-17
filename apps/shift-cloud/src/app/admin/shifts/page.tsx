import Link from "next/link";
import { requireActor, visibleStores, pickStore } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PageTitle } from "@/components/ui";
import { todayJST } from "@/lib/util";
import { templatesForStore, timeOffIndex } from "@/lib/shift-scope";
import { resolveSpan, shiftsHref, printHref, SPAN_KINDS, SPAN_LABELS } from "@/lib/shift-span";
import { ShiftBuilder } from "./builder";

/**
 * シフト作成（#138 募集期間の廃止）
 * 「募集を開始」は無い。スタッフはいつでも提出でき、ここでは日付範囲で希望を読むだけ。
 * 確定は「表示中の期間まとめて」と「1マスだけ」の両方ができる。
 */
export default async function ShiftBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; ym?: string; span?: string; d?: string }>;
}) {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const sp = await searchParams;
  // 表示する期間（日/週/半月/月）。日付計算は lib/shift-span.ts に集約（#135）
  const today = todayJST();
  const range = resolveSpan({ span: sp.span, d: sp.d, ym: sp.ym, today });
  const { start, end, days } = range;

  const stores = await visibleStores(actor); // オーナー=全店 / それ以外=配属店舗のみ（#128）
  const storeId = pickStore(stores, sp.store, actor.primaryStoreId);
  if (!storeId) return <PageTitle>シフト作成</PageTitle>;

  const [{ data: staffRows }, { data: templates }, { data: shifts }] = await Promise.all([
    admin.from("staff").select("id, name, staff_store_assignments!inner(store_id)")
      .eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null)
      .eq("staff_store_assignments.store_id", storeId).order("name"),
    admin.from("shift_templates").select("id, name, start_time, end_time, is_day_off, color, scope_type, scope_id")
      .eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
    admin.from("shifts").select("staff_id, date, template_id, status, start_time, end_time")
      .eq("company_id", actor.companyId).eq("store_id", storeId).is("deleted_at", null)
      .gte("date", start).lte("date", end),
  ]);

  // 提出された希望は期間(period)ではなく日付で読む。この店舗のスタッフのぶんだけ（#138）
  const staffIds = (staffRows ?? []).map((s) => s.id);
  const { data: requests } = staffIds.length
    ? await admin.from("shift_requests").select("staff_id, date, template_id, memo, start_time, end_time")
        .eq("company_id", actor.companyId).in("staff_id", staffIds)
        .eq("status", "submitted").is("deleted_at", null)
        .gte("date", start).lte("date", end)
    : { data: [] };

  // 休み希望（いつでも出せる）。表示範囲にかかるものを日付ごとに引けるようにする
  const { data: timeOffRows } = await admin.from("staff_time_off_requests")
    .select("staff_id, start_date, end_date, status, reason")
    .eq("company_id", actor.companyId).is("deleted_at", null)
    .in("status", ["submitted", "approved"])
    .lte("start_date", end).gte("end_date", start);
  const timeOff = Object.fromEntries(timeOffIndex(timeOffRows ?? []));
  const pendingTimeOff = (timeOffRows ?? []).filter((r) => r.status === "submitted").length;

  // 店舗ごとに営業時間が違うので、この店舗で使えるテンプレだけ渡す（DECISIONS #131）
  const storeTemplates = templatesForStore(templates ?? [], storeId);

  return (
    <>
      <PageTitle>シフト作成</PageTitle>

      {/* 期間切替（日/週/半月/月）＋期間送り。列が31日ぶん並ぶ横スクロールを解消する（#135） */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-0.5 rounded-lg bg-zinc-100 p-0.5">
          {SPAN_KINDS.map((k) => (
            <Link key={k} href={shiftsHref(storeId, k, range.base)}
              className={`rounded-md px-3 py-1.5 text-sm ${k === range.span ? "bg-white font-semibold text-brand shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}>
              {SPAN_LABELS[k]}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 shadow-sm ring-1 ring-zinc-200">
          <Link href={shiftsHref(storeId, range.span, range.prev)} aria-label="前の期間"
            className="rounded px-1.5 text-zinc-400 hover:bg-zinc-100">←</Link>
          <p className="whitespace-nowrap font-semibold">{range.label}</p>
          <Link href={shiftsHref(storeId, range.span, range.next)} aria-label="次の期間"
            className="rounded px-1.5 text-zinc-400 hover:bg-zinc-100">→</Link>
        </div>
        <Link href={shiftsHref(storeId, range.span, today)}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">
          今日
        </Link>
        <div className="flex gap-1">
          {stores?.map((s) => (
            <Link key={s.id} href={shiftsHref(s.id, range.span, range.base)}
              className={`rounded-md px-3 py-1.5 text-sm ${s.id === storeId ? "bg-brand-light font-medium text-brand" : "text-zinc-500 hover:bg-zinc-100"}`}>
              {s.name.replace("GOLF WING ", "")}
            </Link>
          ))}
        </div>
        <Link
          href={printHref(storeId, range)}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          🖨 紙シフト出力
        </Link>
      </div>

      {pendingTimeOff > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm">
          <span className="text-amber-800">
            {range.label}に未処理の休み希望が{pendingTimeOff}件あります。シフトを組む前に処理してください。
          </span>
          <Link href="/admin/time-off" className="ml-auto rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100">
            休み希望を見る
          </Link>
        </div>
      )}

      <div className="mb-4 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-500">
        スタッフはいつでもシフトを提出できます（募集の開始は不要）。
        <span className="ml-1 font-medium text-zinc-700">{range.shortLabel}の提出は{(requests ?? []).length}件</span>
        。セルの下に「希望」として出ます。
      </div>

      {!staffRows?.length ? (
        <p className="text-sm text-zinc-400">この店舗に所属スタッフがいません。スタッフ管理から追加してください。</p>
      ) : (
        <ShiftBuilder
          storeId={storeId}
          days={days}
          rangeLabel={range.label}
          rangeShort={range.shortLabel}
          staff={staffRows.map((s) => ({ id: s.id, name: s.name }))}
          templates={storeTemplates}
          shifts={shifts ?? []}
          requests={requests ?? []}
          timeOff={timeOff}
        />
      )}
    </>
  );
}
