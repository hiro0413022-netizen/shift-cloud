import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { JoinForm } from "./join-form";

export const dynamic = "force-dynamic";

function Shell({ storeName, children }: { storeName?: string | null; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <div className="mb-6 text-center">
        <p className="text-xs font-semibold tracking-[0.3em] text-[--color-gold]">FRUNK GOLF</p>
        <h1 className="text-2xl font-bold tracking-tight">入会申込</h1>
        <p className="mt-1 text-xs text-[--color-dim]">{storeName ?? "タブレットにご記入をお願いします"}</p>
      </div>
      {children}
    </main>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdmin();

  const { data: tok } = await admin
    .from("frunk_signup_tokens")
    .select("company_id, store_id, active, stores(name)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!tok || !tok.active) {
    return (
      <Shell>
        <div className="rounded-2xl border border-[--color-line] bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-semibold">入会URLが無効です</p>
          <p className="mt-2 text-sm text-[--color-dim]">お手数ですがスタッフにお声がけください。</p>
        </div>
      </Shell>
    );
  }

  const { data: plans } = await admin
    .from("frunk_plans")
    .select("id, name, monthly_price, joining_fee, max_bookings_per_day, note")
    .eq("company_id", tok.company_id)
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  const store = (tok.stores ?? null) as { name?: string } | null;

  return (
    <Shell storeName={store?.name}>
      <JoinForm token={token} plans={(plans ?? []) as never} />
    </Shell>
  );
}
