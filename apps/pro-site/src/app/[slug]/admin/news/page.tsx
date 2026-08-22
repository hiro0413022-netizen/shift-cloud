import { notFound } from "next/navigation";
import { getPro, listNews } from "@/lib/data";
import { fmtDateJa, todayJst } from "@/lib/jst";
import { AdminTitle, DeleteButton, Msg } from "@/components/admin-ui";
import { deleteNewsAction, saveNewsAction } from "../actions";

export const dynamic = "force-dynamic";

function NewsForm({ slug, item }: { slug: string; item?: { id: string; kind: string; category: string; title: string; body: string | null; link_url: string | null; published_at: string } }) {
  return (
    <form action={saveNewsAction} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-bold">日付</label>
          <input type="date" name="published_at" defaultValue={item?.published_at ?? todayJst()} className="adm-input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold">種類</label>
          <select name="kind" defaultValue={item?.kind ?? "news"} className="adm-input">
            <option value="news">ニュース</option>
            <option value="media">メディア出演</option>
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">カテゴリ</label>
        <input name="category" defaultValue={item?.category ?? ""} placeholder="例: ツアー / お知らせ / TV出演" className="adm-input" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">タイトル（必須）</label>
        <input name="title" required defaultValue={item?.title ?? ""} placeholder="例: ◯◯オープンに出場します" className="adm-input" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">本文</label>
        <textarea name="body" rows={5} defaultValue={item?.body ?? ""} placeholder="本文を入力（改行もそのまま表示されます）" className="adm-input" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold">関連リンク（任意）</label>
        <input name="link_url" type="url" defaultValue={item?.link_url ?? ""} placeholder="https://..." className="adm-input" />
      </div>
      <button type="submit" className="adm-btn bg-(--color-ink) text-white">{item ? "更新する" : "この内容で公開する"}</button>
    </form>
  );
}

export default async function AdminNews({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const [news, media] = await Promise.all([listNews(pro.id, "news"), listNews(pro.id, "media")]);
  const all = [...news, ...media].sort((a, b) => (a.published_at < b.published_at ? 1 : -1));

  return (
    <div>
      <AdminTitle slug={slug} title="ニュースを書く" hint="保存するとすぐHPのNEWS欄に表示されます。" />
      <Msg ok={sp.ok} err={sp.err} />

      <div className="mb-8 rounded-xl border border-(--color-line) bg-white p-4">
        <p className="mb-3 font-black">＋ 新しいニュースを追加</p>
        <NewsForm slug={slug} />
      </div>

      <p className="mb-2 text-sm font-bold">これまでのニュース（タップで編集）</p>
      <div className="space-y-2">
        {all.map((n) => (
          <details key={n.id} className="rounded-xl border border-(--color-line) bg-white">
            <summary className="cursor-pointer list-none p-4">
              <span className="mr-2 text-xs text-(--color-dim)">{fmtDateJa(n.published_at)}</span>
              <span className="mr-2 rounded-sm border border-(--color-line) px-1.5 py-0.5 text-[10px] text-(--color-dim)">{n.kind === "media" ? "メディア" : n.category}</span>
              <span className="font-bold">{n.title}</span>
            </summary>
            <div className="border-t border-(--color-line) p-4">
              <NewsForm slug={slug} item={n} />
              <form action={deleteNewsAction} className="mt-3 text-right">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={n.id} />
                <DeleteButton label="このニュースを削除" />
              </form>
            </div>
          </details>
        ))}
        {all.length === 0 ? <p className="text-sm text-(--color-dim)">まだニュースがありません。</p> : null}
      </div>
    </div>
  );
}
