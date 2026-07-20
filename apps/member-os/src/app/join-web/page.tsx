import { createAdmin } from "@/lib/supabase/admin";
import { resolveHimeji } from "@/lib/member";
import { WebJoinForm } from "./web-join-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Web入会申込｜FRANK GOLF 姫路",
  description: "FRANK GOLF 姫路・土山のWeb入会申込フォーム。プランをお選びのうえお申し込みください。",
};

export default async function JoinWebPage() {
  const store = await resolveHimeji();
  const admin = createAdmin();

  const { data: plans } = store
    ? await admin
        .from("frunk_plans")
        .select("id, name, monthly_price, joining_fee, max_bookings_per_day, note")
        .eq("company_id", store.companyId)
        .eq("active", true)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
    : { data: [] };

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-5 py-10">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">FRANK GOLF 姫路・土山</p>
        <h1 className="mt-1 text-2xl font-bold tracking-wide">Web入会申込</h1>
        <p className="mt-2 text-sm text-(--color-dim)">
          プランをお選びのうえ、お申し込みください。スタッフ確認後、折り返しご連絡いたします。
        </p>
      </div>
      <WebJoinForm plans={(plans ?? []) as never} />
      <p className="mt-6 text-center text-xs text-(--color-dim)">
        まずは体験から、という方は <a href="/trial" className="text-(--color-gold) underline">体験のお申し込み</a> へ。
      </p>
    </main>
  );
}
