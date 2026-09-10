import Link from "next/link";
import { requireCast } from "@/lib/cast";

/**
 * キャスト用スマホの枠。下タブは実際に開ける画面だけ置く（押して何も無い、が一番不安にさせる）。
 */
export default async function CastAppLayout({ children }: { children: React.ReactNode }) {
  await requireCast();
  return (
    <div className="no-select mx-auto flex min-h-screen max-w-md flex-col bg-(--color-bg)">
      <div className="grow pb-24">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md border-t border-(--color-line) bg-white px-2 pb-5 pt-2">
        <Link href="/cast" className="flex min-h-11 grow items-center justify-center text-[11px] font-medium">
          ホーム
        </Link>
        <Link href="/cast/shift" className="flex min-h-11 grow items-center justify-center text-[11px] font-medium">
          シフト
        </Link>
        <form action="/api/cast-logout" method="post" className="flex grow">
          <button className="min-h-11 grow text-[11px] text-(--color-dim)">ログアウト</button>
        </form>
      </nav>
    </div>
  );
}
