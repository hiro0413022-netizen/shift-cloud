import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, StatusDot, Empty, fmtDate } from "@/components/ui";
import { TokenForm } from "./token-form";

export const dynamic = "force-dynamic";

export default async function ConnectorsPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const [{ data: connectors }, { data: webhookLogs }, { data: extEvents }] = await Promise.all([
    admin.from("connectors").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("kind").order("code"),
    admin.from("webhook_logs").select("*, connectors(name)").eq("company_id", actor.companyId).order("created_at", { ascending: false }).limit(20),
    admin.from("external_events").select("*, connectors(name)").eq("company_id", actor.companyId).order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Integration Mesh</h1>
        <p className="text-sm text-(--color-dim)">
          外部ツール連携。Webhook受信 → External Event → Company Event へ自動変換
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(connectors ?? []).map((c) => (
          <div key={c.id} className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <StatusDot status={c.status === "active" ? "completed" : c.status === "configured" ? "active" : c.status === "error" ? "danger" : "planned"} />
                {c.name}
              </span>
              <Badge tone={c.status === "active" ? "ok" : c.status === "configured" ? "accent" : "default"}>
                {c.status}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-(--color-dim)">
              {c.kind} ・ 最終イベント: {c.last_event_at ? fmtDate(c.last_event_at) : "なし"}
            </p>
            <div className="mt-3">
              <TokenForm connectorId={c.id} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Webhook受信ログ">
          {!webhookLogs || webhookLogs.length === 0 ? (
            <Empty>受信なし — トークン発行後、外部サービスのWebhookに登録してください</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {webhookLogs.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <Badge tone={l.status === "processed" ? "ok" : l.status === "error" ? "danger" : "default"}>
                    {l.status}
                  </Badge>
                  <span>{(l as unknown as { connectors: { name: string } | null }).connectors?.name ?? "-"}</span>
                  <span className="text-xs text-(--color-dim)">{fmtDate(l.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="External Events">
          {!extEvents || extEvents.length === 0 ? (
            <Empty>外部イベントなし</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {extEvents.map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <StatusDot status={e.processed ? "completed" : "warning"} />
                  <span>{(e as unknown as { connectors: { name: string } | null }).connectors?.name ?? "-"}</span>
                  <Badge>{e.external_type}</Badge>
                  <span className="text-xs text-(--color-dim)">{fmtDate(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
