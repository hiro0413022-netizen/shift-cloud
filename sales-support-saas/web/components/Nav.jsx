"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

const items = [
  { href: "/", label: "ホーム（やること）", ico: "🏠" },
  { href: "/board", label: "案件ボード", ico: "🗂️" },
  { href: "/list", label: "施設一覧", ico: "📋" },
  { href: "/inquiries/new", label: "問い合わせ受付", ico: "📥" },
  { href: "/customers", label: "導入先", ico: "🏢" },
  { href: "/campaigns", label: "集客の施策", ico: "📣" },
  { href: "/settings", label: "設定", ico: "⚙️" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {items.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : ""}>
            <span className="ico">{it.ico}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
