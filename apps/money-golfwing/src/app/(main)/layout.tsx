import { requireMoneyActor } from "@/lib/auth";
import { TopBar } from "@/components/nav";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireMoneyActor();
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar userName={actor.name} />
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
