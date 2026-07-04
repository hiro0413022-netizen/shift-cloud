import { requireGenesisActor } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireGenesisActor();
  return (
    <div className="flex min-h-screen">
      <Sidebar userName={actor.name} />
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
