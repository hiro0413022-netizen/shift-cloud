import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { businessDate, castMonthLines, getActiveRules, monthRange, resolveNightStore } from "@/lib/night";

/**
 * 月次給与のCSV（税理士・社労士へ渡す用）。
 * 出すのは台帳そのまま。表示の都合で行を落としたり金額を丸めたりしない。
 */
export async function GET(request: Request) {
  await requireActor();
  const store = await resolveNightStore();
  if (!store) return new NextResponse("店舗が見つかりません", { status: 404 });

  const url = new URL(request.url);
  const m = url.searchParams.get("m");
  const month = m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : `${businessDate().slice(0, 7)}-01`;
  const { from, to } = monthRange(month);

  const { rules } = await getActiveRules(store.id);
  const lines = await castMonthLines(store.id, month, rules);

  const header = [
    "対象月",
    "氏名",
    "源氏名",
    "出勤日数",
    "実働時間",
    "時給分",
    "バック",
    "手当",
    "控除",
    "訂正",
    "支給額",
    "日払い済",
    "差引支給",
  ];
  const rows = lines.map((l) => [
    `${from}〜${to}`,
    l.cast.name,
    l.cast.displayName,
    l.line.workDays,
    (l.line.workMinutes / 60).toFixed(1),
    l.line.hourlyTotal,
    l.line.backTotal,
    l.line.allowanceTotal,
    l.line.deductionTotal,
    l.line.adjustmentTotal,
    l.line.gross,
    l.line.advanceTotal,
    l.line.net,
  ]);

  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");

  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="night-payroll-${from.slice(0, 7)}.csv"`,
    },
  });
}
