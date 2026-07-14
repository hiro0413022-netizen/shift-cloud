import Link from "next/link";
import { requireLessonActor } from "@/lib/auth";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireLessonActor();
  return (
    <div className="flex min-h-screen flex-col">
      {/* 紺ヘッダ（PGA NOTE準拠） */}
      <header className="sticky top-0 z-20 bg-(--color-header) text-white shadow">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold tracking-[0.28em] text-[#ffd97a]">GOLF WING</span>
            <span className="text-base font-bold tracking-tight">Lesson OS</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/" className="rounded-lg px-3 py-1.5 hover:bg-white/10">レッスンノート</Link>
            <Link href="/models" className="rounded-lg px-3 py-1.5 hover:bg-white/10">お手本スイング</Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-white/70 sm:inline">担当: {actor.name}</span>
            <form action="/api/logout" method="post">
              <button className="rounded-lg border border-white/30 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10">
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
