import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { currentYM, addMonths, daysOfMonth, daysBetween, halfMonthRange, fmtDateJP, dowJP, hm } from "@/lib/util";
import { PrintButton } from "./print-button";

type Shift = { staff_id: string; date: string; start_time: string | null; end_time: string | null; is_day_off: boolean; template_id: string | null };
type Template = { id: string; name: string; start_time: string | null; end_time: string | null; is_day_off: boolean; color: string };

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export default async function ShiftPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; ym?: string; range?: string; start?: string; end?: string }>;
}) {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const sp = await searchParams;
  const ym = sp.ym ?? addMonths(currentYM(), 1);
  const range = sp.range ?? "month";

  let start: string, end: string;
  if (range === "half1") ({ start, end } = halfMonthRange(ym, 1));
  else if (range === "half2") ({ start, end } = halfMonthRange(ym, 2));
  else if (range === "custom" && sp.start && sp.end) { start = sp.start; end = sp.end; }
  else { const d = daysOfMonth(ym); start = d[0]; end = d[d.length - 1]; }
  const days = daysBetween(start, end);

  const { data: stores } = await admin.from("stores").select("id, name")
    .eq("company_id", actor.companyId).is("deleted_at", null).order("name");
  const storeId = sp.store ?? stores?.[0]?.id;
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

  // 役職ごとにグルーピング（PDFの「コーチ」「受付」を再現）
  const groups = new Map<string, { id: string; name: string }[]>();
  for (const s of staffRows ?? []) {
    const key = s.position || "スタッフ";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ id: s.id, name: s.name });
  }
  const groupList = [...groups.entries()];

  function cell(staffId: string, date: string) {
    const sh = shiftMap.get(`${staffId}|${date}`);
    if (!sh) return null;
    if (sh.is_day_off) return { text: "休み", off: true, color: undefined as string | undefined };
    if (sh.start_time && sh.end_time) return { text: `${hm(sh.start_time)}〜${hm(sh.end_time)}`, off: false, color: undefined };
    if (sh.template_id) {
      const t = tmap.get(sh.template_id);
      if (t) return { text: t.name, off: false, color: t.color };
    }
    return null;
  }

  const weeks = chunk(days, 7);
  const storeName = store?.name?.replace("GOLF WING ", "") ?? "";
  const title = `${fmtDateJP(start)}〜${fmtDateJP(end)}のシフト`;

  const RANGES = [
    { key: "month", label: "1ヶ月" },
    { key: "half1", label: "前半(1〜15)" },
    { key: "half2", label: "後半(16〜末)" },
  ];

  return (
    <div className="print-root bg-white p-6 text-black">
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

      <div className="mb-2 flex items-baseline justify-between">
        <h1 className="text-base font-bold">{title}</h1>
        <p className="text-sm font-semibold">{storeName}</p>
      </div>

      {weeks.map((week, wi) => (
        <table key={wi} className="print-table mb-4 w-full border-collapse">
          <thead>
            <tr>
              <th className="border border-black bg-zinc-100 px-1 py-1 text-[11px]" />
              <th className="border border-black bg-zinc-100 px-2 py-1 text-left text-[11px]">氏名</th>
              {week.map((d) => {
                const w = dowJP(d);
                return (
                  <th key={d} className={`border border-black bg-zinc-100 px-1 py-1 text-center text-[11px] ${w === "日" || w === "土" ? "text-red-600" : ""}`}>
                    {Number(d.slice(5, 7))}/{Number(d.slice(8))}<br />（{w}）
                  </th>
                );
              })}
              {week.length < 7 && Array.from({ length: 7 - week.length }).map((_, i) => (
                <th key={`e${i}`} className="border border-black bg-zinc-100" />
              ))}
            </tr>
          </thead>
          <tbody>
            {groupList.map(([gname, members]) => (
              members.map((m, mi) => (
                <tr key={m.id}>
                  {mi === 0 && (
                    <td rowSpan={members.length} className="border border-black bg-zinc-50 px-1 text-center align-middle text-[11px] font-bold"
                      style={{ writingMode: "vertical-rl", whiteSpace: "nowrap" }}>
                      {gname}
                    </td>
                  )}
                  <td className="border border-black px-2 py-1 text-[12px] font-medium whitespace-nowrap">{m.name}</td>
                  {week.map((d) => {
                    const c = cell(m.id, d);
                    return (
                      <td key={d} className={`border border-black px-1 py-1 text-center text-[11px] ${c?.off ? "font-bold text-red-600" : ""}`}
                        style={c?.color ? { background: c.color + "33", fontWeight: 600 } : undefined}>
                        {c?.text ?? ""}
                      </td>
                    );
                  })}
                  {week.length < 7 && Array.from({ length: 7 - week.length }).map((_, i) => (
                    <td key={`e${i}`} className="border border-black" />
                  ))}
                </tr>
              ))
            ))}
            {/* 備考行（手書き用） */}
            <tr>
              <td className="border border-black bg-zinc-50 px-1 text-center align-middle text-[11px] font-bold" style={{ writingMode: "vertical-rl" }}>備考</td>
              <td className="h-10 border border-black" colSpan={8} />
            </tr>
          </tbody>
        </table>
      ))}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside { display: none !important; }
          main { margin-left: 0 !important; padding: 0 !important; }
          @page { size: A4 landscape; margin: 10mm; }
          .print-root { padding: 0 !important; }
        }
        .print-table td, .print-table th { border-color: #000; }
      `}</style>
    </div>
  );
}
