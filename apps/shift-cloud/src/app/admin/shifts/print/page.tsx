import Link from "next/link";
import { requireActor, visibleStores, pickStore } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { currentYM, addMonths, daysOfMonth, daysBetween, halfMonthRange, dowJP, hm } from "@/lib/util";
import { PrintButton } from "./print-button";

type Shift = { staff_id: string; date: string; start_time: string | null; end_time: string | null; is_day_off: boolean; template_id: string | null };

export default async function ShiftPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; ym?: string; range?: string; start?: string; end?: string }>;
}) {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const sp = await searchParams;
  const ym = sp.ym ?? addMonths(currentYM(), 1);
  // 印刷は半月（1〜15 / 16〜末）が既定。A4横1ページに収まる単位。
  const range = sp.range ?? "half1";

  let start: string, end: string;
  if (range === "half1") ({ start, end } = halfMonthRange(ym, 1));
  else if (range === "half2") ({ start, end } = halfMonthRange(ym, 2));
  else if (range === "custom" && sp.start && sp.end) { start = sp.start; end = sp.end; }
  else { const d = daysOfMonth(ym); start = d[0]; end = d[d.length - 1]; }
  const days = daysBetween(start, end);

  const stores = await visibleStores(actor); // オーナー=全店 / それ以外=配属店舗のみ（#128）
  const storeId = pickStore(stores, sp.store, actor.primaryStoreId);
  if (!storeId) return <p className="p-8">店舗がありません</p>;
  const store = stores?.find((s) => s.id === storeId);

  const [{ data: staffRows }, { data: templates }, { data: shifts }] = await Promise.all([
    admin.from("staff").select("id, name, position, staff_store_assignments!inner(store_id)")
      .eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null)
      .eq("staff_store_assignments.store_id", storeId).order("position").order("name"),
    admin.from("shift_templates").select("id, name, start_time, end_time, is_day_off, color")
      .eq("company_id", actor.companyId).is("deleted_at", null),
    admin.from("shifts").select("staff_id, date, start_time, end_time, is_day_off, template_id")
      .eq("company_id", actor.companyId).eq("store_id", storeId).is("deleted_at", null)
      .gte("date", start).lte("date", end),
  ]);

  const tmap = new Map((templates ?? []).map((t) => [t.id, t] as const));
  const shiftMap = new Map<string, Shift>();
  for (const s of (shifts ?? []) as Shift[]) shiftMap.set(`${s.staff_id}|${s.date}`, s);

  // 役職ごとにグルーピング（コーチ / 受付 …）
  const groups = new Map<string, { id: string; name: string }[]>();
  for (const s of staffRows ?? []) {
    const key = s.position || "スタッフ";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ id: s.id, name: s.name });
  }
  const groupList = [...groups.entries()];
  const rowCount = groupList.reduce((n, [, m]) => n + m.length, 0);

  type Cell = { kind: "off" } | { kind: "time"; from: string; to: string } | { kind: "label"; text: string; color?: string } | null;
  function cell(staffId: string, date: string): Cell {
    const sh = shiftMap.get(`${staffId}|${date}`);
    if (!sh) return null;
    if (sh.is_day_off) return { kind: "off" };
    if (sh.start_time && sh.end_time) return { kind: "time", from: hm(sh.start_time), to: hm(sh.end_time) };
    if (sh.template_id) {
      const t = tmap.get(sh.template_id);
      if (t) {
        if (t.is_day_off) return { kind: "off" };
        if (t.start_time && t.end_time) return { kind: "time", from: hm(t.start_time), to: hm(t.end_time) };
        return { kind: "label", text: t.name, color: t.color };
      }
    }
    return null;
  }

  const storeName = store?.name?.replace("GOLF WING ", "") ?? "";
  const [yy, mm] = ym.split("-").map(Number);
  const halfLabel = range === "half1" ? "前半" : range === "half2" ? "後半" : "";
  const title = `${yy}年${mm}月${halfLabel ? ` ${halfLabel}` : ""}（${Number(start.slice(8))}日〜${Number(end.slice(8))}日）シフト表`;

  // 列幅（A4横 = 全幅を100%として配分）
  const posW = 3.2;
  const nameW = 11;
  const dayW = (100 - posW - nameW) / days.length;

  // 日数が多いほど文字を小さく（1ヶ月表示でも1枚に収める）
  const dense = days.length > 20;

  const RANGES = [
    { key: "half1", label: "前半(1〜15)" },
    { key: "half2", label: "後半(16〜末)" },
    { key: "month", label: "1ヶ月" },
  ];

  return (
    <div className="print-root bg-white text-black">
      {/* 操作バー（印刷では非表示） */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-3 border-b border-zinc-200 pb-4">
        <Link href={`/admin/shifts?store=${storeId}&ym=${ym}`} className="text-sm text-zinc-500 hover:underline">← シフト作成に戻る</Link>
        <div className="flex items-center gap-1">
          <Link href={`/admin/shifts/print?store=${storeId}&ym=${addMonths(ym, -1)}&range=${range}`} className="px-1.5 text-zinc-400">←</Link>
          <span className="text-sm font-semibold">{ym.replace("-", "年")}月</span>
          <Link href={`/admin/shifts/print?store=${storeId}&ym=${addMonths(ym, 1)}&range=${range}`} className="px-1.5 text-zinc-400">→</Link>
        </div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Link key={r.key} href={`/admin/shifts/print?store=${storeId}&ym=${ym}&range=${r.key}`}
              className={`rounded-md px-3 py-1.5 text-sm ${range === r.key ? "bg-brand-light font-medium text-brand" : "text-zinc-500 hover:bg-zinc-100"}`}>
              {r.label}
            </Link>
          ))}
        </div>
        <div className="flex gap-1">
          {stores?.map((s) => (
            <Link key={s.id} href={`/admin/shifts/print?store=${s.id}&ym=${ym}&range=${range}`}
              className={`rounded-md px-3 py-1.5 text-sm ${s.id === storeId ? "bg-brand-light font-medium text-brand" : "text-zinc-500 hover:bg-zinc-100"}`}>
              {s.name.replace("GOLF WING ", "")}
            </Link>
          ))}
        </div>
        <div className="ml-auto"><PrintButton /></div>
      </div>

      <p className="no-print mb-4 text-xs text-zinc-400">
        ※ 印刷ダイアログでは「用紙の向き: 横」「余白: 既定」「背景のグラフィック: ON」を選んでください（A4横1ページに収まります）。
      </p>

      {/* ここから印刷領域 */}
      <div className="sheet">
        <div className="sheet-head">
          <h1>{title}</h1>
          <p>{storeName}</p>
        </div>

        <table className={`shift-table${dense ? " dense" : ""}`}>
          <colgroup>
            <col style={{ width: `${posW}%` }} />
            <col style={{ width: `${nameW}%` }} />
            {days.map((d) => <col key={d} style={{ width: `${dayW}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="c-pos" />
              <th className="c-name">氏名</th>
              {days.map((d) => {
                const w = dowJP(d);
                return (
                  <th key={d} className={`c-day ${w === "日" ? "sun" : w === "土" ? "sat" : ""}`}>
                    <span className="dnum">{Number(d.slice(8))}</span>
                    <span className="dow">{w}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groupList.map(([gname, members]) =>
              members.map((m, mi) => (
                <tr key={m.id}>
                  {mi === 0 && (
                    <td rowSpan={members.length} className="c-pos group-cell">
                      <span>{gname}</span>
                    </td>
                  )}
                  <td className="c-name">{m.name}</td>
                  {days.map((d) => {
                    const c = cell(m.id, d);
                    const w = dowJP(d);
                    const cls = `c-day ${w === "日" ? "sun" : w === "土" ? "sat" : ""}`;
                    if (!c) return <td key={d} className={cls} />;
                    if (c.kind === "off") return <td key={d} className={`${cls} off`}>休</td>;
                    if (c.kind === "time") {
                      return (
                        <td key={d} className={cls}>
                          <span className="t1">{c.from}</span>
                          <span className="t2">{c.to}</span>
                        </td>
                      );
                    }
                    return (
                      <td key={d} className={cls} style={c.color ? { background: c.color + "40" } : undefined}>
                        <span className="lbl">{c.text}</span>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
            {/* 備考行（手書き用） */}
            <tr className="memo-row">
              <td className="c-pos group-cell"><span>備考</span></td>
              <td colSpan={days.length + 1} />
            </tr>
          </tbody>
        </table>

        <p className="sheet-foot">{rowCount}名 / {days.length}日間</p>
      </div>

      <style>{`
        /* ---------- 画面・印刷 共通 ---------- */
        .sheet { background: #fff; color: #000; }
        .sheet-head {
          display: flex; align-items: baseline; justify-content: space-between;
          margin: 0 0 4px;
        }
        .sheet-head h1 { font-size: 13pt; font-weight: 700; letter-spacing: .02em; }
        .sheet-head p { font-size: 11pt; font-weight: 700; }
        .sheet-foot { margin-top: 3px; font-size: 7pt; color: #666; text-align: right; }

        .shift-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          border: 1.2pt solid #000;
        }
        .shift-table th, .shift-table td {
          border: 0.5pt solid #000;
          padding: 1.5pt 1pt;
          text-align: center;
          vertical-align: middle;
          overflow: hidden;
          word-break: break-all;
        }
        .shift-table thead th {
          background: #e8e8e8;
          font-size: 8.5pt;
          line-height: 1.15;
          padding: 2pt 1pt;
        }
        .shift-table thead th .dnum { display: block; font-weight: 700; font-size: 9.5pt; }
        .shift-table thead th .dow  { display: block; font-size: 7pt; }
        .shift-table thead th.sun, .shift-table td.sun { background: #fdeaea; }
        .shift-table thead th.sat, .shift-table td.sat { background: #e9f1fb; }
        .shift-table thead th.sun { color: #c00; }
        .shift-table thead th.sat { color: #05c; }

        .shift-table td.c-name {
          text-align: left;
          padding-left: 3pt;
          font-size: 9pt;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .shift-table th.c-name { font-size: 8.5pt; }

        .shift-table .c-pos { background: #f2f2f2; width: 3.2%; }
        .group-cell { padding: 0; }
        .group-cell span {
          writing-mode: vertical-rl;
          display: inline-block;
          font-size: 8.5pt;
          font-weight: 700;
          letter-spacing: .15em;
          white-space: nowrap;
        }

        .shift-table td.c-day { font-size: 7.5pt; line-height: 1.1; height: 26pt; }
        .shift-table td.c-day .t1 { display: block; }
        .shift-table td.c-day .t2 { display: block; border-top: 0.4pt dotted #999; }
        .shift-table td.c-day .lbl { display: block; font-weight: 700; font-size: 8pt; }
        .shift-table td.off { color: #c00; font-weight: 700; font-size: 9pt; }

        /* 1ヶ月表示など列が多いとき */
        .shift-table.dense td.c-day { font-size: 6.5pt; height: 22pt; }
        .shift-table.dense td.c-name { font-size: 8pt; }
        .shift-table.dense thead th .dnum { font-size: 8pt; }

        .memo-row td { height: 30pt; }

        /* ---------- 印刷 ---------- */
        @media print {
          @page { size: A4 landscape; margin: 8mm; }

          html, body {
            background: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          .no-print { display: none !important; }
          aside { display: none !important; }
          main { margin-left: 0 !important; padding: 0 !important; }
          .print-root { margin: 0 !important; padding: 0 !important; }

          /* globals.css のモバイル救済で table が block 化するのを完全に打ち消す */
          .shift-table { display: table !important; overflow: visible !important; max-width: none !important; }
          .shift-table thead { display: table-header-group; }
          .shift-table tr { page-break-inside: avoid; break-inside: avoid; }
          .sheet { page-break-inside: auto; }
        }
      `}</style>
    </div>
  );
}
