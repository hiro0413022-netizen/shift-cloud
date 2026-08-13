import Link from "next/link";
import { requireActor, visibleStores, pickStore } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PageTitle, Card, Badge } from "@/components/ui";
import { fmtDateJP, todayJST } from "@/lib/util";
import { templatesForStore, timeOffIndex } from "@/lib/shift-scope";
import { resolveSpan, monthsCovered, shiftsHref, printHref, SPAN_KINDS, SPAN_LABELS } from "@/lib/shift-span";
import { ShiftBuilder } from "./builder";
import { PeriodForm } from "./period-form";
import { DeletePeriodButton } from "./delete-period-button";
import { closePeriod, reopenPeriod } from "./actions";

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
  const { start, end, days, ym } = range;

  const stores = await visibleStores(actor); // オーナー=全店 / それ以外=配属店舗のみ（#128）
  const storeId = pickStore(stores, sp.store, actor.primaryStoreId);
  if (!storeId) return <PageTitle>シフト作成</PageTitle>;

  const [{ data: staffRows }, { data: templates }, { data: shifts }, { data: periods }] = await Promise.all([
    admin.from("staff").select("id, name, staff_store_assignments!inner(store_id)")
      .eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null)
      .eq("staff_store_assignments.store_id", storeId).order("name"),
    admin.from("shift_templates").select("id, name, start_time, end_time, is_day_off, color, scope_type, scope_id")
      .eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
    admin.from("shifts").select("staff_id, date, template_id, status, start_time, end_time")
      .eq("company_id", actor.companyId).eq("store_id", storeId).is("deleted_at", null)
      .gte("date", start).lte("date", end),
    // この店舗向け＋全店舗共通(store_id=null)の期間のみ表示（他店舗の期間は混ぜない）
    // 週表示は月をまたぐので、表示範囲がかかる月の募集をすべて拾う（#135）
    admin.from("shift_request_periods").select("*")
      .eq("company_id", actor.companyId).is("deleted_at", null)
      .in("target_month", monthsCovered(start, end))
      .or(`store_id.eq.${storeId},store_id.is.null`)
      .order("start_date"),
  ]);

  // 表示範囲にかかる全期間（前半/後半など複数可）の希望を集約。
  // 日付でも絞る＝「希望を一括反映」の対象が画面に見えている範囲と必ず一致する（#135）
  const periodIds = (periods ?? []).map((p) => p.id);
  const { data: requests } = periodIds.length
    ? await admin.from("shift_requests").select("period_id, staff_id, date, template_id, memo, start_time, end_time")
        .in("period_id", periodIds).eq("status", "submitted").is("deleted_at", null)
        .gte("date", start).lte("date", end)
    : { data: [] };
  // 募集期間の削除確認に出す件数は「その期間の全件」。表示範囲で絞ると消える件数を少なく見せてしまう（#135）
  const { data: reqCountRows } = periodIds.length
    ? await admin.from("shift_requests").select("period_id")
        .in("period_id", periodIds).eq("status", "submitted").is("deleted_at", null)
    : { data: [] };
  const reqCountByPeriod = new Map<string, number>();
  for (const r of reqCountRows ?? []) reqCountByPeriod.set(r.period_id, (reqCountByPeriod.get(r.period_id) ?? 0) + 1);

  // 休み希望（募集期間とは無関係に出せる）。表示範囲にかかるものを日付ごとに引けるようにする
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

      <Card className="mb-4 !p-4">
        <p className="mb-3 text-sm font-semibold">希望募集の期間</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {(periods ?? []).length === 0 && (
            <p className="text-sm text-zinc-400">まだ募集期間がありません。下から作成してください。</p>
          )}
          {(periods ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5">
              <Badge color={p.status === "open" ? "green" : "zinc"}>
                {p.status === "open" ? "募集中" : "締切済み"}
              </Badge>
              <span className="text-xs font-medium">
                {p.title ? `${p.title}：` : ""}
                {p.start_date && p.end_date ? `${fmtDateJP(p.start_date)}〜${fmtDateJP(p.end_date)}` : p.target_month.slice(0, 7)}
              </span>
              <span className="text-[11px] text-zinc-400">締切 {p.deadline}</span>
              <Badge color={p.store_id ? "zinc" : "amber"}>{p.store_id ? "この店舗" : "全店舗"}</Badge>
              {p.status === "open" ? (
                <form action={closePeriod}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100">締め切る</button>
                </form>
              ) : (
                <form action={reopenPeriod}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100">↩ 募集中に戻す</button>
                </form>
              )}
              <DeletePeriodButton
                id={p.id}
                reqCount={reqCountByPeriod.get(p.id) ?? 0}
                label={`${p.title ? `${p.title}：` : ""}${p.start_date && p.end_date ? `${fmtDateJP(p.start_date)}〜${fmtDateJP(p.end_date)}` : p.target_month.slice(0, 7)}`}
              />
            </div>
          ))}
        </div>
        <PeriodForm ym={ym} storeId={storeId} />
      </Card>

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
