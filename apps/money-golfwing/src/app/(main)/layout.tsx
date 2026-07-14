import { requireMoneyActor } from "@/lib/auth";
import { getCurrentStore } from "@/lib/money";
import { TopBar } from "@/components/nav";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireMoneyActor();
  const store = await getCurrentStore(actor);
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar userName={actor.name} stores={actor.stores} currentStoreId={store?.id ?? null} />
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
