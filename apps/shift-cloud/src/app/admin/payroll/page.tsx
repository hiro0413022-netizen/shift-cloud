import Link from "next/link";
import { requireActor, can, isOwner, scopedStoreIds, NO_STORE } from "@/lib/auth";
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
import { LessonUnlinkedFixer, type UnlinkedLine, type ProOption, type StaffOption } from "./lesson-fix";

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

  // 店舗スコープ（#134・#128 店舗またぎ廃止）
  // payroll_periods / payroll_items は「会社×月」で店舗次元を持たない。
  // 非オーナーには自店舗に配属されているスタッフの明細だけを見せる（他店の給与が丸見えだった）。
  const owner = isOwner(actor);
  let scopedStaffIds: string[] | null = null;
  if (!owner) {
    const storeIds = await scopedStoreIds(actor);
    const { data: assigns } = await admin
      .from("staff_store_assignments")
      .select("staff_id")
      .eq("company_id", actor.companyId)
      .in("store_id", storeIds)
      .is("deleted_at", null);
    const ids = [...new Set((assigns ?? []).map((a) => a.staff_id))];
    scopedStaffIds = ids.length > 0 ? ids : [NO_STORE];
  }

  let itemsQuery = period
    ? admin.from("payroll_items").select("*, staff(name, employment_type)").eq("period_id", period.id)
    : null;
  if (itemsQuery && scopedStaffIds) itemsQuery = itemsQuery.in("staff_id", scopedStaffIds);
  const { data: items } = itemsQuery
    ? await itemsQuery.order("total_amount", { ascending: false })
    : { data: [] };

  // レッスン手当の内訳（money-os売上台帳から集計 / DECISIONS #105）
  // 「集計を実行」でこの payroll 区分が payroll_allowances に取り込まれる
  // TODO(#134): personal_lesson_counts は会社単位（売上台帳に店舗次元がない）。
  //   パーソナルレッスンは現状GOLF WINGのみなので実害はないが、姫路でも始めたら店舗で分ける必要がある。
  const { from: mFrom, to: mTo } = monthRange(ym);
  const { data: lessonRows } = await admin.rpc("personal_lesson_counts", {
    p_company_id: actor.companyId,
    p_from: mFrom,
    p_to: mTo,
  });
  const lesson = splitLessonCounts((lessonRows ?? []) as LessonCountRow[]);

  // 未紐付けがある月だけ「どの明細か」まで取りに行き、画面上で直せるようにする（0104）
  let unlinkedLines: UnlinkedLine[] = [];
  let proOptions: ProOption[] = [];
  let staffOptions: StaffOption[] = [];
  if (lesson.unlinked.length > 0) {
    const [u, p, s] = await Promise.all([
      admin.rpc("personal_lesson_unlinked_lines", {
        p_company_id: actor.companyId,
        p_from: mFrom,
        p_to: mTo,
      }),
      admin
        .from("mon_pros")
        .select("id, name, staff_id, payout_mode")
        .eq("company_id", actor.companyId)
        .is("deleted_at", null)
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      admin
        .from("staff")
        .select("id, name")
        .eq("company_id", actor.companyId)
        .is("deleted_at", null)
        .order("name"),
    ]);
    unlinkedLines = (u.data ?? []) as UnlinkedLine[];
    proOptions = (p.data ?? []) as ProOption[];
    staffOptions = (s.data ?? []) as StaffOption[];
  }

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
              <>
                <a href={`/admin/payroll/csv?ym=${ym}`}>
                  <Button type="button" variant="secondary">CSV出力</Button>
                </a>
                {/* 1人1ページ（明細＋日別出勤簿）を全員分まとめたPDF */}
                <a href={`/admin/payroll/pdf?ym=${ym}`}>
                  <Button type="button" variant="secondary">明細PDF（出勤簿つき）</Button>
                </a>
              </>
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

          {canManage ? (
            <LessonUnlinkedFixer lines={unlinkedLines} pros={proOptions} staff={staffOptions} ym={ym} />
          ) : (
            lesson.unlinked.length > 0 && (
              <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">担当プロが特定できない売上があります（手当に反映されません）</p>
                <ul className="mt-1 list-disc pl-5">
                  {lesson.unlinked.map((r) => (
                    <li key={r.pro_name}>
                      {r.pro_name} — {r.qty}件
                    </li>
                  ))}
                </ul>
              </div>
            )
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
