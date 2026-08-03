import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore } from "@/lib/money";
import { Panel, Empty, Badge, inputCls, btnCls } from "@/components/ui";
import { addPro, toggleProActive, updateProOrder, deletePro } from "./actions";

export const dynamic = "force-dynamic";

type Pro = { id: string; name: string; sort_order: number; active: boolean };

export default async function SettingsPage() {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);

  const { data } = store
    ? await admin.from("mon_pros")
        .select("id, name, sort_order, active")
        .eq("company_id", actor.companyId).eq("store_id", store.id)
        .is("deleted_at", null)
        .order("sort_order").order("name")
    : { data: [] };
  const pros = (data ?? []) as Pro[];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">設定 — {store?.name ?? "店舗未選択"}</h1>
        <p className="text-sm text-(--color-dim)">店舗ごとの担当プロを管理します。売上入力の「担当プロ」の選択肢になります</p>
      </header>

      <Panel title="担当プロを追加">
        {!store ? (
          <Empty>店舗が選択されていません。上部の店舗切替で選んでください</Empty>
        ) : (
          <form action={addPro} className="flex flex-wrap items-center gap-2">
            <input name="name" placeholder="名前（例: 山田プロ）" required className={`${inputCls} max-w-60`} />
            <input name="sort_order" inputMode="numeric" placeholder="並び順(小=上)" className={`${inputCls} max-w-32`} />
            <button className={btnCls}>追加</button>
          </form>
        )}
      </Panel>

      <Panel title={`担当プロ（${pros.length}名）`}>
        {pros.length === 0 ? (
          <Empty>まだ登録がありません。上のフォームから追加してください</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
                <th className="py-2 pr-2 text-left font-medium">名前</th>
                <th className="px-2 py-2 text-left font-medium">状態</th>
                <th className="px-2 py-2 text-left font-medium">並び順</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pros.map((p) => (
                <tr key={p.id} className="border-b border-(--color-line)">
                  <td className="py-2 pr-2 font-medium">{p.name}</td>
                  <td className="px-2 py-2">
                    <Badge tone={p.active ? "ok" : "dim"}>{p.active ? "有効" : "無効"}</Badge>
                  </td>
                  <td className="px-2 py-2">
                    <form action={updateProOrder} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="sort_order" defaultValue={p.sort_order} inputMode="numeric" className={`${inputCls} w-20 py-1`} />
                      <button className="text-xs text-(--color-dim) hover:text-(--color-gold)">保存</button>
                    </form>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <form action={toggleProActive}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="active" value={String(!p.active)} />
                        <button className="text-xs text-(--color-dim) hover:text-(--color-gold)">
                          {p.active ? "無効にする" : "有効に戻す"}
                        </button>
                      </form>
                      <form action={deletePro}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="text-xs text-(--color-dim) hover:text-(--color-accent)">削除</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-(--color-dim)">
          無効＝退任など。新しい売上の選択肢から外れますが、過去の明細はそのまま残ります。
        </p>
      </Panel>
    </div>
  );
}
