import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { createAdmin } from "@yozan/core/supabase/admin";

export const dynamic = "force-dynamic";

export default async function MastersPage() {
  const actor = await requireActor();
  const admin = createAdmin();

  const [{ data: clients }, { data: partners }] = await Promise.all([
    admin
      .from("cad_clients")
      .select("id, code, name, unit_price, closing_day, payment_day, has_contract")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("code"),
    admin
      .from("cad_partners")
      .select("id, code, name, default_fee, main_course, memo")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("code"),
  ]);

  const cs = (clients ?? []) as Array<{
    id: string;
    code: string | null;
    name: string;
    unit_price: number | null;
    closing_day: string | null;
    payment_day: string | null;
    has_contract: boolean;
  }>;
  const ps = (partners ?? []) as Array<{
    id: string;
    code: string | null;
    name: string;
    default_fee: number | null;
    main_course: string | null;
    memo: string | null;
  }>;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <Link href="/" className="text-xs text-[--color-dim] underline">
          ← ダッシュボード
        </Link>
        <h1 className="text-2xl font-bold tracking-widest">マスタ</h1>
        <p className="mt-1 text-sm text-[--color-dim]">
          取引先（ゴルフ場）と委託先（キャディ）。※個人情報（住所・生年月日・口座）は保持していません
        </p>
      </header>

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold">取引先（{cs.length}）</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[--color-dim]">
            <tr>
              <th className="pb-2">コード</th>
              <th className="pb-2">ゴルフ場</th>
              <th className="pb-2 text-right">標準単価</th>
              <th className="pb-2">締め日</th>
              <th className="pb-2">振込日</th>
              <th className="pb-2">契約書</th>
            </tr>
          </thead>
          <tbody>
            {cs.map((c) => (
              <tr key={c.id} className="border-t border-[--color-line]">
                <td className="py-1.5 text-[--color-dim]">{c.code}</td>
                <td className="py-1.5">{c.name}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {c.unit_price ? `¥${c.unit_price.toLocaleString()}` : "—"}
                </td>
                <td className="py-1.5">{c.closing_day || "—"}</td>
                <td className="py-1.5">{c.payment_day || "—"}</td>
                <td className="py-1.5">
                  {c.has_contract ? (
                    <span className="text-emerald-700">有</span>
                  ) : (
                    <span className="text-red-600">無</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">委託先（{ps.length}）</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[--color-dim]">
            <tr>
              <th className="pb-2">コード</th>
              <th className="pb-2">氏名</th>
              <th className="pb-2 text-right">標準委託料</th>
              <th className="pb-2">主な業務先</th>
              <th className="pb-2">備考</th>
            </tr>
          </thead>
          <tbody>
            {ps.map((p) => (
              <tr key={p.id} className="border-t border-[--color-line]">
                <td className="py-1.5 text-[--color-dim]">{p.code ?? "—"}</td>
                <td className="py-1.5">{p.name}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {p.default_fee ? `¥${p.default_fee.toLocaleString()}` : "—"}
                </td>
                <td className="py-1.5">{p.main_course || "—"}</td>
                <td className="py-1.5 text-xs text-amber-700">{p.memo ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
