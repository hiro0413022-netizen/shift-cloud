import Link from "next/link";
import QRCode from "qrcode";
import { requireSurveyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { publicOrigin } from "@/lib/base-url";
import { Panel, Badge, Empty, fmtDate, STATUS_LABEL, btnGhostCls } from "@/components/ui";
import { NewSurveyButton } from "@/components/new-survey-button";

export const dynamic = "force-dynamic";

export default async function SurveyListPage() {
  const actor = await requireSurveyActor();
  const admin = createAdmin();
  const origin = await publicOrigin();

  const { data } = await admin
    .from("svy_surveys")
    .select("id, slug, title, description, status, response_count, est_minutes, updated_at")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  const surveys = data ?? [];

  const cards = await Promise.all(
    surveys.map(async (s) => {
      const url = `${origin}/s/${s.slug}`;
      const qr = s.status === "open" ? await QRCode.toDataURL(url, { margin: 1, width: 160 }) : null;
      return { s, url, qr };
    })
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">アンケート一覧</h1>
          <p className="mt-1 text-sm text-[--color-dim]">作成・編集・回答の集計・CSV出力・公開URL/QRの確認ができます。</p>
        </div>
        <NewSurveyButton />
      </div>

      {cards.length === 0 && (
        <Panel>
          <Empty>アンケートがまだありません。</Empty>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {cards.map(({ s, url, qr }) => (
          <Panel key={s.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <Badge tone={s.status === "open" ? "ok" : s.status === "closed" ? "danger" : "default"}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </Badge>
                  <span className="text-xs text-[--color-dim]">更新 {fmtDate(s.updated_at)}</span>
                </div>
                <h2 className="truncate text-base font-bold">{s.title}</h2>
                {s.description && <p className="mt-0.5 truncate text-sm text-[--color-dim]">{s.description}</p>}
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {s.response_count}
                  <span className="ml-1 text-sm font-medium text-[--color-dim]">件の回答</span>
                </p>
              </div>
              {qr && (
                <div className="shrink-0 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="QRコード" className="h-24 w-24 rounded-lg border border-[--color-line]" />
                  <p className="mt-1 text-[10px] text-[--color-dim]">回答用QR</p>
                </div>
              )}
            </div>

            {s.status !== "draft" && (
              <div className="mt-3 rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2">
                <p className="text-[11px] text-[--color-dim]">公開URL</p>
                <a href={url} target="_blank" rel="noreferrer" className="break-all text-xs font-medium text-accent">
                  {url}
                </a>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/${s.id}/results`} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent/90">
                集計を見る
              </Link>
              <Link href={`/${s.id}/edit`} className={btnGhostCls}>
                編集
              </Link>
              <a href={`/api/export/${s.id}?type=wide`} className={btnGhostCls}>
                CSV（全回答）
              </a>
              <a href={`/api/export/${s.id}?type=coach`} className={btnGhostCls}>
                CSV（コーチ得点）
              </a>
              {s.status !== "draft" && (
                <a href={url} target="_blank" rel="noreferrer" className={btnGhostCls}>
                  回答ページ
                </a>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
