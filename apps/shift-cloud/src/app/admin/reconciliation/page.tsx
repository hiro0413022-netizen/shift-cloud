import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PageTitle, Table, Td, Badge, Empty } from "@/components/ui";
import { currentYM, addMonths, timeJST, fmtMinutes, hm, dowJP } from "@/lib/util";
import { monthRange } from "@/lib/payroll-calc";

/** 月末照合: 希望 / 確定 / 打刻 / 実勤務 の突き合わせ */
export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ store?: string; ym?: string }> }) {
  const actor = await requireActor("edit_attendance");
  const admin = createAdmin();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYM();

  const { data: stores } = await admin.from("stores").select("id, name")
    .eq("company_id", actor.companyId).is("deleted_at", null).order("name");
  const storeId = sp.store ?? stores?.[0]?.id;
  if (!storeId) return <PageTitle>月末照合</PageTitle>;

  const { from, to } = monthRange(ym); // -31固定は2月等で0件になる（DECISIONS #53）
  const [{ data: shifts }, { data: attendance }, { data: requests }] = await Promise.all([
    admin.from("shifts").select("staff_id, date, start_time, end_time, is_day_off, staff(name), shift_templates(name)")
      .eq("company_id", actor.companyId).eq("store_id", storeId).eq("status", "published")
      .is("deleted_at", null).gte("date", from).lte("date", to).order("date"),
    admin.from("attendance_days").select("*")
      .eq("company_id", actor.companyId).eq("store_id", storeId)
      .gte("date", from).lte("date", to),
    admin.from("shift_requests").select("staff_id, date, memo, shift_templates(name)")
      .eq("company_id", actor.companyId).eq("status", "submitted")
      .is("deleted_at", null).gte("date", from).lte("date", to),
  ]);

  const attMap = new Map((attendance ?? []).map((a) => [`${a.staff_id}|${a.date}`, a]));
  const reqMap = new Map((requests ?? []).map((r) => [`${r.staff_id}|${r.date}`, r]));

  const rows = (shifts ?? []).filter((s) => !s.is_day_off);

  return (
    <>
      <PageTitle>月末照合</PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/admin/reconciliation?store=${storeId}&ym=${addMonths(ym, -1)}`} className="text-zinc-400">←</Link>
          <p className="font-semibold">{ym.replace("-", "年")}月</p>
          <Link href={`/admin/reconciliation?store=${storeId}&ym=${addMonths(ym, 1)}`} className="text-zinc-400">→</Link>
        </div>
        <div className="flex gap-1">
          {stores?.map((s) => (
            <Link key={s.id} href={`/admin/reconciliation?store=${s.id}&ym=${ym}`}
              className={`rounded-md px-3 py-1.5 text-sm ${s.id === storeId ? "bg-brand-light font-medium text-brand" : "text-zinc-500 hover:bg-zinc-100"}`}>
              {s.name.replace("GOLF WING ", "")}
            </Link>
          ))}
        </div>
      </div>

      {!rows.length ? (
        <Empty>この月の確定シフトはありません</Empty>
      ) : (
        <Table headers={["日付", "スタッフ", "希望", "確定シフト", "打刻", "実働", "差異"]}>
          {rows.map((s, i) => {
            const key = `${s.staff_id}|${s.date}`;
            const att = attMap.get(key);
            const req = reqMap.get(key);
            const diffs: string[] = [];
            if (att) {
              if (att.is_missing_clock) diffs.push("打刻漏れ");
              if (att.late_minutes > 0) diffs.push(`遅刻${att.late_minutes}分`);
              if (att.early_leave_minutes > 0) diffs.push(`早退${att.early_leave_minutes}分`);
              if (att.overtime_minutes > 0) diffs.push(`退勤${att.overtime_minutes}分超過`);
            } else {
              diffs.push("勤怠記録なし");
            }
            const ok = diffs.length === 0;
            return (
              <tr key={i} className={`hover:bg-zinc-50 ${!ok ? "bg-amber-50/40" : ""}`}>
                <Td className="whitespace-nowrap">{s.date.slice(5)}（{dowJP(s.date)}）</Td>
                <Td className="font-medium">{(s.staff as unknown as { name: string } | null)?.name}</Td>
                <Td className="text-zinc-500">
                  {req ? (req.shift_templates as unknown as { name: string } | null)?.name ?? "メモ" : "—"}
                  {req?.memo && <span title={req.memo}> 📝</span>}
                </Td>
                <Td>{hm(s.start_time)}〜{hm(s.end_time)}</Td>
                <Td>{att ? `${timeJST(att.clock_in)}〜${timeJST(att.clock_out)}` : "—"}</Td>
                <Td className="font-medium">{att ? fmtMinutes(att.work_minutes) : "—"}</Td>
                <Td>
                  {ok ? <Badge color="green">一致</Badge> : (
                    <div className="flex flex-wrap gap-1">
                      {diffs.map((d) => <Badge key={d} color={d === "打刻漏れ" || d === "勤怠記録なし" ? "red" : "amber"}>{d}</Badge>)}
                    </div>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </>
  );
}
