import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PageTitle, Table, Td, Badge, Empty } from "@/components/ui";
import { currentYM, addMonths, timeJST, fmtMinutes, dowJP } from "@/lib/util";
import { CorrectionForm } from "./correction-form";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ store?: string; ym?: string }> }) {
  const actor = await requireActor("edit_attendance");
  const admin = createAdmin();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYM();

  const { data: stores } = await admin.from("stores").select("id, name")
    .eq("company_id", actor.companyId).is("deleted_at", null).order("name");
  const storeId = sp.store ?? stores?.[0]?.id;
  if (!storeId) return <PageTitle>勤怠管理</PageTitle>;

  const { data: days } = await admin
    .from("attendance_days")
    .select("*, staff(name)")
    .eq("company_id", actor.companyId)
    .eq("store_id", storeId)
    .gte("date", `${ym}-01`)
    .lte("date", `${ym}-31`)
    .order("date", { ascending: false });

  return (
    <>
      <PageTitle>勤怠管理</PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/admin/attendance?store=${storeId}&ym=${addMonths(ym, -1)}`} className="text-zinc-400">←</Link>
          <p className="font-semibold">{ym.replace("-", "年")}月</p>
          <Link href={`/admin/attendance?store=${storeId}&ym=${addMonths(ym, 1)}`} className="text-zinc-400">→</Link>
        </div>
        <div className="flex gap-1">
          {stores?.map((s) => (
            <Link key={s.id} href={`/admin/attendance?store=${s.id}&ym=${ym}`}
              className={`rounded-md px-3 py-1.5 text-sm ${s.id === storeId ? "bg-brand-light font-medium text-brand" : "text-zinc-500 hover:bg-zinc-100"}`}>
              {s.name.replace("GOLF WING ", "")}
            </Link>
          ))}
        </div>
      </div>

      {!days?.length ? (
        <Empty>この月の勤怠記録はありません</Empty>
      ) : (
        <Table headers={["日付", "スタッフ", "出勤", "退勤", "休憩", "実働", "差異", "状態", ""]}>
          {days.map((d) => (
            <tr key={d.id} className="hover:bg-zinc-50">
              <Td className="whitespace-nowrap">{d.date.slice(5)}（{dowJP(d.date)}）</Td>
              <Td className="font-medium">{(d.staff as unknown as { name: string } | null)?.name}</Td>
              <Td>{timeJST(d.clock_in)}</Td>
              <Td>{timeJST(d.clock_out)}</Td>
              <Td>
                <span className="whitespace-nowrap">{d.break_minutes}分</span>
                {d.break_override_minutes != null
                  ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">手動</span>
                  : <span className="ml-1 text-[10px] text-zinc-400">自動</span>}
              </Td>
              <Td className="font-medium">{fmtMinutes(d.work_minutes)}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {d.is_missing_clock && <Badge color="red">打刻漏れ</Badge>}
                  {d.late_minutes > 0 && <Badge color="amber">遅刻{d.late_minutes}分</Badge>}
                  {d.early_leave_minutes > 0 && <Badge color="amber">早退{d.early_leave_minutes}分</Badge>}
                  {d.overtime_minutes > 0 && <Badge color="blue">残業{d.overtime_minutes}分</Badge>}
                  {!d.is_missing_clock && !d.late_minutes && !d.early_leave_minutes && !d.overtime_minutes && <Badge color="green">正常</Badge>}
                </div>
              </Td>
              <Td>{d.status === "corrected" ? <Badge color="amber">修正済</Badge> : <Badge color="zinc">自動</Badge>}</Td>
              <Td><CorrectionForm staffId={d.staff_id} storeId={d.store_id} date={d.date} breakMinutes={d.break_override_minutes ?? d.break_minutes} isBreakManual={d.break_override_minutes != null} /></Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
