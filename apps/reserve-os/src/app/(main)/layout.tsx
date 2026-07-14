import { requireReserveActor } from "@/lib/auth";
import { TopBar } from "@/components/nav";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireReserveActor();
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar userName={actor.name} />
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-5 py-6">{children}</main>
    </div>
  );
}
