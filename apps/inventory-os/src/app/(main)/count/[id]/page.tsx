import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInventoryActor } from "@/lib/auth";
import {
  getSession,
  listStock,
  listCounts,
  lastClosedQty,
  yen,
  storeScopeOf,
  scopeOfStore,
} from "@/lib/inventory";
import { Panel, Badge } from "@/components/ui";
import { CountSheet, type SheetItem } from "./count-sheet";
import { fillUnchanged, closeCount } from "../actions";

export const dynamic = "force-dynamic";

export default async function CountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireInventoryActor();
  // URL直打ちで他店舗の棚卸を開けないようにスコープを渡す（#134）
  const session = await getSession(actor.companyId, id, storeScopeOf(actor));
  if (!session) notFound();

  const [stock, counts, prev] = await Promise.all([
    listStock(actor.companyId, { scope: scopeOfStore(session.store_id) }),
    listCounts(session.id),
    lastClosedQty(actor.companyId, session.store_id, session.counted_on),
  ]);

  const closed = session.status === "closed";

  // 確定済みの棚卸は、そのとき数えた品番だけを見せる（あとから増えた品番を混ぜない）
  const source = closed ? stock.filter((s) => counts.has(s.item_id)) : stock;

  const items: SheetItem[] = source.map((s) => ({
    itemId: s.item_id,
    code: s.code,
    name: s.name,
    variant: s.variant,
    unit: s.unit,
    location: s.location1 ?? "（保管場所 未設定）",
    location2: s.location2,
    prev: prev.get(s.item_id) ?? null,
    current: counts.get(s.item_id)?.qty ?? null,
  }));

  const filled = items.filter((i) => i.current != null).length;
  const unfilled = items.length - filled;
  const totalQty = [...counts.values()].reduce((a, c) => a + c.qty, 0);
  const totalValue = source.reduce((a, s) => a + (counts.get(s.item_id)?.qty ?? 0) * (s.cost_price ?? 0), 0);
  const diffs = [...counts.values()].filter((c) => c.diff != null && c.diff !== 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-28">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{session.label ?? session.counted_on}</h1>
            <Badge tone={closed ? "ok" : "warn"}>{closed ? "確定" : "入力中"}</Badge>
          </div>
          <p className="text-sm text-(--color-dim)">基準日 {session.counted_on}</p>
        </div>
        <Link href="/count" className="text-sm text-(--color-dim) underline underline-offset-2">
          ← 棚卸一覧
        </Link>
      </header>

      {session.note && (
        <p className="rounded-lg border border-(--color-line) bg-(--color-panel) px-3 py-2 text-xs text-(--color-dim)">
          {session.note}
        </p>
      )}

      {closed && diffs.length > 0 && (
        <Panel title={`理論在庫との差異（${diffs.length}件）`}>
          <p className="mb-2 text-xs text-(--color-dim)">
            差の分は入出庫台帳に「棚卸調整」として記録済みです。以降の理論在庫はこの実地数量からの積み上げになります
          </p>
          <ul className="divide-y divide-(--color-line)">
            {source
              .filter((s) => {
                const c = counts.get(s.item_id);
                return c != null && c.diff != null && c.diff !== 0;
              })
              .slice(0, 40)
              .map((s) => {
                const c = counts.get(s.item_id)!;
                return (
                  <li key={s.item_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="text-(--color-dim)">{s.code}</span> {s.name}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      理論 {c.theoretical} → 実地 {c.qty}
                      <span className={c.diff! > 0 ? "ml-2 text-(--color-ok)" : "ml-2 text-(--color-danger)"}>
                        {c.diff! > 0 ? `+${c.diff}` : c.diff}
                      </span>
                    </span>
                  </li>
                );
              })}
          </ul>
        </Panel>
      )}

      <CountSheet sessionId={session.id} items={items} readOnly={closed} />

      {/* 操作バーは画面下に固定。iPadで棚の前に立ったまま押せる位置に置く */}
      {!closed && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-(--color-line) bg-(--color-panel)/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="tabular-nums">
                {filled} / {items.length} 品番
              </span>
              <span className="ml-3 text-(--color-dim) tabular-nums">
                {totalQty}点 / {yen(totalValue)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {unfilled > 0 && (
                <form action={fillUnchanged}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button className="rounded-lg border border-(--color-line) px-4 py-3 text-sm">
                    残り{unfilled}件を「前回と同じ」で埋める
                  </button>
                </form>
              )}
              {actor.canManage ? (
                <form action={closeCount}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <button
                    disabled={filled === 0}
                    className="rounded-lg bg-(--color-accent) px-5 py-3 text-sm font-bold text-black disabled:opacity-40"
                  >
                    棚卸を確定する
                  </button>
                </form>
              ) : (
                <span className="text-xs text-(--color-dim)">確定は在庫管理者が行います</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
