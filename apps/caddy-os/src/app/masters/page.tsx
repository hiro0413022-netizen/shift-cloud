import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { createAdmin } from "@yozan/core/supabase/admin";
import { ClientEditor, InvoiceSettingsEditor, PartnerEditor, TransportMatrix, type InvoiceSettingsValue } from "./editors";

export const dynamic = "force-dynamic";

/** 設定（マスタ編集）。取引先・委託先・交通費単価表を編集する（#62 ②③④⑤） */
export default async function MastersPage() {
  const actor = await requireActor();
  const admin = createAdmin();

  const [{ data: clients }, { data: partners }, { data: rates }, { data: caddyStaff }, { data: company }] = await Promise.all([
    admin
      .from("cad_clients")
      .select("id, code, name, unit_price, partner_fee, closing_day, payment_day, postal_code, address, has_contract, status")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("code"),
    admin
      .from("cad_partners")
      .select("id, code, name, name_kana, default_fee, default_transport, hourly_wage, main_course, show_in_picker, status, memo, bank_name, bank_branch, bank_account_type, bank_account_no, bank_holder")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("code"),
    admin
      .from("cad_transport_rates")
      .select("client_id, partner_id, staff_id, amount")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null),
    // 交通費単価表に出す社員 = これまでキャディに入った社員（林さん等）
    admin
      .from("cad_dispatches")
      .select("staff_id, staff(name)")
      .eq("company_id", actor.companyId)
      .not("staff_id", "is", null)
      .is("deleted_at", null),
    admin.from("companies").select("settings").eq("id", actor.companyId).single(),
  ]);

  const invoiceSettings = (((company?.settings ?? {}) as { invoice?: InvoiceSettingsValue }).invoice ?? {}) as InvoiceSettingsValue;

  const cs = (clients ?? []) as Parameters<typeof ClientEditor>[0]["clients"];
  const ps = (partners ?? []) as Parameters<typeof PartnerEditor>[0]["partners"];
  const rateMap: Record<string, number> = {};
  for (const r of (rates ?? []) as Array<{ client_id: string; partner_id: string | null; staff_id: string | null; amount: number }>) {
    const ref = r.partner_id ?? r.staff_id;
    if (ref) rateMap[`${r.client_id}__${ref}`] = r.amount;
  }

  // 単価表は「有効な取引先」×「台帳表示のキャディ」で作る（列・行を絞って見やすく）
  const activeClients = cs.filter((c) => c.status === "active");
  const pickerPartners = ps.filter((p) => p.status === "active" && p.show_in_picker);

  // キャディに入る社員（重複排除）
  const staffMap = new Map<string, string>();
  for (const d of (caddyStaff ?? []) as Array<{ staff_id: string | null; staff: { name: string } | null }>) {
    if (d.staff_id && !staffMap.has(d.staff_id)) staffMap.set(d.staff_id, d.staff?.name ?? "（社員）");
  }
  const caddyStaffList = [...staffMap.entries()].map(([id, name]) => ({ id, name }));

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6">
        <Link href="/" className="text-xs text-(--color-dim) underline">
          ← ダッシュボード
        </Link>
        <h1 className="text-2xl font-bold tracking-widest">設定</h1>
        <p className="mt-1 text-sm text-(--color-dim)">
          取引先・委託先マスタと単価表。委託料はゴルフ場ごと、交通費はキャディ×ゴルフ場で設定します。
        </p>
      </header>

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold">請求書設定（差出人・振込先）</h2>
        <p className="mb-2 text-xs text-(--color-dim)">
          取引先向け請求書のヘッダーに印字される会社情報と振込先銀行です。保存するとすべての請求書に反映されます。
        </p>
        <InvoiceSettingsEditor value={invoiceSettings} />
      </section>

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
          「時給(GW)」はゴルフウィング勤務の時給（#62 ⑤）。
          「振込先口座」を登録すると、そのキャディ→YOZANの支払請求書に振込先として印字されます（任意）
        </p>
        <PartnerEditor partners={ps} />
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">交通費 単価表（キャディ × ゴルフ場・#62 ②）</h2>
        {activeClients.length === 0 || (pickerPartners.length === 0 && caddyStaffList.length === 0) ? (
          <p className="text-sm text-(--color-dim)">取引先と委託先を登録すると単価表が使えます</p>
        ) : (
          <TransportMatrix clients={activeClients} partners={pickerPartners} staff={caddyStaffList} rates={rateMap} />
        )}
      </section>
    </main>
  );
}
