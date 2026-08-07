import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { isVaultUnlocked } from "@/lib/vault";
import { Panel, Badge, Empty, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { UnlockForm, SecretCell } from "./vault-ui";
import { saveSystem, deleteSystem, lockVault } from "./actions";
import { VAULT_CATEGORIES, groupByCategory, normalizeCategory } from "@/lib/vault-categories";

export const dynamic = "force-dynamic";

type VaultRow = {
  id: string;
  name: string;
  category: string;
  url: string | null;
  login_id: string | null;
  password: string | null;
  notes: string | null;
  sort_order: number;
};

function SystemForm({ row }: { row?: VaultRow }) {
  return (
    <form action={saveSystem} className="grid grid-cols-2 gap-2 rounded-lg bg-(--color-panel-2) p-3 text-sm">
      {row && <input type="hidden" name="id" value={row.id} />}
      <input name="name" placeholder="システム名 *" defaultValue={row?.name} className={inputCls} required />
      <select name="category" defaultValue={row?.category ?? "other"} className={inputCls}>
        {Object.entries(VAULT_CATEGORIES).map(([v, label]) => (
          <option key={v} value={v}>{label}</option>
        ))}
      </select>
      <input name="url" placeholder="URL" defaultValue={row?.url ?? ""} className={`${inputCls} col-span-2`} />
      <input name="login_id" placeholder="ログインID / メール" defaultValue={row?.login_id ?? ""} className={inputCls} />
      <input
        name="password"
        placeholder={row ? "パスワード（空=変更なし、-=削除）" : "パスワード"}
        className={inputCls}
        autoComplete="off"
      />
      <input name="notes" placeholder="メモ" defaultValue={row?.notes ?? ""} className={inputCls} />
      <input name="sort_order" type="number" placeholder="表示順" defaultValue={row?.sort_order ?? 100} className={inputCls} />
      <div className="col-span-2 flex gap-2">
        <button className={btnCls}>{row ? "更新" : "追加"}</button>
      </div>
    </form>
  );
}

export default async function VaultPage() {
  await requireGenesisActor();

  if (!(await isVaultUnlocked())) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Vault — システム台帳</h1>
        <UnlockForm />
      </div>
    );
  }

  const admin = createAdmin();
  const { data } = await admin
    .from("vault_systems")
    .select("id, name, category, url, login_id, password, notes, sort_order")
    .is("deleted_at", null)
    .order("sort_order")
    .order("name");
  const rows = (data ?? []) as VaultRow[];
  // 未知のカテゴリでも必ずどこかに出す（分類漏れで台帳から消えるのを防ぐ・2026-08-07の実障害）
  const grouped = groupByCategory(rows);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Vault — システム台帳</h1>
        <form action={lockVault}>
          <button className={btnGhostCls}>🔒 ロックする</button>
        </form>
      </div>
      <p className="text-xs text-(--color-dim)">
        全関連システムのURL・ログイン情報を一元管理（{rows.length}件）。新しいシステムは下の「追加」フォームか、AIに依頼すれば自動で登録されます。
      </p>

      {grouped.length === 0 && <Empty>まだ登録がありません</Empty>}

      {grouped.map(({ cat, label, items }) => (
        <Panel key={cat} title={label}>
          <div className="flex flex-col divide-y divide-(--color-line)">
            {items.map((row) => (
              <div key={row.id} className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">{row.name}</span>
                  <Badge>{VAULT_CATEGORIES[normalizeCategory(row.category)]}</Badge>
                  {row.url && (
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-sky-300 underline underline-offset-2"
                    >
                      {row.url} ↗
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <span>
                    <span className="text-xs text-(--color-dim)">ID: </span>
                    {row.login_id ?? <span className="text-(--color-dim)">—</span>}
                  </span>
                  <span>
                    <span className="text-xs text-(--color-dim)">PW: </span>
                    <SecretCell value={row.password} />
                  </span>
                  {row.notes && <span className="text-xs text-(--color-dim)">{row.notes}</span>}
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-(--color-dim) hover:text-(--color-txt)">
                    編集 / 削除
                  </summary>
                  <div className="mt-2 flex flex-col gap-2">
                    <SystemForm row={row} />
                    <form action={deleteSystem}>
                      <input type="hidden" name="id" value={row.id} />
                      <button className={`${btnGhostCls} text-red-400`}>この登録を削除</button>
                    </form>
                  </div>
                </details>
              </div>
            ))}
          </div>
        </Panel>
      ))}

      <Panel title="新規追加">
        <SystemForm />
      </Panel>
    </div>
  );
}
