import { notFound } from "next/navigation";
import { getPro, listInstagram } from "@/lib/data";
import { AdminTitle, DeleteButton, Msg } from "@/components/admin-ui";
import { addInstagramAction, deleteInstagramAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminInstagram({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const posts = await listInstagram(pro.id);

  return (
    <div>
      <AdminTitle slug={slug} title="Instagram" hint="投稿のリンクを貼るだけでHPのINSTAGRAM欄に表示されます（新しい順・最大4件がトップに表示）。" />
      <Msg ok={sp.ok} err={sp.err} />

      <div className="mb-6 rounded-xl border border-(--color-line) bg-white p-4">
        <p className="mb-2 font-black">＋ 投稿を追加</p>
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-(--color-dim)">
          <li>Instagramアプリで載せたい投稿を開く</li>
          <li>右上の「…」→「リンクをコピー」</li>
          <li>下の欄に貼り付けて「追加」を押す</li>
        </ol>
        <form action={addInstagramAction} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <input name="post_url" type="url" required placeholder="https://www.instagram.com/p/..." className="adm-input" />
          <button type="submit" className="adm-btn bg-(--color-ink) text-white">追加する</button>
        </form>
      </div>

      <p className="mb-2 text-sm font-bold">表示中の投稿</p>
      <div className="space-y-2">
        {posts.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-(--color-line) bg-white p-4">
            <a href={p.post_url} target="_blank" rel="noopener noreferrer" className="truncate text-sm text-(--color-gold) underline underline-offset-4">
              {p.post_url}
            </a>
            <form action={deleteInstagramAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={p.id} />
              <DeleteButton label="外す" />
            </form>
          </div>
        ))}
        {posts.length === 0 ? <p className="text-sm text-(--color-dim)">まだ投稿が登録されていません。</p> : null}
      </div>
    </div>
  );
}
