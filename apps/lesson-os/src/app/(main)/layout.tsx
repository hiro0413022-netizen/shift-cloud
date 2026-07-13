import Link from "next/link";
import { requireLessonActor } from "@/lib/auth";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireLessonActor();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-[--color-line] bg-[--color-panel]/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold tracking-[0.28em] text-[--color-gold]">GOLF WING</span>
            <span className="text-base font-bold tracking-tight">Lesson OS</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-[--color-dim] sm:inline">{actor.name}</span>
            <form action="/api/logout" method="post">
              <button className="rounded-lg border border-[--color-line] px-3 py-1.5 text-xs text-[--color-dim]">
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
