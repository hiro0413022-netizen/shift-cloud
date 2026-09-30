import { notFound } from "next/navigation";
import { getPro, listProfileItems } from "@/lib/data";
import { AdminTitle, DeleteButton, Msg } from "@/components/admin-ui";
import { PhotoUpload } from "@/components/photo-upload";
import { deleteProfileItemAction, removeProPhotoAction, saveProAction, saveProfileItemAction, uploadProPhotoAction } from "../actions";

export const dynamic = "force-dynamic";

const PHOTOS = [
  { kind: "hero", label: "トップ写真", hint: "HPのいちばん上に大きく出ます。横長の写真がおすすめです。", maxEdge: 2400 },
  { kind: "profile", label: "プロフィール写真", hint: "PROFILEページに出ます。縦長・上半身の写真がおすすめです。", maxEdge: 1600 },
] as const;

export default async function AdminProfile({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const items = await listProfileItems(pro.id);

  return (
    <div>
      <AdminTitle slug={slug} title="プロフィール" hint="PROFILEページとトップの表示内容を編集します。" />
      <Msg ok={sp.ok} err={sp.err} />

      <div className="mb-8 rounded-xl border border-(--color-line) bg-white p-4">
        <p className="mb-1 font-black">写真</p>
        <p className="mb-4 text-[11px] text-(--color-dim)">スマホの写真フォルダから選べます。大きな写真も自動で軽くしてから送ります。</p>
        <div className="grid gap-6 md:grid-cols-2">
          {PHOTOS.map((ph) => {
            const current = ph.kind === "hero" ? pro.hero_image_url : pro.profile_image_url;
            return (
              <div key={ph.kind}>
                <p className="text-sm font-bold">{ph.label}</p>
                <p className="mb-2 text-[11px] text-(--color-dim)">{ph.hint}</p>
                {current ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current} alt={ph.label} className={`mb-2 w-full rounded-lg border border-(--color-line) object-cover ${ph.kind === "hero" ? "aspect-video" : "aspect-[4/5] max-w-[200px]"}`} />
                ) : (
                  <p className="mb-2 rounded-lg border border-dashed border-(--color-line) px-3 py-6 text-center text-xs text-(--color-dim)">まだ写真がありません</p>
                )}
                <form action={uploadProPhotoAction}>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="kind" value={ph.kind} />
                  <PhotoUpload maxEdge={ph.maxEdge} buttonLabel={current ? "この写真に差し替える" : "アップロードして表示する"} />
                </form>
                {current ? (
                  <form action={removeProPhotoAction} className="mt-2">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="kind" value={ph.kind} />
                    <DeleteButton label="写真を外す" />
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-(--color-line) bg-white p-4">
        <p className="mb-3 font-black">基本情報</p>
        <form action={saveProAction} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold">名前</label>
              <input name="name" defaultValue={pro.name} className="adm-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">ローマ字表記</label>
              <input name="name_en" defaultValue={pro.name_en ?? ""} placeholder="TSUYOSHI ENOMOTO" className="adm-input" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">トップのひとこと（キャッチコピー）</label>
            <input name="catchphrase" defaultValue={pro.catchphrase ?? ""} placeholder="例: レギュラーツアー優勝を目指して。" className="adm-input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">経歴文（BIOGRAPHY）</label>
            <textarea name="bio" rows={6} defaultValue={pro.bio ?? ""} className="adm-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold">所属</label>
              <input name="affiliation" defaultValue={pro.affiliation ?? ""} className="adm-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">ランキング表示</label>
              <input name="world_ranking" defaultValue={pro.world_ranking ?? ""} placeholder="例: 世界ランキング ◯◯位" className="adm-input" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">ランキング注記</label>
            <input name="ranking_note" defaultValue={pro.ranking_note ?? ""} placeholder="例: ※毎週火曜日更新" className="adm-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold">Instagram ID</label>
              <input name="instagram_username" defaultValue={pro.instagram_username ?? ""} placeholder="eno1227golf" className="adm-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold">X（旧Twitter）ID</label>
              <input name="x_username" defaultValue={pro.x_username ?? ""} className="adm-input" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold">YouTubeチャンネルURL</label>
            <input name="youtube_url" defaultValue={pro.youtube_url ?? ""} placeholder="https://www.youtube.com/@..." className="adm-input" />
          </div>
          <button type="submit" className="adm-btn bg-(--color-ink) text-white">保存する</button>
        </form>
      </div>

      <p className="mb-2 text-sm font-bold">プロフィール表（生年月日・身長など / タップで編集）</p>
      <div className="mb-4 space-y-2">
        {items.map((it) => (
          <details key={it.id} className="rounded-xl border border-(--color-line) bg-white">
            <summary className="cursor-pointer list-none p-4">
              <span className="mr-3 font-bold">{it.label}</span>
              <span className="text-sm text-(--color-dim)">{it.value}</span>
            </summary>
            <div className="border-t border-(--color-line) p-4">
              <form action={saveProfileItemAction} className="space-y-3">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={it.id} />
                <div className="grid grid-cols-2 gap-3">
                  <input name="label" defaultValue={it.label} className="adm-input" />
                  <input name="value" defaultValue={it.value} className="adm-input" />
                </div>
                <input type="hidden" name="sort" value={it.sort} />
                <button type="submit" className="adm-btn bg-(--color-ink) text-white">更新する</button>
              </form>
              <form action={deleteProfileItemAction} className="mt-3 text-right">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="id" value={it.id} />
                <DeleteButton label="この行を削除" />
              </form>
            </div>
          </details>
        ))}
      </div>

      <div className="rounded-xl border border-(--color-line) bg-white p-4">
        <p className="mb-3 font-black">＋ 行を追加</p>
        <form action={saveProfileItemAction} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <div className="grid grid-cols-2 gap-3">
            <input name="label" required placeholder="項目名（例: 得意クラブ）" className="adm-input" />
            <input name="value" placeholder="内容（例: ドライバー）" className="adm-input" />
          </div>
          <button type="submit" className="adm-btn bg-(--color-ink) text-white">追加する</button>
        </form>
      </div>
    </div>
  );
}
