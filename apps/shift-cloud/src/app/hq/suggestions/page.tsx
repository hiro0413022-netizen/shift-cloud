import { requireActor, can } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Card, Badge, Button, Empty } from "@/components/ui";
import { decideSuggestion } from "./actions";

const SEV: Record<string, { label: string; color: "blue" | "amber" | "red" }> = {
  info: { label: "情報", color: "blue" },
  warning: { label: "警告", color: "amber" },
  critical: { label: "重要", color: "red" },
};

export default async function SuggestionsPage() {
  const actor = await requireActor("view_hq");
  const admin = createAdmin();
  const { data: suggestions } = await admin
    .from("ai_suggestions")
    .select("*, stores(name), staff:staff!ai_suggestions_staff_id_fkey(name)")
    .eq("company_id", actor.companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  const canApprove = can(actor, "approve_suggestions");

  return (
    <>
      <h1 className="mb-6 text-xl font-semibold tracking-tight">AI提案</h1>
      {!suggestions?.length ? (
        <Empty>提案はありません。ダッシュボードから「AIチェックを実行」で生成できます。</Empty>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => {
            const sev = SEV[s.severity] ?? SEV.info;
            return (
              <Card key={s.id} className="!p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color={sev.color}>{sev.label}</Badge>
                      <p className="font-medium">{s.title}</p>
                    </div>
                    {s.body && <p className="mt-1 text-sm text-zinc-500">{s.body}</p>}
                    <p className="mt-1 text-xs text-zinc-400">
                      {(s.stores as unknown as { name: string } | null)?.name ?? "全店"}
                      {(s.staff as unknown as { name: string } | null)?.name ? ` ・ ${(s.staff as unknown as { name: string }).name}` : ""}
                      {" ・ "}
                      {new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(s.created_at))}
                      {" ・ 生成元: "}{s.source}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.approval_status === "pending" && canApprove ? (
                      <>
                        <form action={decideSuggestion}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="decision" value="approved" />
                          <Button type="submit" className="!py-1.5">承認</Button>
                        </form>
                        <form action={decideSuggestion}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="decision" value="rejected" />
                          <Button type="submit" variant="secondary" className="!py-1.5">却下</Button>
                        </form>
                      </>
                    ) : (
                      <Badge color={s.approval_status === "approved" ? "green" : s.approval_status === "rejected" ? "zinc" : "amber"}>
                        {s.approval_status === "approved" ? "承認済み" : s.approval_status === "rejected" ? "却下" : "未対応"}
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
