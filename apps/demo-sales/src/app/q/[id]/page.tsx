import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { calcQuote, yen, type QuoteItem } from "@/lib/quote";

export const dynamic = "force-dynamic";

// 印刷用の見積書（A4）。ブラウザの「印刷 → PDFとして保存」でPDF化できる。
// 画面のヘッダー等は @media print で消す。

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const admin = createAdmin();

  const { data: q } = await admin
    .from("dms_quotes")
    .select("*")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .single();
  if (!q) notFound();

  const [{ data: p }, { data: st }] = await Promise.all([
    admin.from("dms_prospects").select("name, address, contact_name").eq("id", q.prospect_id).single(),
    admin.from("dms_quote_settings").select("*").eq("company_id", actor.companyId).maybeSingle(),
  ]);

  const items = (q.items ?? []) as QuoteItem[];
  const input = {
    planName: q.plan_name,
    planBuild: q.plan_build,
    planMonthly: q.plan_monthly,
    items,
    discountBuild: q.discount_build,
    discountMonthly: q.discount_monthly,
    taxRate: Number(q.tax_rate),
  };
  const t = calcQuote(input);

  const issue = String(q.issue_date);
  const until = new Date(issue);
  until.setDate(until.getDate() + (q.valid_days ?? 30));
  const validUntil = until.toISOString().slice(0, 10);
  const taxPct = Math.round(Number(q.tax_rate) * 100);

  const rows: { name: string; qty: string; build: number; monthly: number; desc?: string }[] = [];
  if (q.plan_name) {
    rows.push({ name: `${q.plan_name}（ホームページ制作・基本プラン）`, qty: "1式", build: q.plan_build, monthly: q.plan_monthly });
  }
  for (const i of items) {
    rows.push({
      name: i.name,
      qty: `${i.qty}${i.unit}`,
      build: i.build * i.qty,
      monthly: i.monthly * i.qty,
      desc: i.description,
    });
  }

  return (
    <main className="mx-auto max-w-[820px] p-6 print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/p/${q.prospect_id}`} className="text-xs text-(--color-dim) hover:text-(--color-txt)">
          ← 営業先へ戻る
        </Link>
        <p className="text-xs text-(--color-dim)">
          印刷（Ctrl/⌘+P）→「PDFとして保存」でPDFになります。面談中はこの画面をそのまま見せられます。
        </p>
      </div>

      <div className="rounded-xl border border-(--color-line) bg-white p-10 text-[13px] leading-relaxed text-black shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <h1 className="mb-6 text-center text-2xl font-bold tracking-[0.3em]">御 見 積 書</h1>

        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="border-b border-black pb-1 text-lg font-bold">{p?.name} 御中</p>
            {p?.contact_name && <p className="mt-1 text-xs">{p.contact_name} 様</p>}
            <p className="mt-4 text-xs">下記のとおりお見積り申し上げます。</p>
            <table className="mt-3 text-xs">
              <tbody>
                <tr>
                  <td className="pr-3 text-gray-600">初期費用（税込）</td>
                  <td className="text-lg font-bold">{yen(t.totalBuild)}</td>
                </tr>
                <tr>
                  <td className="pr-3 text-gray-600">月額費用（税込）</td>
                  <td className="text-lg font-bold">{yen(t.totalMonthly)}／月</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-right text-xs">
            <p>見積番号: {q.quote_no}（v{q.version}）</p>
            <p>発行日: {issue}</p>
            <p>有効期限: {validUntil}</p>
            <p className="mt-4 text-base font-bold">{st?.issuer_name ?? "株式会社YOZAN"}</p>
            {st?.issuer_address && <p>{st.issuer_address}</p>}
            {st?.issuer_tel && <p>TEL: {st.issuer_tel}</p>}
            {st?.issuer_email && <p>{st.issuer_email}</p>}
            <p className="mt-2">担当: {q.created_by}</p>
          </div>
        </div>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-400 px-2 py-2 text-left">品名・仕様</th>
              <th className="border border-gray-400 px-2 py-2 w-16 text-center">数量</th>
              <th className="border border-gray-400 px-2 py-2 w-28 text-right">初期費用</th>
              <th className="border border-gray-400 px-2 py-2 w-28 text-right">月額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="border border-gray-400 px-2 py-2">
                  {r.name}
                  {r.desc && <span className="block text-[11px] text-gray-500">{r.desc}</span>}
                </td>
                <td className="border border-gray-400 px-2 py-2 text-center">{r.qty}</td>
                <td className="border border-gray-400 px-2 py-2 text-right">{r.build ? yen(r.build) : "—"}</td>
                <td className="border border-gray-400 px-2 py-2 text-right">{r.monthly ? yen(r.monthly) : "—"}</td>
              </tr>
            ))}
            <tr>
              <td className="border border-gray-400 px-2 py-2 text-right font-medium" colSpan={2}>小計（税抜）</td>
              <td className="border border-gray-400 px-2 py-2 text-right">{yen(t.subtotalBuild)}</td>
              <td className="border border-gray-400 px-2 py-2 text-right">{yen(t.subtotalMonthly)}</td>
            </tr>
            {(q.discount_build > 0 || q.discount_monthly > 0) && (
              <tr>
                <td className="border border-gray-400 px-2 py-2 text-right font-medium" colSpan={2}>値引</td>
                <td className="border border-gray-400 px-2 py-2 text-right">-{yen(q.discount_build)}</td>
                <td className="border border-gray-400 px-2 py-2 text-right">-{yen(q.discount_monthly)}</td>
              </tr>
            )}
            <tr>
              <td className="border border-gray-400 px-2 py-2 text-right font-medium" colSpan={2}>消費税（{taxPct}%）</td>
              <td className="border border-gray-400 px-2 py-2 text-right">{yen(t.taxBuild)}</td>
              <td className="border border-gray-400 px-2 py-2 text-right">{yen(t.taxMonthly)}</td>
            </tr>
            <tr className="bg-gray-100 font-bold">
              <td className="border border-gray-400 px-2 py-2 text-right" colSpan={2}>合計（税込）</td>
              <td className="border border-gray-400 px-2 py-2 text-right">{yen(t.totalBuild)}</td>
              <td className="border border-gray-400 px-2 py-2 text-right">{yen(t.totalMonthly)}／月</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-4 rounded border border-gray-300 bg-gray-50 p-3 text-xs">
          <p>ご契約時のお支払い（初期費用＋初月分・税込）: <b>{yen(t.firstPayment)}</b></p>
          <p>初年度合計（初期費用＋月額12か月・税込）: <b>{yen(t.yearOne)}</b></p>
        </div>

        {q.note && (
          <p className="mt-4 text-xs">
            <span className="font-medium">備考: </span>
            {q.note}
          </p>
        )}
        {st?.issuer_note && <p className="mt-3 text-xs whitespace-pre-line">{st.issuer_note}</p>}
        {st?.footer_note && <p className="mt-3 text-[11px] text-gray-500 whitespace-pre-line">{st.footer_note}</p>}
      </div>
    </main>
  );
}
