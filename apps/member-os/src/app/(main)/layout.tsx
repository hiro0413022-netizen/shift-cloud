import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank, canAccessGolfWing, companyHasFrank } from "@/lib/store-scope";
import { createAdmin } from "@/lib/supabase/admin";
import { TopBar } from "@/components/nav";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireReceptionActor();
  // ナビは「会社がその店舗を持つか × 自分が触れるか」で出し分ける（#134/#150）。
  // 会社チェックが無いと、外販テナントのオーナーに FRANK/GOLF WING のタブが出てしまう。
  const [hasFrank, canGolfWing] = await Promise.all([
    companyHasFrank(actor.companyId),
    canAccessGolfWing(actor),
  ]);
  const canFrank = hasFrank && canAccessFrank(actor);

  // ヘッダーのブランド表記: GOLF WING の会社は従来どおり、それ以外は会社名（外販テナント対応）
  let brand = "GOLF WING";
  if (!canGolfWing && !canFrank) {
    const { data: company } = await createAdmin()
      .from("companies").select("name").eq("id", actor.companyId).maybeSingle();
    brand = String(company?.name ?? "Member OS");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar userName={actor.name} brand={brand} canFrank={canFrank} canGolfWing={canGolfWing} />
      <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-5 py-6">{children}</main>
    </div>
  );
}
