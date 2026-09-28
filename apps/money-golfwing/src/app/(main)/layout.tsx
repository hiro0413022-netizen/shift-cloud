import { requireMoneyActor } from "@/lib/auth";
import { getCurrentStore } from "@/lib/money";
import { AppShell } from "@/components/nav";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireMoneyActor();
  const store = await getCurrentStore(actor);
  return (
    <AppShell
      userName={actor.name}
      stores={actor.stores}
      currentStoreId={store?.id ?? null}
      canManageAll={actor.canManageAll}
    >
      {children}
    </AppShell>
  );
}
