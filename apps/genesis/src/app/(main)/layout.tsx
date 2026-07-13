import { requireGenesisActor } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireGenesisActor();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <MobileNav userName={actor.name} />
      <Sidebar userName={actor.name} />
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
