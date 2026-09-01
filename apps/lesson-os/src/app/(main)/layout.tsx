import Link from "next/link";
import { requireLessonActor, canAccessStore, FRANK_STORE_ID } from "@/lib/auth";
import { LessonNav, type LessonNavLink } from "@/components/nav";
import { isMobileDevice } from "@/lib/device";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireLessonActor();
  // FRANKに入れない人にはタブ自体を出さない（実際の遮断は /frank 側のサーバー検証 #134）
  const canFrank = canAccessStore(actor, FRANK_STORE_ID);
  const isMobile = await isMobileDevice();

  const links: LessonNavLink[] = [
    { href: "/", label: "レッスンノート" },
    { href: "/models", label: "お手本スイング" },
    ...(canFrank ? [{ href: "/frank", label: "FRANK" }] : []),
  ];

  return (
    // data-mobile はCSSでは決められない出し分け（初期状態など）にだけ使う。
    // 見た目の折り返しは Tailwind の md: に任せる（画面を回しても追随するため）
    <div data-mobile={isMobile ? "1" : undefined} className="flex min-h-screen flex-col">
      {/* 紺ヘッダ（PGA NOTE準拠） */}
      <header className="sticky top-0 z-20 bg-(--color-header) text-white shadow">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 md:py-3">
          <Link href="/" className="flex min-w-0 items-baseline gap-2">
            <span className="text-[10px] font-semibold tracking-[0.28em] text-[#ffd97a]">GOLF WING</span>
            <span className="truncate text-base font-bold tracking-tight">Lesson OS</span>
          </Link>
          <LessonNav links={links} variant="bar" />
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-xs text-white/70 sm:inline">担当: {actor.name}</span>
            <form action="/api/logout" method="post">
              <button className="rounded-lg border border-white/30 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10">
                ログアウト
              </button>
            </form>
          </div>
        </div>
        {/* スマホはここにタブが出る（横スクロール） */}
        <LessonNav links={links} variant="row" />
      </header>
      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-3 py-4 md:px-4 md:py-6">{children}</main>
    </div>
  );
}
