import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Card, Table, Td, Badge, Button } from "@/components/ui";
import { currentYM, fmtMinutes, yen } from "@/lib/util";
import { monthRange, type WageRow, type AllowanceRow } from "@/lib/payroll-calc";
import { summarizeLabor, type LaborDay } from "@/lib/labor-summary";
import { runSuggestionChecks } from "./suggestions/actions";
import Link from "next/link";

/**
 * 本部ダッシュボード。
 *
 * 労働時間・人件費は **給与計算と同一ロジック**（lib/labor-summary.ts → payroll-calc.ts）。
 * 画面側で work_minutes を合計したり hourly_wage を掛けたりしない（DECISIONS #53）。
 * 旧実装は独自集計で、15分丸めなし・月給者0円扱い・交通費/手当なし・`${ym}-31` 固定のバグがあった。
 */
export default async function HqDashboard() {
  const actor = await requireActor("view_hq");
  const admin = createAdmin();
  const ym = currentYM();
  const { from, to } = monthRange(ym);

  const [{ data: stores }, { data: days }, { data: wages }, { data: company }, { data: staffRows }, { data: assignments }, { data: period }, { data: pendingSuggestions }] =
    await Promise.all([
      admin.from("stores").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
      admin.from("attendance_days").select("store_id, staff_id, date, work_minutes, overtime_minutes, is_missing_clock")
        .eq("company_id", actor.companyId).gte("date", from).lte("date", to),
      admin.from("staff_wages").select("staff_id, hourly_wage, commute_allowance, effective_from, wage_type, monthly_salary")
        .eq("company_id", actor.companyId).is("deleted_at", null).order("effective_from", { ascending: false }),
      admin.from("companies").select("settings").eq("id", actor.companyId).single(),
      admin.from("staff").select("id, status").eq("company_id", actor.companyId).is("deleted_at", null),
      admin.from("staff_store_assignments").select("staff_id, store_id, is_primary")
        .eq("company_id", actor.companyId).is("deleted_at", null),
      admin.from("payroll_periods").select("id").eq("company_id", actor.companyId).eq("target_month", from).maybeSingle(),
      admin.from("ai_suggestions").select("id, severity").eq("company_id", actor.companyId).eq("approval_status", "pending"),
    ]);

  // 手当は給与集計を実行した月だけ存在する（未実行なら0）
  const { data: allowances } = period
    ? await admin.from("payroll_allowances").select("staff_id, kind, amount").eq("period_id", period.id).is("deleted_at", null)
    : { data: [] as AllowanceRow[] };

  const settings = (company?.settings ?? {}) as { rounding_minutes?: number; overtime_rate?: number };
  const rounding = settings.rounding_minutes ?? 0;

  const summary = summarizeLabor({
    days: (days ?? []) as LaborDay[],
    wages: (wages ?? []) as WageRow[],
    allowances: (allowances ?? []) as AllowanceRow[],
    roundingMinutes: rounding,
    overtimeRate: settings.overtime_rate ?? 1.25,
    monthEnd: to,
    primaryStoreOf: (staffId) =>
      (assignments ?? []).find((a) => a.staff_id === staffId && a.is_primary)?.store_id ??
      (assignments ?? []).find((a) => a.staff_id === staffId)?.store_id ??
      null,
  });

  const activeStaff = (staffRows ?? []).filter((s) => s.status === "active").length;
  const criticalCount = (pendingSuggestions ?? []).filter((s) => s.severity === "critical").length;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">本部ダッシュボード <span className="ml-2 text-sm font-normal text-zinc-400">{ym.replace("-", "年")}月</span></h1>
        <form action={runSuggestionChecks}>
          <Button variant="secondary" type="submit">AIチェックを実行</Button>
        </form>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card className="!p-4">
          <p className="text-xs text-zinc-500">総労働時間</p>
          <p className="mt-1 text-xl font-semibold">{fmtMinutes(summary.totalWork)}</p>
          <p className="mt-0.5 text-[11px] text-zinc-400">休憩控除後・{rounding > 0 ? `${rounding}分丸め` : "丸めなし"}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-zinc-500">人件費見込み</p>
          <p className="mt-1 text-xl font-semibold">{yen(summary.totalCost)}</p>
          <p className="mt-0.5 text-[11px] text-zinc-400">月給・交通費・手当込み</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-zinc-500">在籍スタッフ</p>
          <p className="mt-1 text-xl font-semibold">{activeStaff}名</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-zinc-500">打刻漏れ（今月）</p>
          <p className={`mt-1 text-xl font-semibold ${summary.totalMissing > 0 ? "text-red-600" : ""}`}>{summary.totalMissing}件</p>
        </Card>
        <Card className="!p-4">
          <Link href="/hq/suggestions" className="block">
            <p className="text-xs text-zinc-500">AI提案（未対応）</p>
            <p className="mt-1 text-xl font-semibold">
              {(pendingSuggestions ?? []).length}件
              {criticalCount > 0 && <Badge color="red">重要{criticalCount}</Badge>}
            </p>
          </Link>
        </Card>
      </div>

      <p className="mb-6 text-xs text-zinc-400">
        給与計算（/admin/payroll）と同じ基準で算出しています。店舗別の人件費は、月給など実働に紐づかない支給を主店舗へ計上した按分値です。
      </p>

      <h2 className="mb-3 text-sm font-semibold text-zinc-500">店舗比較</h2>
      <Table headers={["店舗", "稼働スタッフ", "労働時間", "残業", "人件費見込み", "打刻漏れ"]}>
        {(stores ?? []).map((s) => {
          const v = summary.byStore.get(s.id);
          return (
            <tr key={s.id} className="hover:bg-zinc-50">
              <Td className="font-medium">{s.name}</Td>
              <Td>{v?.staff.size ?? 0}名</Td>
              <Td>{fmtMinutes(v?.work ?? 0)}</Td>
              <Td>{v?.overtime ? fmtMinutes(v.overtime) : "—"}</Td>
              <Td>{yen(v?.cost ?? 0)}</Td>
              <Td>{v?.missing ? <Badge color="red">{v.missing}件</Badge> : <Badge color="green">0</Badge>}</Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
