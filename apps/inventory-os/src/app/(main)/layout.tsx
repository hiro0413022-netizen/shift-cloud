import { requireInventoryActor } from "@/lib/auth";
import { TopBar } from "@/components/nav";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireInventoryActor();
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar userName={actor.name} role={actor.role} />
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
