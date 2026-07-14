import Link from "next/link";
import { requireActor, can } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HqLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (!can(actor, "view_hq")) redirect("/home");
  return (
    <div className="mx-auto min-h-screen max-w-6xl">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center gap-6">
          <p className="text-sm font-semibold tracking-tight">YOZAN 本部管理</p>
          <nav className="flex gap-4 text-sm text-zinc-500">
            <Link href="/hq" className="hover:text-brand">ダッシュボード</Link>
            <Link href="/hq/suggestions" className="hover:text-brand">AI提案</Link>
          </nav>
        </div>
        <Link href="/admin/staff" className="text-xs text-zinc-500 hover:text-brand">管理画面へ</Link>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
