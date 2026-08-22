import { notFound } from "next/navigation";
import { getPro, listCareer } from "@/lib/data";
import { AdminTitle, DeleteButton, Msg } from "@/components/admin-ui";
import { deleteCareerAction, saveCareerAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminCareer({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const rows = await listCareer(pro.id);

  return (
    <div>
      <AdminTitle slug={slug} title="主な戦歴" hint="PROFILEページの戦歴表を編集します。上から表示したい順に「並び順」の数字を小さくしてください。" />
      <Msg ok={sp.ok} err={sp.err} />

      <div className="mb-8 rounded-xl border border-(--color-line) bg-white p-4">
        <p className="mb-3 font-black">＋ 戦歴を追加</p>
        <form action={saveCareerAction} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <div className="grid grid-cols-2 gap-3">
            <input name="season" placeholder="年度（例: 2026）" className="adm-input" />
            <input name="result" placeholder="成績（例: 優勝 / 3位T）" className="adm-input" />
          </div>
          <input name="event" required placeholder="競技名（必須）" className="adm-input" />
          <div className="grid grid-cols-2 gap-3">
            <input name="note" placeholder="備考（任意）" className="adm-input" />
            <input name="sort" type="number" placeholder="並び順（小さいほど上）" className="adm-input" />
          </div>
          <button type="submit" className="adm-btn bg-(--color-ink) text-white">追加する</button>
        </form>
      </div>

      <p className="mb-2 text-sm font-bold">登録済みの戦歴（タップで編集）</p>
      <div className="space-y-2">
        {rows.map((c) => (
          <details key={c.id} className="rounded-xl border border-(--color-line) bg-white">
            <summary className="cursor-pointer list-none p-4">
              <span className="mr-2 text-xs text-(--color-dim)">{c.season}</span>
              <span className="mr-2 font-bold">{c.event}</span>
              <span className="text-sm text-(--color-gold)">{c.result}</span>
            </summary>
            <div className="border-t border-(--color-line) p-4">
              <form action={saveCareerAction} className="space-y-3">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={c.id} />
                <div className="grid grid-cols-2 gap-3">
                  <input name="season" defaultValue={c.season ?? ""} placeholder="年度" className="adm-input" />
                  <input name="result" defaultValue={c.result ?? ""} placeholder="成績" className="adm-input" />
                </div>
                <input name="event" required defaultValue={c.event} className="adm-input" />
                <div className="grid grid-cols-2 gap-3">
                  <input name="note" defaultValue={c.note ?? ""} placeholder="備考" className="adm-input" />
                  <input name="sort" type="number" defaultValue={c.sort} className="adm-input" />
                </div>
                <button type="submit" className="adm-btn bg-(--color-ink) text-white">更新する</button>
              </form>
              <form action={deleteCareerAction} className="mt-3 text-right">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={c.id} />
                <DeleteButton label="この行を削除" />
              </form>
            </div>
          </details>
        ))}
        {rows.length === 0 ? <p className="text-sm text-(--color-dim)">まだ戦歴がありません。</p> : null}
      </div>
    </div>
  );
}
