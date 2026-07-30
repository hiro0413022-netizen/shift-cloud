import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInventoryActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { yen, MOVEMENT_LABEL, type MovementKind, type Stock } from "@/lib/inventory";
import { Panel, Badge, Empty, Field, inputCls, btnCls } from "@/components/ui";
import { updateItem } from "../actions";

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const actor = await requireInventoryActor();
  const admin = createAdmin();

  const { data: stock } = await admin
    .from("inv_stock")
    .select("*")
    .eq("company_id", actor.companyId)
    .eq("item_id", id)
    .maybeSingle();
  if (!stock) notFound();
  const s = stock as Stock;

  const [{ data: movs }, { data: hist }] = await Promise.all([
    admin
      .from("inv_movements")
      .select("id, occurred_on, kind, qty, memo, source_app")
      .eq("item_id", id)
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false })
      .limit(30),
    admin
      .from("inv_counts")
      .select("qty, theoretical, diff, counted_by_name, inv_count_sessions(counted_on, status)")
      .eq("item_id", id)
      .order("counted_at", { ascending: false })
      .limit(12),
  ]);

  const { data: notes } = await admin.from("inv_items").select("notes").eq("id", id).maybeSingle();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{s.name}</h1>
            {s.status === "discontinued" && <Badge>廃番</Badge>}
          </div>
          <p className="text-sm text-(--color-dim)">
            {s.code} / {s.category} / {s.maker}
            {s.variant && ` / ${s.variant}`}
          </p>
        </div>
        <Link href="/items" className="text-sm text-(--color-dim) underline underline-offset-2">
          ← 品番マスタ
        </Link>
      </header>

      {saved && <p className="rounded-lg bg-(--color-ok)/10 px-3 py-2 text-sm text-(--color-ok)">保存しました</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kv label="理論在庫" value={`${s.qty} ${s.unit}`} />
        <Kv label="起点の棚卸" value={s.base_on ? `${s.base_on}（${s.base_qty}）` : "棚卸なし"} />
        <Kv label="以降の増減" value={s.delta_since === 0 ? "±0" : s.delta_since > 0 ? `+${s.delta_since}` : `${s.delta_since}`} />
        <Kv label="在庫金額" value={yen(s.value)} />
      </div>

      <Panel title="入出庫の履歴">
        {(movs ?? []).length === 0 ? (
          <Empty>まだ入出庫の記録がありません（棚卸だけで管理されています）</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {(movs ?? []).map((m) => {
              const r = m as { id: string; occurred_on: string; kind: MovementKind; qty: number; memo: string | null; source_app: string | null };
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="text-(--color-dim)">{r.occurred_on}</span>{" "}
                    <Badge tone={r.qty > 0 ? "ok" : "warn"}>{MOVEMENT_LABEL[r.kind]}</Badge>{" "}
                    <span className="text-(--color-dim)">{r.memo}</span>
                  </span>
                  <span className={`shrink-0 tabular-nums ${r.qty > 0 ? "text-(--color-ok)" : "text-(--color-danger)"}`}>
                    {r.qty > 0 ? `+${r.qty}` : r.qty}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="棚卸の推移">
        {(hist ?? []).length === 0 ? (
          <Empty>棚卸の記録がありません</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {(hist ?? []).map((h, i) => {
              const r = h as unknown as {
                qty: number;
                theoretical: number | null;
                diff: number | null;
                counted_by_name: string | null;
                inv_count_sessions: { counted_on: string; status: string } | null;
              };
              return (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-(--color-dim)">
                    {r.inv_count_sessions?.counted_on ?? "—"}
                    {r.counted_by_name && ` / ${r.counted_by_name}`}
                  </span>
                  <span className="tabular-nums">
                    {r.qty} {s.unit}
                    {r.diff != null && r.diff !== 0 && (
                      <span className={r.diff > 0 ? "ml-2 text-(--color-ok)" : "ml-2 text-(--color-danger)"}>
                        （理論 {r.theoretical} との差 {r.diff > 0 ? `+${r.diff}` : r.diff}）
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {actor.canManage && (
        <Panel title="品番の編集">
          <form action={updateItem} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <Field label="商品名">
              <input name="name" defaultValue={s.name} className={inputCls} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="仕様">
                <input name="spec" defaultValue={s.spec ?? ""} className={inputCls} />
              </Field>
              <Field label="カラー・仕様">
                <input name="variant" defaultValue={s.variant ?? ""} className={inputCls} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="単位">
                <select name="unit" defaultValue={s.unit} className={inputCls}>
                  {["個", "本", "枚", "ダース", "箱"].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
              <Field label="定価（税抜）">
                <input name="listPrice" type="number" min={0} defaultValue={s.list_price ?? ""} className={inputCls} />
              </Field>
              <Field label="仕入単価">
                <input name="costPrice" type="number" min={0} defaultValue={s.cost_price ?? ""} className={inputCls} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="保管場所１">
                <input name="location1" defaultValue={s.location1 ?? ""} className={inputCls} />
              </Field>
              <Field label="保管場所２">
                <input name="location2" defaultValue={s.location2 ?? ""} className={inputCls} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="適正在庫">
                <input name="reorderPoint" type="number" min={0} defaultValue={s.reorder_point ?? ""} className={inputCls} />
              </Field>
              <Field label="状態">
                <select name="status" defaultValue={s.status} className={inputCls}>
                  <option value="active">取扱中</option>
                  <option value="discontinued">廃番（棚卸に出さない）</option>
                </select>
              </Field>
            </div>
            <Field label="備考">
              <input name="notes" defaultValue={(notes as { notes: string | null } | null)?.notes ?? ""} className={inputCls} />
            </Field>
            <button className={btnCls}>保存する</button>
          </form>
        </Panel>
      )}
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3">
      <p className="text-xs text-(--color-dim)">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
