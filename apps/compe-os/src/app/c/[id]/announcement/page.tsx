import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getComp, listGroups } from "@/lib/compe";
import { CompNav } from "@/components/nav";
import { btnCls, cardCls, inputCls, labelCls } from "@/components/ui";
import { saveAnnouncement } from "../actions";

export default async function AnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();
  const groups = await listGroups(id);

  return (
    <>
      <CompNav compId={id} active="announcement" />
      <section className={`${cardCls} mb-5`}>
        <h2 className="mb-4 text-sm font-bold">案内文の文面</h2>
        <form action={saveAnnouncement} className="space-y-4">
          <input type="hidden" name="comp_id" value={id} />
          <label className="block">
            <span className={labelCls}>挨拶文（冒頭）</span>
            <textarea name="ann_greeting" rows={5} defaultValue={comp.ann_greeting ?? ""} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>締めの文</span>
            <textarea name="ann_closing" rows={3} defaultValue={comp.ann_closing ?? ""} className={inputCls} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>組み合わせ表の見出し</span>
              <input name="ann_group_title" defaultValue={comp.ann_group_title ?? "■ 組み合わせ表"} className={inputCls} />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" name="ann_show_hcp" value="1" defaultChecked={comp.ann_show_hcp} />
              名前のうしろにHCPを出す
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className={btnCls}>文面を保存する</button>
            <Link
              href={`/c/${id}/print/announcement`}
              target="_blank"
              className="rounded-lg border border-(--color-line) bg-white px-4 py-2 text-sm"
            >
              印刷プレビューを開く
            </Link>
            <span className="text-xs text-(--color-dim)">
              組み合わせ {groups.length}組ぶんが自動で入ります
              {groups.length === 0 && "（まだ組がありません）"}
            </span>
          </div>
        </form>
      </section>
    </>
  );
}
