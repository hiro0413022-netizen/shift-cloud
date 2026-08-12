import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank, canAccessGolfWing } from "@/lib/store-scope";
import { TopBar } from "@/components/nav";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireReceptionActor();
  // ナビは配属店舗で出し分ける（#134）。サーバー側の検証は各画面・各アクションでも行う
  const canGolfWing = await canAccessGolfWing(actor);
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar userName={actor.name} canFrank={canAccessFrank(actor)} canGolfWing={canGolfWing} />
      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-5 py-6">{children}</main>
    </div>
  );
}
