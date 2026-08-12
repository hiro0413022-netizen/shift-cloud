import Link from "next/link";
import { requireInventoryActor } from "@/lib/auth";
import { MOVEMENT_LABEL, listMovements, storeScopeOf, scopeLabel } from "@/lib/inventory";
import { Panel, Badge, Empty } from "@/components/ui";
import { MovementForm } from "./form";
import { deleteMovement } from "./actions";

export const dynamic = "force-dynamic";

export default async function MovementsPage() {
  const actor = await requireInventoryActor();
  // 入出庫の履歴も自店舗だけ（#134。以前は companyId だけで両店合算だった）
  const rows = await listMovements(actor.companyId, storeScopeOf(actor), 120);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          入出庫
          <Badge tone={actor.isOwner ? "ok" : "default"}>{scopeLabel(actor)}</Badge>
        </h1>
        <p className="text-sm text-(--color-dim)">
          入荷・販売・工房使用・破損を記録すると、次の棚卸まで理論在庫が自動で追従します
        </p>
      </header>

      {actor.canManage && (
        <Panel title="入出庫を記録">
          <MovementForm />
        </Panel>
      )}

      <Panel title="最近の入出庫">
        {rows.length === 0 ? (
          <Empty>
            まだ記録がありません。入荷や販売を記録しはじめると「なぜ在庫が減ったか」が追えるようになります
          </Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-(--color-dim)">{r.occurred_on}</span>{" "}
                  <Badge tone={r.qty > 0 ? "ok" : "warn"}>{MOVEMENT_LABEL[r.kind]}</Badge>{" "}
                  <span className="text-(--color-dim)">{r.inv_items?.code}</span> {r.inv_items?.name}
                  {r.memo && <span className="ml-2 text-xs text-(--color-dim)">{r.memo}</span>}
                  {r.source_app && r.source_app !== "inventory-os" && (
                    <span className="ml-2 text-xs text-(--color-dim)">［{r.source_app} 連携］</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className={`tabular-nums ${r.qty > 0 ? "text-(--color-ok)" : "text-(--color-danger)"}`}>
                    {r.qty > 0 ? `+${r.qty}` : r.qty}
                    <span className="ml-0.5 text-xs text-(--color-dim)">{r.inv_items?.unit}</span>
                  </span>
                  {actor.canManage && r.kind !== "adjust" && (
                    <form action={deleteMovement}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs text-(--color-dim) hover:text-(--color-danger)">取消</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-(--color-dim)">
          「棚卸調整」は棚卸の確定時にシステムが起票した差異です。取り消せません（
          <Link href="/count" className="underline underline-offset-2">
            棚卸
          </Link>
          からやり直してください）
        </p>
      </Panel>
    </div>
  );
}
