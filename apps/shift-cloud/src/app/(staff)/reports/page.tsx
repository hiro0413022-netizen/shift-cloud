import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Card, Badge } from "@/components/ui";
import { todayJST, mondayOf, fmtDateJP } from "@/lib/util";
import { ReportForm } from "./report-form";

/**
 * 日報・週報（DECISIONS #48）
 * 自分の記入＋店舗メンバーの直近レポート閲覧（情報共有）。
 * CEO AIの日次レポートへの要約流入は後続フェーズ（sp_reports.ai_summary）。
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const tab: "daily" | "weekly" = sp.tab === "weekly" ? "weekly" : "daily";
  const today = todayJST();
  const key = tab === "weekly" ? mondayOf(today) : today;

  const [{ data: mine }, { data: recent }] = await Promise.all([
    admin
      .from("sp_reports")
      .select("body")
      .eq("staff_id", actor.staffId)
      .eq("type", tab)
      .eq("date", key)
      .is("deleted_at", null)
      .maybeSingle(),
    admin
      .from("sp_reports")
      .select("id, type, date, body, staff_id, staff(name), stores(name), updated_at")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  // 情報共有: 社内メンバーの直近レポートを全員が見られる（店舗絞込みは後続で必要になれば）
  const visible = recent ?? [];

  return (
    <div className="space-y-4">
      <div className="flex rounded-lg border border-zinc-200 bg-white p-1 text-sm">
        <Link
          href="/reports"
          className={`flex-1 rounded-md py-1.5 text-center ${tab === "daily" ? "bg-brand-light font-medium text-brand" : "text-zinc-500"}`}
        >
          日報
        </Link>
        <Link
          href="/reports?tab=weekly"
          className={`flex-1 rounded-md py-1.5 text-center ${tab === "weekly" ? "bg-brand-light font-medium text-brand" : "text-zinc-500"}`}
        >
          週報
        </Link>
      </div>

      <Card>
        <p className="mb-2 text-sm font-medium text-zinc-500">
          {tab === "daily" ? `今日の日報（${fmtDateJP(key)}）` : `今週の週報（${fmtDateJP(key)}の週）`}
        </p>
        <ReportForm key={`${tab}-${key}`} type={tab} initialBody={mine?.body ?? ""} />
      </Card>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-500">みんなのレポート</p>
        <div className="space-y-2">
          {visible.length === 0 && <p className="text-sm text-zinc-400">まだレポートがありません</p>}
          {visible.map((r) => (
            <Card key={r.id} className="!p-4">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="font-medium text-zinc-600">{(r.staff as unknown as { name: string } | null)?.name}</span>
                <Badge color={r.type === "daily" ? "zinc" : "amber"}>{r.type === "daily" ? "日報" : "週報"}</Badge>
                <span>{fmtDateJP(r.date)}{r.type === "weekly" ? "の週" : ""}</span>
                <span>{(r.stores as unknown as { name: string } | null)?.name}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{r.body}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
