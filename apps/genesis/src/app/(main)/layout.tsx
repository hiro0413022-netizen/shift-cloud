import { requireGenesisActor, visibleStores } from "@/lib/auth";
import { getNavBadges } from "@/lib/nav-badges";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { CommandPalette } from "@/components/command-palette";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireGenesisActor();
  // #244: メニューの件数バッジと店舗一覧。どちらも軽い問い合わせ（count / stores）だけ
  const [badges, stores] = await Promise.all([
    getNavBadges(actor).catch(() => ({ approve: 0, customers: 0, stalled: 0 })),
    visibleStores(actor).catch(() => []),
  ]);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <MobileNav userName={actor.name} badges={badges} stores={stores} />
      <Sidebar userName={actor.name} badges={badges} stores={stores} />
      <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">{children}</main>
      <CommandPalette />
    </div>
  );
}
