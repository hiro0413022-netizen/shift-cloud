import Link from "next/link";
import { requireActor, can } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { hasPayrollAccess } from "@/lib/reauth";
import { PageTitle, Table, Td, Badge, Button, Empty, Card } from "@/components/ui";
import { currentYM, addMonths, fmtMinutes, yen } from "@/lib/util";
import { ReauthForm } from "./reauth-form";
import { buildPayroll, lockPayroll } from "./actions";
import { logAudit } from "@/lib/audit";
import { monthRange } from "@/lib/payroll-calc";
import {
  PERSONAL_LESSON_UNIT_PRICE,
  splitLessonCounts,
  mergeByStaff,
  sumAmount,
  type LessonCountRow,
} from "@/lib/lesson-allowance";

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

  // レッスン手当の内訳（money-os売上台帳から集計 / DECISIONS #105）
  // 「集計を実行」でこの payroll 区分が payroll_allowances に取り込まれる
  const { from: mFrom, to: mTo } = monthRange(ym);
  const { data: lessonRows } = await admin.rpc("personal_lesson_counts", {
    p_company_id: actor.companyId,
    p_from: mFrom,
    p_to: mTo,
  });
  const lesson = splitLessonCounts((lessonRows ?? []) as LessonCountRow[]);
  const lessonPayroll = mergeByStaff(lesson.payroll);
  const lessonOutsourcing = mergeByStaff(lesson.outsourcing);
  const lessonExcluded = mergeByStaff(lesson.excluded);
  const hasLesson =
    lessonPayroll.length + lessonOutsourcing.length + lessonExcluded.length + lesson.unlinked.length > 0;

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

      {hasLesson && (
        <Card className="mb-6 !p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-semibold">レッスン手当</h2>
            <p className="text-xs text-zinc-500">
              money-osの売上台帳から自動集計（パーソナルレッスン25分 1件 = {yen(PERSONAL_LESSON_UNIT_PRICE)}）。
              「集計を実行」で下の「給与の手当」が反映されます。
            </p>
          </div>

          {lesson.unlinked.length > 0 && (
            <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">担当プロが特定できない売上があります（手当に反映されません）</p>
              <ul className="mt-1 list-disc pl-5">
                {lesson.unlinked.map((r) => (
                  <li key={r.pro_name}>
                    {r.pro_name} — {r.qty}件。money-osの売上明細で担当プロを設定するか、設定＞担当プロでスタッフに紐付けてください。
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Table headers={["担当プロ", "スタッフ", "件数", "手当額", "扱い"]}>
            {[
              ...lessonPayroll.map((r) => ({ r, tag: "給与の手当", color: "green" as const })),
              ...lessonOutsourcing.map((r) => ({ r, tag: "業務委託費に上乗せ", color: "blue" as const })),
              ...lessonExcluded.map((r) => ({ r, tag: "対象外（月給）", color: "zinc" as const })),
            ].map(({ r, tag, color }) => (
              <tr key={`${r.staff_id}-${tag}`} className="hover:bg-zinc-50">
                <Td>{r.pro_name}</Td>
                <Td className="font-medium">{r.staff_name ?? "—"}</Td>
                <Td>{r.qty}件</Td>
                <Td className={tag === "対象外（月給）" ? "text-zinc-400 line-through" : "font-semibold"}>
                  {yen(r.amount)}
                </Td>
                <Td>
                  <Badge color={color}>{tag}</Badge>
                </Td>
              </tr>
            ))}
          </Table>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <p>
              給与に入る手当 <span className="font-semibold">{yen(sumAmount(lessonPayroll))}</span>
            </p>
            {lessonOutsourcing.length > 0 && (
              <p className="text-zinc-600">
                業務委託費に上乗せ <span className="font-semibold">{yen(sumAmount(lessonOutsourcing))}</span>
                <span className="ml-1 text-xs">
                  （給与明細には載りません。「集計を実行」でmoney-osの外注費に自動計上されます）
                </span>
              </p>
            )}
          </div>
        </Card>
      )}

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
