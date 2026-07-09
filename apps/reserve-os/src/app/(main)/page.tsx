import Link from "next/link";
import { requireReserveActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Badge, Empty } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE, fmtSeq, fmtJstShort, CATEGORY_LABEL } from "@/lib/reserve";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

const TABS: { key: string; label: string }[] = [
  { key: "pending", label: "確認待ち" },
  { key: "confirmed", label: "確定" },
  { key: "all", label: "すべて" },
];

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireReserveActor();
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? sp.status! : "pending";
  const admin = createAdmin();

  let q = admin
    .from("res_requests")
    .select("id, request_seq, service_name, service_category, name, name_kana, phone, pref1_at, status, source, created_at")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (status !== "all") q = q.eq("status", status);

  const { data } = await q;
  const rows = (data ?? []) as Row[];

  // 件数（バッジ用）
  const { count: pendingCount } = await admin
    .from("res_requests")
    .select("id", { count: "exact", head: true })
    .eq("company_id", actor.companyId)
    .eq("status", "pending")
    .is("deleted_at", null);

  const exportHref = `/api/requests-export${status !== "all" ? `?status=${status}` : ""}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">予約申込</h1>
          <p className="text-sm text-[--color-dim]">
            確認待ち <span className="font-semibold text-[--color-accent]">{pendingCount ?? 0}</span> 件
          </p>
        </div>
        <a href={exportHref} className="rounded-lg border border-[--color-line] bg-white px-3.5 py-2 text-sm font-medium text-[--color-txt] transition-colors hover:bg-[--color-panel-2]">
          CSVで書き出す
        </a>
      </div>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/?status=${t.key}`}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              status === t.key ? "bg-[--color-accent] text-white" : "border border-[--color-line] bg-white text-[--color-dim] hover:bg-[--color-panel-2]"
            }`}
          >
            {t.label}
            {t.key === "pending" && (pendingCount ?? 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-xs">{pendingCount}</span>
            )}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty>該当する申込はありません。</Empty>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Link
              key={String(r.id)}
              href={`/requests/${r.id}`}
              className="hud reveal block rounded-2xl border border-[--color-line] bg-[--color-panel] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium tabular-nums text-[--color-dim]">{fmtSeq(r.request_seq as number)}</span>
                    <Badge tone="accent">{CATEGORY_LABEL[String(r.service_category)] ?? String(r.service_name ?? "")}</Badge>
                  </div>
                  <p className="mt-1 truncate text-base font-semibold">{String(r.name)} 様</p>
                  <p className="truncate text-sm text-[--color-dim]">
                    第1希望 {fmtJstShort(r.pref1_at as string)}・{String(r.phone ?? "")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge tone={STATUS_TONE[String(r.status)] ?? "default"}>{STATUS_LABEL[String(r.status)] ?? String(r.status)}</Badge>
                  <p className="mt-1 text-[11px] text-[--color-dim]">{fmtJstShort(r.created_at as string)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
