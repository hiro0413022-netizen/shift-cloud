import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Card, Badge } from "@/components/ui";
import { incidentCategoryLabel, INCIDENT_SEVERITY_LABEL, normalizeSeverity } from "@yozan/core/incidents";
import { nowPartsJST } from "@/lib/util";
import { IncidentForm } from "./incident-form";
import { IncidentItem } from "./incident-item";

/**
 * イレギュラー報告（DECISIONS #125 / 日報・週報 sp_reports の置き換え）
 *
 * 毎日書かせるのをやめ、「何かあった時だけ」書く。カテゴリー→いつ/どこ/だれ/なに/対応 の構造化入力。
 * 集まった報告は Genesis /incidents で分析され、再発防止策になる。
 */
export default async function ReportsPage() {
  const actor = await requireActor();
  const admin = createAdmin();
  const { date, time } = nowPartsJST();

  const [{ data: stores }, { data: recent }] = await Promise.all([
    actor.storeIds.length
      ? admin.from("stores").select("id, name").in("id", actor.storeIds).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    admin
      .from("sp_incidents")
      .select("id, category, severity, occurred_at, place, involved, body, action_taken, status, resolution_note, staff:staff_id(name), stores:store_id(name)")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(30),
  ]);

  const rows = recent ?? [];
  const openCount = rows.filter((r) => r.status === "open").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">イレギュラー報告</h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          いつもと違うことが起きた時だけ書いてください。毎日の報告は不要です。
        </p>
      </div>

      <IncidentForm
        stores={stores ?? []}
        defaultStoreId={actor.primaryStoreId}
        nowDate={date}
        nowTime={time}
      />

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-medium text-zinc-500">みんなの報告</p>
          {openCount > 0 && <span className="text-xs text-amber-600">未対応 {openCount} 件</span>}
        </div>
        <div className="space-y-2">
          {rows.length === 0 && (
            <Card className="!p-4">
              <p className="text-sm text-zinc-400">まだ報告はありません。何かあった時に上から報告してください。</p>
            </Card>
          )}
          {rows.map((r) => {
            const sev = normalizeSeverity(r.severity);
            return (
              <Card key={r.id} className="!p-4">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
                  <Badge color={sev === "high" ? "red" : sev === "mid" ? "amber" : "zinc"}>
                    {INCIDENT_SEVERITY_LABEL[sev]}
                  </Badge>
                  <Badge color="blue">{incidentCategoryLabel(r.category)}</Badge>
                  {r.status === "resolved" && <Badge color="green">対応済み</Badge>}
                  <span>
                    {new Date(r.occurred_at).toLocaleString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span>{(r.stores as unknown as { name: string } | null)?.name}</span>
                  {r.place && <span>/ {r.place}</span>}
                </div>
                {r.involved && <p className="mt-1 text-xs text-zinc-500">対象: {r.involved}</p>}
                <p className="mt-1.5 whitespace-pre-wrap text-sm">{r.body}</p>
                {r.action_taken && (
                  <p className="mt-1.5 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-[13px] text-zinc-600">
                    対応: {r.action_taken}
                  </p>
                )}
                {r.resolution_note && (
                  <p className="mt-1.5 whitespace-pre-wrap rounded bg-emerald-50 p-2 text-[13px] text-emerald-700">
                    決着: {r.resolution_note}
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">
                    報告: {(r.staff as unknown as { name: string } | null)?.name}
                  </span>
                  <IncidentItem id={r.id} resolved={r.status === "resolved"} />
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
