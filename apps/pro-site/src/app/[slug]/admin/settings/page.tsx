import { notFound } from "next/navigation";
import { getPro } from "@/lib/data";
import { AdminTitle, Msg } from "@/components/admin-ui";
import { changePasswordAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminSettings({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const pro = await getPro(slug);
  if (!pro) notFound();

  return (
    <div>
      <AdminTitle slug={slug} title="設定" />
      <Msg ok={sp.ok} err={sp.err} />
      <div className="rounded-xl border border-(--color-line) bg-white p-4">
        <p className="mb-3 font-black">パスワードの変更</p>
        <form action={changePasswordAction} className="space-y-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="password" name="new_password" required minLength={8} placeholder="新しいパスワード（8文字以上）" className="adm-input" />
          <button type="submit" className="adm-btn bg-(--color-ink) text-white">変更する</button>
        </form>
      </div>
      <div className="mt-6 rounded-xl border border-(--color-line) bg-white p-4 text-sm leading-7 text-(--color-dim)">
        <p className="mb-1 font-black text-(--color-txt)">管理画面の入り方（メモ）</p>
        <p>HPの一番下のコピーライト表記（© …）を<b>3秒以内に5回タップ</b>すると、このログイン画面が開きます。ブックマークしてもOKです。</p>
      </div>
    </div>
  );
}
