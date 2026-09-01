"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * ナビの出し分け（#134・店舗またぎ廃止 → #192 で並び替え）
 * scope: "all" = 全員 / "frank" = FRANK姫路の配属者だけ / "gw" = GOLF WING宝塚の配属者だけ
 *      / "nofrank" = FRANKに配属されていない人だけ（FRANKは予約カレンダーが最初の画面なので月次KPIは出さない）
 * ★ 隠すだけでは守れない。各画面・各アクションのサーバー側でも必ず検証すること。
 *
 * ★ 並びは「店頭の手の動き」順（2026-09-01 ユーザー指示・#192）
 *   お客様が来る → 受付台帳／予約を確認 → 入会を確認 → 注文・チェックイン、の順で左から並べる。
 *   1日に何度も触らない“確認するだけ”の画面（体験申込・体験フォロー・来店検索・データ取込）は
 *   「その他 ▾」に畳んで、普段の視界から外す。タブが10個あると探す時間のほうが長かった。
 */
type Scope = "all" | "frank" | "gw" | "nofrank";
type NavLink = { href: string; label: string; scope: Scope };

/** 常に出しておくタブ（使用頻度が高い順） */
const PRIMARY: NavLink[] = [
  { href: "/dashboard", label: "ダッシュボード", scope: "nofrank" },
  { href: "/", label: "受付台帳", scope: "all" },
  { href: "/reservations", label: "予約", scope: "frank" },
  { href: "/frunk", label: "FRANK会員", scope: "frank" },
  { href: "/orders", label: "電子伝票", scope: "frank" },
  { href: "/checkin", label: "チェックイン", scope: "frank" },
];

/** 「その他 ▾」に畳むタブ（確認するときだけ開く） */
const SECONDARY: NavLink[] = [
  { href: "/trials", label: "体験申込", scope: "frank" },
  { href: "/follow", label: "体験フォロー", scope: "all" },
  { href: "/search", label: "来店検索", scope: "all" },
  { href: "/import", label: "データ取込", scope: "gw" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function visible(links: NavLink[], canFrank: boolean, canGolfWing: boolean) {
  return links.filter((l) => {
    if (l.scope === "all") return true;
    if (l.scope === "frank") return canFrank;
    if (l.scope === "gw") return canGolfWing;
    return !canFrank; // nofrank
  });
}

const tabCls = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-accent/10 text-accent"
      : "text-(--color-dim) hover:bg-(--color-panel-2) hover:text-(--color-txt)"
  }`;

/** 「その他 ▾」。<details> なのでJSの状態を持たない＝タブレットでも取りこぼさない */
function MoreMenu({ links, pathname }: { links: NavLink[]; pathname: string }) {
  if (links.length === 0) return null;
  const activeInside = links.some((l) => isActive(pathname, l.href));
  return (
    <details className="group relative">
      <summary
        className={`${tabCls(activeInside)} flex cursor-pointer list-none items-center gap-1 whitespace-nowrap select-none`}
      >
        その他
        <span className="text-[10px] transition-transform group-open:rotate-180">▾</span>
      </summary>
      {/* 画面の外に出ないよう右寄せ。開いたまま別タブへ行っても遷移で閉じる */}
      <div className="absolute right-0 z-30 mt-1 min-w-44 overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel) py-1 shadow-lg">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`block px-4 py-2 text-sm whitespace-nowrap transition-colors ${
              isActive(pathname, l.href)
                ? "bg-accent/10 font-semibold text-accent"
                : "text-(--color-txt) hover:bg-(--color-panel-2)"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

export function TopBar({
  userName,
  brand,
  canFrank,
  canGolfWing,
}: {
  userName: string;
  brand: string;
  canFrank: boolean;
  canGolfWing: boolean;
}) {
  const pathname = usePathname() || "/";
  const primary = visible(PRIMARY, canFrank, canGolfWing);
  const secondary = visible(SECONDARY, canFrank, canGolfWing);

  return (
    <header className="topbar sticky top-0 z-20 border-b border-(--color-line) bg-(--color-panel)/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-6">
          <Link href={canFrank ? "/reservations" : "/dashboard"} className="flex items-baseline gap-2">
            <span className="max-w-[10rem] truncate text-[11px] font-semibold tracking-[0.22em] text-(--color-gold)">{brand}</span>
            <span className="text-base font-bold tracking-tight text-(--color-txt)">Member OS</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {primary.map((l) => (
              <Link key={l.href} href={l.href} className={tabCls(isActive(pathname, l.href))}>
                {l.label}
              </Link>
            ))}
            <MoreMenu links={secondary} pathname={pathname} />
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-(--color-dim) sm:inline">{userName}</span>
          <form action="/api/logout" method="post">
            <button className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-xs font-medium text-(--color-dim) transition-colors hover:text-(--color-txt)">
              ログアウト
            </button>
          </form>
        </div>
      </div>
      {/* モバイル用ナビ */}
      <nav className="flex items-center gap-1 px-4 pb-2 md:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {primary.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive(pathname, l.href) ? "bg-accent/10 text-accent" : "text-(--color-dim)"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <MoreMenu links={secondary} pathname={pathname} />
      </nav>
    </header>
  );
}
