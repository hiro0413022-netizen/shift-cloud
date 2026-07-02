import Link from "next/link";
import { requireActor, can } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { hasPayrollAccess } from "@/lib/reauth";
import { PageTitle, Table, Td, Badge, Button, Empty, Card } from "@/components/ui";
import { currentYM, addMonths, fmtMinutes, yen } from "@/lib/util";
import { ReauthForm } from "./reauth-form";
import { buildPayroll, lockPayroll } from "./actions";
import { logAudit } from "@/lib/audit";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor("view_payroll");
  const sp = await searchParams;
  const ym = sp.ym ?? currentYM();

  if (!(await hasPayrollAccess(actor.staffId))) {
    return (
      <>
        <PageTitle>給与確認</PageTitle>
        <ReauthForm />
      </>
    );
  }

  const admin = createAdmin();
  const { data: period } = await admin.from("payroll_periods")
    .select("*").eq("company_id", actor.companyId).eq("target_month", `${ym}-01`).maybeSingle();

  const { data: items } = period
    ? await admin.from("payroll_items")
        .select("*, staff(name, employment_type)")
        .eq("period_id", period.id).order("total_amount", { ascending: false })
    : { data: [] };

  // 給与閲覧も監査ログに残す（SECURITY.md）
  await logAudit(actor, "payroll.view", "payroll_items", period?.id ?? null, null, { ym });

  const total = (items ?? []).reduce((s, i) => s + i.total_amount, 0);
  const canManage = can(actor, "manage_payroll");

  async function buildAction(formData: FormData) {
    "use server";
    await buildPayroll(formData);
  }

  return (
    <>
      <PageTitle>給与確認</PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/admin/payroll?ym=${addMonths(ym, -1)}`} className="text-zinc-400">←</Link>
          <p className="font-semibold">{ym.replace("-", "年")}月</p>
          <Link href={`/admin/payroll?ym=${addMonths(ym, 1)}`} className="text-zinc-400">→</Link>
        </div>
        {period && (
          <Badge color={period.status === "locked" ? "zinc" : "green"}>
            {period.status === "locked" ? "締め済み" : "集計中"}
          </Badge>
        )}
        {canManage && (
          <div className="flex gap-2">
            <form action={buildAction}>
              <input type="hidden" name="ym" value={ym} />
              <Button type="submit" variant="secondary" disabled={period?.status === "locked"}>集計を実行</Button>
            </form>
            {period && period.status === "open" && !!items?.length && (
              <form action={lockPayroll}>
                <input type="hidden" name="period_id" value={period.id} />
                <Button type="submit">月締めする</Button>
              </form>
            )}
            {period && !!items?.length && (
              <a href={`/admin/payroll/csv?ym=${ym}`}>
                <Button type="button" variant="secondary">CSV出力</Button>
              </a>
            )}
          </div>
        )}
      </div>

      {!items?.length ? (
        <Empty>集計データがありません。「集計を実行」を押してください。</Empty>
      ) : (
        <>
          <Card className="mb-4 max-w-xs !p-4">
            <p className="text-xs text-zinc-500">支給見込み合計（{items.length}名）</p>
            <p className="mt-1 text-2xl font-semibold">{yen(total)}</p>
          </Card>
          <Table headers={["スタッフ", "勤務時間", "残業", "基本", "残業代", "交通費", "手当", "控除", "支給見込み"]}>
            {items.map((i) => (
              <tr key={i.id} className="hover:bg-zinc-50">
                <Td className="font-medium">{(i.staff as unknown as { name: string } | null)?.name}</Td>
                <Td>{fmtMinutes(i.work_minutes)}</Td>
                <Td>{i.overtime_minutes > 0 ? fmtMinutes(i.overtime_minutes) : "—"}</Td>
                <Td>{yen(i.base_amount)}</Td>
                <Td>{yen(i.overtime_amount)}</Td>
                <Td>{yen(i.commute_amount)}</Td>
                <Td>{yen(i.allowance_amount)}</Td>
                <Td>{yen(i.deduction_amount)}</Td>
                <Td className="font-semibold">{yen(i.total_amount)}</Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  );
}
