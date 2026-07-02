import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Card, Table, Td, Badge, Button } from "@/components/ui";
import { currentYM, fmtMinutes, yen, todayJST } from "@/lib/util";
import { runSuggestionChecks } from "./suggestions/actions";
import Link from "next/link";

export default async function HqDashboard() {
  const actor = await requireActor("view_hq");
  const admin = createAdmin();
  const ym = currentYM();
  const from = `${ym}-01`, to = `${ym}-31`;

  const [{ data: stores }, { data: days }, { data: wages }, { data: staffCount }, { data: pendingSuggestions }] = await Promise.all([
    admin.from("stores").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
    admin.from("attendance_days").select("store_id, staff_id, work_minutes, overtime_minutes, is_missing_clock")
      .eq("company_id", actor.companyId).gte("date", from).lte("date", to),
    admin.from("staff_wages").select("staff_id, hourly_wage, effective_from")
      .eq("company_id", actor.companyId).is("deleted_at", null).order("effective_from", { ascending: false }),
    admin.from("staff").select("id, status").eq("company_id", actor.companyId).is("deleted_at", null),
    admin.from("ai_suggestions").select("id, severity").eq("company_id", actor.companyId).eq("approval_status", "pending"),
  ]);

  function hourlyFor(staffId: string) {
    return (wages ?? []).find((w) => w.staff_id === staffId && w.effective_from <= todayJST())?.hourly_wage ?? 0;
  }

  // 店舗別集計
  const byStore = new Map<string, { work: number; overtime: number; cost: number; missing: number; staff: Set<string> }>();
  for (const d of days ?? []) {
    const cur = byStore.get(d.store_id) ?? { work: 0, overtime: 0, cost: 0, missing: 0, staff: new Set<string>() };
    cur.work += d.work_minutes;
    cur.overtime += d.overtime_minutes;
    cur.cost += Math.floor((d.work_minutes / 60) * hourlyFor(d.staff_id));
    if (d.is_missing_clock) cur.missing += 1;
    cur.staff.add(d.staff_id);
    byStore.set(d.store_id, cur);
  }

  const totalWork = [...byStore.values()].reduce((s, v) => s + v.work, 0);
  const totalCost = [...byStore.values()].reduce((s, v) => s + v.cost, 0);
  const totalMissing = [...byStore.values()].reduce((s, v) => s + v.missing, 0);
  const activeStaff = (staffCount ?? []).filter((s) => s.status === "active").length;
  const criticalCount = (pendingSuggestions ?? []).filter((s) => s.severity === "critical").length;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">本部ダッシュボード <span className="ml-2 text-sm font-normal text-zinc-400">{ym.replace("-", "年")}月</span></h1>
        <form action={runSuggestionChecks}>
          <Button variant="secondary" type="submit">AIチェックを実行</Button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card className="!p-4">
          <p className="text-xs text-zinc-500">総労働時間</p>
          <p className="mt-1 text-xl font-semibold">{fmtMinutes(totalWork)}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-zinc-500">人件費見込み</p>
          <p className="mt-1 text-xl font-semibold">{yen(totalCost)}</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-zinc-500">在籍スタッフ</p>
          <p className="mt-1 text-xl font-semibold">{activeStaff}名</p>
        </Card>
        <Card className="!p-4">
          <p className="text-xs text-zinc-500">打刻漏れ（今月）</p>
          <p className={`mt-1 text-xl font-semibold ${totalMissing > 0 ? "text-red-600" : ""}`}>{totalMissing}件</p>
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

      <h2 className="mb-3 text-sm font-semibold text-zinc-500">店舗比較</h2>
      <Table headers={["店舗", "稼働スタッフ", "労働時間", "残業", "人件費見込み", "打刻漏れ"]}>
        {(stores ?? []).map((s) => {
          const v = byStore.get(s.id);
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
