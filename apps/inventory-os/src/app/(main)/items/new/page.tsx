import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel } from "@/components/ui";
import { NewItemForm, NewCodeForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  const actor = await requireManager();
  const admin = createAdmin();
  const [{ data: codes }, { data: locs }] = await Promise.all([
    admin
      .from("inv_codes")
      .select("kind, name, abbr")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("sort_order"),
    admin
      .from("inv_items")
      .select("location1")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .not("location1", "is", null),
  ]);

  const rows = (codes ?? []) as Array<{ kind: string; name: string; abbr: string }>;
  const categories = rows.filter((r) => r.kind === "category");
  const makers = rows.filter((r) => r.kind === "maker");
  const locations = [...new Set((locs ?? []).map((l) => (l as { location1: string }).location1))].sort();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">新しい品番を登録</h1>
          <p className="text-sm text-(--color-dim)">管理番号は品目・メーカーから自動で採番されます</p>
        </div>
        <Link href="/items" className="text-sm text-(--color-dim) underline underline-offset-2">
          ← 品番マスタ
        </Link>
      </header>

      <Panel title="商品情報">
        <NewItemForm categories={categories} makers={makers} locations={locations} />
      </Panel>

      <Panel title="コード表に品目・メーカーを追加">
        <p className="mb-3 text-xs text-(--color-dim)">
          はじめて扱う品目やメーカーは、先にここで略号を決めてください。既存と重複する略号は登録できません
        </p>
        <NewCodeForm />
      </Panel>
    </div>
  );
}
