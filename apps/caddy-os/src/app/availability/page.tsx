import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { createAdmin } from "@yozan/core/supabase/admin";
import { currentYm, ymRange } from "@/lib/caddy";
import { AvailabilityGrid } from "./grid";

export const dynamic = "force-dynamic";

/**
 * 出勤可否シフト（DECISIONS #46）
 *
 * 委託先キャディが「その日 出られるか」だけを管理する最小構成。
 * ○（出勤可）/ △（要相談）/ ×（不可）の3値。空欄は未回答。
 *
 * ※ 委託先は社員ではないため Shift Cloud の勤怠・給与には載せない。
 *   載せると人件費として計上され、委託料との二重計上になる（0036の設計思想）。
 */
export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();
  const { from, to } = ymRange(ym);

  const admin = createAdmin();
  const [{ data: partners }, { data: avail }, { data: dispatches }] = await Promise.all([
    admin
      .from("cad_partners")
      .select("id, name")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("code"),
    admin
      .from("cad_availability")
      .select("partner_id, date, status")
      .eq("company_id", actor.companyId)
      .gte("date", from)
      .lte("date", to)
      .is("deleted_at", null),
    admin
      .from("cad_dispatches")
      .select("partner_id, dispatch_date")
      .eq("company_id", actor.companyId)
      .gte("dispatch_date", from)
      .lte("dispatch_date", to)
      .is("deleted_at", null)
      .not("partner_id", "is", null),
  ]);

  const ps = (partners ?? []) as Array<{ id: string; name: string }>;
  const av = (avail ?? []) as Array<{ partner_id: string; date: string; status: string }>;
  const ds = (dispatches ?? []) as Array<{ partner_id: string; dispatch_date: string }>;

  const lastDay = Number(to.slice(-2));
  const days = Array.from({ length: lastDay }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);

  return (
    <main className="mx-auto max-w-[1400px] p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-(--color-dim) underline">
            ← ダッシュボード
          </Link>
          <h1 className="text-2xl font-bold tracking-widest">出勤可否</h1>
          <p className="mt-1 text-sm text-(--color-dim)">
            委託先キャディの稼働可能日。○=可 / △=要相談 / ×=不可（空欄=未回答）
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input
            type="month"
            name="ym"
            defaultValue={ym}
            className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
          />
          <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm">表示</button>
        </form>
      </header>

      <section className={cardCls}>
        <AvailabilityGrid partners={ps} days={days} availability={av} dispatched={ds} ym={ym} />
      </section>

      <p className="mt-4 text-xs text-(--color-dim)">
        ※ セルをクリックするたびに ○ → △ → × → 空欄 と切り替わり、その場で保存されます。
        <b>青いセルは既に派遣が入っている日</b>です。
      </p>
    </main>
  );
}
