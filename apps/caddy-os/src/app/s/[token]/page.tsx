import { notFound } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { currentYm } from "@/lib/caddy";
import { SelfSubmit } from "./submit";

export const dynamic = "force-dynamic";

/**
 * キャディ本人のシフト希望提出（公開・ログイン不要 / DECISIONS #140）
 *
 * LINEでこのURLを1回配れば、以後は本人がスマホから出勤希望日を入れられる。
 * 管理者の代理入力（/availability）と同じ cad_availability に入るので、
 * カレンダーの割当候補にそのまま出る＝集めた希望を転記する作業が消える。
 *
 * 認証の考え方: ログインは無し。トークンで委託先を特定し、**その人の行しか触れない**。
 * トークンは設定画面から再発行でき、再発行した瞬間に旧URLは無効になる（#12/#23と同型）。
 */
export default async function SelfPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{16,64}$/.test(token)) notFound();

  const admin = createAdmin();
  const { data: partner } = await admin
    .from("cad_partners")
    .select("id, name, company_id, status")
    .eq("submit_token", token)
    .is("deleted_at", null)
    .single();
  const p = partner as { id: string; name: string; company_id: string; status: string } | null;
  if (!p || p.status !== "active") notFound();

  // 今月と翌月・翌々月。過去の希望は本人からは触らせない（確定済みの派遣が動くと事故になる）
  const months = nextMonths(currentYm(), 3);
  const from = `${months[0]}-01`;
  const to = lastDay(months[months.length - 1]);

  const [{ data: avail }, { data: dispatches }] = await Promise.all([
    admin
      .from("cad_availability")
      .select("date, status, memo")
      .eq("partner_id", p.id)
      .gte("date", from)
      .lte("date", to)
      .is("deleted_at", null),
    admin
      .from("cad_dispatches")
      .select("dispatch_date, status, cad_clients(name)")
      .eq("partner_id", p.id)
      .eq("status", "confirmed")
      .gte("dispatch_date", from)
      .lte("dispatch_date", to)
      .is("deleted_at", null)
      .order("dispatch_date"),
  ]);

  type RawD = { dispatch_date: string; status: string; cad_clients: { name: string } | null };
  const confirmed = ((dispatches ?? []) as unknown as RawD[]).map((d) => ({
    date: d.dispatch_date,
    client_name: d.cad_clients?.name ?? "",
  }));

  return (
    <main className="mx-auto max-w-lg p-4">
      <header className="mb-4">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">YOZAN</p>
        <h1 className="text-xl font-bold">出勤希望の提出</h1>
        <p className="mt-1 text-sm text-(--color-dim)">{p.name} さん</p>
      </header>

      <SelfSubmit
        token={token}
        months={months}
        availability={(avail ?? []) as Array<{ date: string; status: string; memo: string | null }>}
        confirmed={confirmed}
      />

      <p className="mt-6 text-center text-[11px] text-(--color-dim)">
        このページのURLはあなた専用です。他の方には共有しないでください。
      </p>
    </main>
  );
}

function nextMonths(ym: string, n: number): string[] {
  const [y, m] = ym.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function lastDay(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
