import Link from "next/link";
import { notFound } from "next/navigation";
import { getPro } from "@/lib/data";
import { requireProAdmin } from "@/lib/auth";
import { loginAction, logoutAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "管理画面", robots: { index: false, follow: false } };

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const authed = await requireProAdmin(slug);

  if (!authed) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <p className="sec-title mb-1 text-center text-xs uppercase text-(--color-gold)">Owner Login</p>
        <h1 className="mb-8 text-center text-xl font-black">{pro.name} 管理画面</h1>
        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="slug" value={slug} />
          <div>
            <label className="mb-1 block text-sm font-bold">パスワード</label>
            <input type="password" name="password" required autoFocus className="adm-input" placeholder="パスワードを入力" />
          </div>
          <button type="submit" className="adm-btn bg-(--color-ink) text-white">ログイン</button>
        </form>
        <p className="mt-6 text-center text-xs text-(--color-dim)">
          パスワードが分からない場合は運営までご連絡ください。
        </p>
      </div>
    );
  }

  const base = `/${slug}/admin`;
  return (
    <div className="min-h-screen bg-(--color-panel)">
      <header className="sticky top-0 z-40 border-b border-(--color-line) bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href={base} className="font-black">
            {pro.name} <span className="text-xs font-normal text-(--color-dim)">管理画面</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href={`/${slug}`} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs font-bold">
              サイトを見る
            </Link>
            <form action={logoutAction}>
              <input type="hidden" name="slug" value={slug} />
              <button type="submit" className="rounded-lg px-2 py-1.5 text-xs text-(--color-dim)">ログアウト</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
