import { notFound } from "next/navigation";
import { getPro, listSponsors } from "@/lib/data";
import { AdminTitle, DeleteButton, Msg } from "@/components/admin-ui";
import { addSponsorAction, deleteSponsorAction, updateSponsorAction } from "../actions";

export const dynamic = "force-dynamic";

const SIZE_LABEL: Record<string, string> = { large: "大（1列・横長ロゴ向き）", medium: "中（2列）", small: "小（3列・正方形ロゴ向き）" };

function SizeSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="size" defaultValue={defaultValue ?? "medium"} className="adm-input">
      <option value="large">{SIZE_LABEL.large}</option>
      <option value="medium">{SIZE_LABEL.medium}</option>
      <option value="small">{SIZE_LABEL.small}</option>
    </select>
  );
}

export default async function AdminSponsors({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const sponsors = await listSponsors(pro.id);

  return (
    <div>
      <AdminTitle slug={slug} title="スポンサー" hint="バナー画像を登録するとHPのSPONSOR欄に表示されます。横長・正方形などサイズが違っても自動できれいに並びます。" />
      <Msg ok={sp.ok} err={sp.err} />

      <div className="mb-8 rounded-xl border border-(--color-line) bg-white p-4">
        <p className="mb-3 font-black">＋ スポンサーを追加</p>
        <form action={addSponsorAction} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <div>
            <label className="mb-1 block text-xs font-bold">スポンサー名（必須）</label>
            <input name="name" required placeholder="例: 株式会社◯◯" className="adm-input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">バナー画像（必須・5MBまで）</label>
            <input type="file" name="image" accept="image/*" required className="adm-input" />
            <p className="mt-1 text-[11px] text-(--color-dim)">スマホの写真フォルダから選べます。PNG / JPG どちらでもOK。</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold">表示サイズ</label>
              <SizeSelect />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">並び順（小さいほど上）</label>
              <input name="sort" type="number" placeholder="100" className="adm-input" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">リンク先URL（任意）</label>
            <input name="link_url" type="url" placeholder="https://...（スポンサーのHPなど）" className="adm-input" />
          </div>
          <button type="submit" className="adm-btn bg-(--color-ink) text-white">アップロードして表示する</button>
        </form>
      </div>

      <p className="mb-2 text-sm font-bold">表示中のスポンサー（タップで編集）</p>
      <div className="space-y-2">
        {sponsors.map((b) => (
          <details key={b.id} className="rounded-xl border border-(--color-line) bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.image_url} alt={b.name} className="h-10 w-20 shrink-0 rounded-md border border-(--color-line) bg-white object-contain" />
              <span className="font-bold">{b.name}</span>
              <span className="ml-auto shrink-0 text-[10px] text-(--color-dim)">{SIZE_LABEL[b.size]?.split("（")[0]}</span>
            </summary>
            <div className="border-t border-(--color-line) p-4">
              <form action={updateSponsorAction} className="space-y-3">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={b.id} />
                <input name="name" required defaultValue={b.name} className="adm-input" />
                <div className="grid grid-cols-2 gap-3">
                  <SizeSelect defaultValue={b.size} />
                  <input name="sort" type="number" defaultValue={b.sort} className="adm-input" />
                </div>
                <input name="link_url" type="url" defaultValue={b.link_url ?? ""} placeholder="リンク先URL（任意）" className="adm-input" />
                <button type="submit" className="adm-btn bg-(--color-ink) text-white">更新する</button>
              </form>
              <p className="mt-2 text-[11px] text-(--color-dim)">画像を差し替えたい場合は、一度削除して新しく追加してください。</p>
              <form action={deleteSponsorAction} className="mt-3 text-right">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={b.id} />
                <DeleteButton label="このバナーを削除" />
              </form>
            </div>
          </details>
        ))}
        {sponsors.length === 0 ? <p className="text-sm text-(--color-dim)">まだスポンサーが登録されていません。</p> : null}
      </div>
    </div>
  );
}
