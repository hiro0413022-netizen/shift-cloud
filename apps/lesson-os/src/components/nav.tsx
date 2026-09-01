"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Lesson OS のタブ（#192・2026-09-01）
 *
 * ★ スマホで開いたときの並び
 *   これまでは「ブランド名・タブ3つ・担当者名・ログアウト」を1行に詰めていて、
 *   iPhone の幅ではタブが潰れて読めなかった。
 *   広い画面は今までどおり1行（variant="bar"）、スマホはヘッダの2段目に出して
 *   横スクロールにする（variant="row"）。
 *
 * ★ いま開いているタブに色を付ける（今までどこにいるか分からなかった）
 */
export type LessonNavLink = { href: string; label: string };

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/students");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function LessonNav({ links, variant }: { links: LessonNavLink[]; variant: "bar" | "row" }) {
  const pathname = usePathname() || "/";
  const cls = (active: boolean) =>
    `rounded-lg px-3 py-1.5 whitespace-nowrap transition-colors ${
      active ? "bg-white/15 font-semibold text-white" : "text-white/75 hover:bg-white/10"
    }`;
  const wrap =
    variant === "bar"
      ? "hidden items-center gap-1 text-sm md:flex"
      : "no-scrollbar flex items-center gap-1 overflow-x-auto px-4 pb-2 text-sm md:hidden";
  return (
    <nav className={wrap}>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={cls(isActive(pathname, l.href))}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
