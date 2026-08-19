import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { createAdmin } from "@yozan/core/supabase/admin";
import { currentYm, getPartnerLedger, kindLabel, STATUS_LABEL, STATUS_TONE, yen } from "@/lib/caddy";

export const dynamic = "force-dynamic";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** キャディ台帳（個人別）。勤務日・ゴルフ場・勤務区分・料金がこの1枚に出る（小川さん依頼 3.） */
export default async function PartnerLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ ym?: string }>;
}) {
  const actor = await requireActor();
  const { partnerId } = await params;
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();

  const admin = createAdmin();
  const [{ data: partner }, rows] = await Promise.all([
    admin
      .from("cad_partners")
      .select("id, code, name, name_kana, phone, email, main_course, default_fee, default_transport, hourly_wage, status, submit_token")
      .eq("id", partnerId)
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .single(),
    getPartnerLedger(actor.companyId, partnerId, ym),
  ]);
  if (!partner) notFound();

  const p = partner as {
    id: string;
    code: string | null;
    name: string;
    name_kana: string | null;
    phone: string | null;
    email: string | null;
    main_course: string | null;
    status: string;
    submit_token: string | null;
  };

  const confirmed = rows.filter((r) => r.status === "confirmed");
  const totals = confirmed.reduce(
    (t, r) => ({
      fee: t.fee + r.fee_amount,
      transport: t.transport + r.transport_amount,
      special: t.special + r.special_amount,
      pay: t.pay + r.pay,
    }),
    { fee: 0, transport: 0, special: 0, pay: 0 }
  );
  const workDays = new Set(confirmed.map((r) => r.dispatch_date)).size;

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/ledger?ym=${ym}`} className="text-xs text-(--color-dim) underline">
            ← キャディ台帳
          </Link>
          <h1 className="text-2xl font-bold tracking-widest">{p.name}</h1>
          <p className="mt-1 text-sm text-(--color-dim)">
            {p.name_kana ? `${p.name_kana} / ` : ""}
            {p.code ? `コード ${p.code} / ` : ""}
            {p.main_course ? `主な業務先 ${p.main_course}` : ""}
          </p>
          {p.phone || p.email ? (
            <p className="mt-0.5 text-xs text-(--color-dim)">
              {p.phone ? `TEL ${p.phone}` : ""} {p.email ?? ""}
            </p>
          ) : null}
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

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="勤務日数" value={`${workDays} 日`} sub={`確定 ${confirmed.length} 件`} />
        <Kpi label="委託料" value={yen(totals.fee)} />
        <Kpi label="交通費" value={yen(totals.transport)} />
        <Kpi label="支払計" value={yen(totals.pay)} sub={totals.special > 0 ? `手当 ${yen(totals.special)} 含む` : undefined} />
      </section>

      <section className={cardCls}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">{ym} の勤務明細</h2>
          <Link href={`/invoices/payable/${p.id}?ym=${ym}`} className="text-sm underline">
            支払請求書を見る
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-(--color-dim)">この月の勤務はまだありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-(--color-dim)">
                <tr>
                  <th className="pb-2">勤務日</th>
                  <th className="pb-2">ゴルフ場</th>
                  <th className="pb-2">区分</th>
                  <th className="pb-2">状態</th>
                  <th className="pb-2 text-right">委託料</th>
                  <th className="pb-2 text-right">交通費</th>
                  <th className="pb-2 text-right">手当</th>
                  <th className="pb-2 text-right">計</th>
                  <th className="pb-2">備考</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const wd = WD[new Date(`${r.dispatch_date}T00:00:00Z`).getUTCDay()];
                  const dim = r.status !== "confirmed" ? "text-(--color-dim)" : "";
                  return (
                    <tr key={r.id} className={`border-t border-(--color-line) ${dim}`}>
                      <td className="py-1.5 whitespace-nowrap">
                        {r.dispatch_date.slice(5).replace("-", "/")}（{wd}）
                      </td>
                      <td className="py-1.5">{r.client_name}</td>
                      <td className="py-1.5">
                        {kindLabel(r.kind)}
                        {r.work_hours ? <span className="ml-1 text-[10px]">{r.work_hours}h</span> : null}
                      </td>
                      <td className="py-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_TONE[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{r.fee_amount > 0 ? yen(r.fee_amount) : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.transport_amount > 0 ? yen(r.transport_amount) : "—"}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {r.special_amount > 0 ? yen(r.special_amount) : "—"}
                      </td>
                      <td className="py-1.5 text-right font-medium tabular-nums">{yen(r.pay)}</td>
                      <td className="py-1.5 text-xs text-(--color-dim)">{r.memo ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-(--color-dim)">
          ※ 合計は<b>確定</b>のみ。仮の行は明細に見えていても金額には含めていません。
        </p>
      </section>
    </main>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
      <p className="text-xs text-(--color-dim)">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-(--color-dim)">{sub}</p> : null}
    </div>
  );
}
