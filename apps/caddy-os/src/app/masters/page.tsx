import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { createAdmin } from "@yozan/core/supabase/admin";
import { ClientEditor, PartnerEditor, TransportMatrix } from "./editors";

export const dynamic = "force-dynamic";

/** 設定（マスタ編集）。取引先・委託先・交通費単価表を編集する（#62 ②③④⑤） */
export default async function MastersPage() {
  const actor = await requireActor();
  const admin = createAdmin();

  const [{ data: clients }, { data: partners }, { data: rates }] = await Promise.all([
    admin
      .from("cad_clients")
      .select("id, code, name, unit_price, partner_fee, closing_day, payment_day, postal_code, address, has_contract, status")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("code"),
    admin
      .from("cad_partners")
      .select("id, code, name, name_kana, default_fee, default_transport, hourly_wage, main_course, show_in_picker, status, memo")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("code"),
    admin
      .from("cad_transport_rates")
      .select("client_id, partner_id, amount")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null),
  ]);

  const cs = (clients ?? []) as Parameters<typeof ClientEditor>[0]["clients"];
  const ps = (partners ?? []) as Parameters<typeof PartnerEditor>[0]["partners"];
  const rateMap: Record<string, number> = {};
  for (const r of (rates ?? []) as Array<{ client_id: string; partner_id: string; amount: number }>) {
    rateMap[`${r.client_id}__${r.partner_id}`] = r.amount;
  }

  // 単価表は「有効な取引先」×「台帳表示のキャディ」で作る（列・行を絞って見やすく）
  const activeClients = cs.filter((c) => c.status === "active");
  const pickerPartners = ps.filter((p) => p.status === "active" && p.show_in_picker);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6">
        <Link href="/" className="text-xs text-(--color-dim) underline">
          ← ダッシュボード
        </Link>
        <h1 className="text-2xl font-bold tracking-widest">設定</h1>
        <p className="mt-1 text-sm text-(--color-dim)">
          取引先・委託先マスタと単価表。委託料はゴルフ場ごと、交通費はキャディ×ゴルフ場で設定します。
          ※個人情報（生年月日・口座）は保持していません
        </p>
      </header>

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold">取引先（ゴルフ場） {cs.length}件</h2>
        <p className="mb-2 text-xs text-(--color-dim)">
          「委託料」はこのゴルフ場に派遣したキャディへ支払う標準額（全キャディ共通・#62 ③）。派遣ごとの上書きは可
        </p>
        <ClientEditor clients={cs} />
      </section>

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold">委託先（キャディ） {ps.length}件</h2>
        <p className="mb-2 text-xs text-(--color-dim)">
          「台帳表示」をオフにすると派遣台帳のプルダウンから消えます（退職・休眠キャディを隠す・#62 ④）。
          「時給(GW)」はゴルフウィング勤務の時給（#62 ⑤）
        </p>
        <PartnerEditor partners={ps} />
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">交通費 単価表（キャディ × ゴルフ場・#62 ②）</h2>
        {activeClients.length === 0 || pickerPartners.length === 0 ? (
          <p className="text-sm text-(--color-dim)">取引先と委託先を登録すると単価表が使えます</p>
        ) : (
          <TransportMatrix clients={activeClients} partners={pickerPartners} rates={rateMap} />
        )}
      </section>
    </main>
  );
}
