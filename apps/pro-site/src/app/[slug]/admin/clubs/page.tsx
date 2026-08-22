import { notFound } from "next/navigation";
import { getPro, listClubs } from "@/lib/data";
import { AdminTitle, DeleteButton, Msg } from "@/components/admin-ui";
import { deleteClubAction, saveClubAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminClubs({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const rows = await listClubs(pro.id);

  return (
    <div>
      <AdminTitle slug={slug} title="クラブセッティング" hint="PROFILEページのクラブ一覧を編集します。" />
      <Msg ok={sp.ok} err={sp.err} />

      <div className="mb-8 rounded-xl border border-(--color-line) bg-white p-4">
        <p className="mb-3 font-black">＋ クラブを追加</p>
        <form action={saveClubAction} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <div className="grid grid-cols-2 gap-3">
            <input name="category" required placeholder="種類（例: ドライバー）" className="adm-input" />
            <input name="sort" type="number" placeholder="並び順" className="adm-input" />
          </div>
          <input name="item" required placeholder="モデル名（例: ◯◯ 10.5°）" className="adm-input" />
          <button type="submit" className="adm-btn bg-(--color-ink) text-white">追加する</button>
        </form>
      </div>

      <p className="mb-2 text-sm font-bold">登録済み（タップで編集）</p>
      <div className="space-y-2">
        {rows.map((c) => (
          <details key={c.id} className="rounded-xl border border-(--color-line) bg-white">
            <summary className="cursor-pointer list-none p-4">
              <span className="mr-2 font-bold">{c.category}</span>
              <span className="text-sm text-(--color-dim)">{c.item}</span>
            </summary>
            <div className="border-t border-(--color-line) p-4">
              <form action={saveClubAction} className="space-y-3">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={c.id} />
                <div className="grid grid-cols-2 gap-3">
                  <input name="category" required defaultValue={c.category} className="adm-input" />
                  <input name="sort" type="number" defaultValue={c.sort} className="adm-input" />
                </div>
                <input name="item" required defaultValue={c.item} className="adm-input" />
                <button type="submit" className="adm-btn bg-(--color-ink) text-white">更新する</button>
              </form>
              <form action={deleteClubAction} className="mt-3 text-right">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={c.id} />
                <DeleteButton label="この行を削除" />
              </form>
            </div>
          </details>
        ))}
        {rows.length === 0 ? <p className="text-sm text-(--color-dim)">まだ登録がありません。</p> : null}
      </div>
    </div>
  );
}
