import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { ReceptionForm } from "./reception-form";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">GOLF WING</p>
        <h1 className="text-2xl font-bold tracking-wide">ご来店受付</h1>
        <p className="mt-1 text-xs text-(--color-dim)">タブレットにご記入をお願いします</p>
      </div>
      {children}
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-6 text-center">
        <p className="text-lg font-semibold">{title}</p>
        <p className="mt-2 text-sm text-(--color-dim)">{body}</p>
      </div>
    </Shell>
  );
}

export default async function ReceptionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdmin();

  const { data: tok } = await admin
    .from("mbr_walkin_tokens")
    .select("company_id, store_id, active, stores(name)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!tok || !tok.active)
    return <Notice title="受付URLが無効です" body="お手数ですがスタッフにお声がけください。" />;

  const store = (tok.stores ?? null) as { name?: string } | null;

  return (
    <Shell>
      <ReceptionForm token={token} storeName={store?.name ?? null} />
    </Shell>
  );
}
