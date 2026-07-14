import { requireActor, isAdmin } from "@/lib/auth";
import { StaffNav } from "@/components/staff-nav";
import Link from "next/link";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  return (
    <div className="mx-auto min-h-screen max-w-lg pb-20">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur">
        <p className="text-sm font-semibold tracking-tight">YOZAN Shift Cloud</p>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>{actor.name}</span>
          {isAdmin(actor) && (
            <Link href="/admin/staff" className="text-brand">
              管理画面
            </Link>
          )}
        </div>
      </header>
      <main className="p-4">{children}</main>
      <StaffNav />
    </div>
  );
}
