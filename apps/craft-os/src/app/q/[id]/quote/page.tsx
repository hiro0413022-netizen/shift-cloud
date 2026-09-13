import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getFitting, getLaborRates, getQuote, listSalesPostings, refundBreakdown, QUOTE_STATUS_LABELS } from "@/lib/craft";
import { dateJa } from "@/lib/format";
import { btnCls, btnGhostCls, cardCls, inputCls, SectionTitle } from "@/components/ui";
import { QuoteNav } from "@/components/nav";
import { issueQuoteDoc, markReviewed, postSalesNow, setStatus } from "../actions";
import { QuoteSheet, type LaborOption, type SheetRow, type TrialOption } from "./sheet";

export const dynamic = "force-dynamic";

/** 帳票の発行元。印刷側（/print）と同じものを出す */
const ISSUER = "株式会社ファイン";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const full = await getQuote(actor, Number(id));
  if (!full) notFound();
  const { quote: q, items, priced } = full;

  const [labor, cover, postings] = await Promise.all([
    getLaborRates(actor),
    full.fitting ? getFitting(actor, full.fitting.id, { withQuotes: false }) : Promise.resolve(null),
    listSalesPostings(actor, Number(id)),
  ]);
  const refund = refundBreakdown(full);
  const isOwnQuote = q.created_by === actor.staffId;

  const rows: SheetRow[] = items.map((it, i) => {
    const p = priced.items[i];
    return {
      id: it.id,
      demoNo: it.demo_no,
      kind: it.club_type ?? it.item_category ?? "",
      name: `${it.product_name}${it.spec ? ` ${it.spec}` : ""}`,
      maker: it.manufacturer ?? "",
      listPrice: Number(it.list_price ?? 0),
      discountAmount: Number(p?.discountAmount ?? 0),
      discountReason: p?.discountReason ?? "",
      quantity: Number(it.quantity ?? 1),
      amount: Number(p?.amount ?? 0),
      rate: p?.rate ?? null,
      manual: Boolean(it.discount_manual),
      reason: it.discount_reason,
      finishInch: it.finish_length_inch,
      isShaft: it.line_kind === "product" && it.item_category === "シャフト",
    };
  });

  const laborOptions: LaborOption[] = labor.map((r) => ({
    code: r.code,
    name: r.name,
    section: r.quote_section,
    price: r.price,
    priceNote: r.price_note,
  }));

  const trials: TrialOption[] = (cover?.trials ?? [])
    .filter((t) => t.product)
    .map((t) => ({
      id: t.id,
      demoNo: t.demo_no,
      maker: t.product?.manufacturer ?? "",
      name: `${t.product?.name ?? ""}${t.product?.spec ? ` ${t.product.spec}` : ""}`,
      listPrice: t.product?.list_price ?? null,
    }));

  return (
    <>
      <QuoteNav id={id} active="quote" />

      <div className="no-print mb-3 flex flex-wrap justify-end gap-2">
        <Link href={`/print/order/${id}`} className="rounded-lg bg-(--color-accent) px-3 py-1.5 text-xs font-medium text-white">
          御注文書を印刷
        </Link>
        <Link href={`/print/quote/${id}`} className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-xs">
          御見積書を印刷
        </Link>
      </div>

      <QuoteSheet
        quoteId={q.id}
        quoteNo={q.quote_no}
        customerName={q.customer_name}
        quoteDate={dateJa(q.quote_date)}
        issuer={ISSUER}
        staffName={q.staff_name ?? ""}
        subject={q.subject}
        deliveryNote={q.delivery_note}
        paymentTerms={q.payment_terms}
        validityNote={q.validity_note}
        note={q.note ?? ""}
        rows={rows}
        totals={{
          subtotal: priced.totals.subtotal,
          tax: priced.totals.tax,
          taxFree: priced.totals.taxFree,
          refund: priced.totals.refund,
          prepaid: priced.totals.prepaid,
          total: priced.totals.total,
          taxPct: Math.round(Number(q.tax_rate) * 100),
        }}
        taxFreeAmount={Number(q.tax_free_amount)}
        prepaidAmount={Number(q.prepaid_amount)}
        refundAuto={q.refund_auto}
        refundAmount={Number(q.refund_amount)}
        refundNote={q.refund_note ?? ""}
        refundLines={[
          `DR ${refund.counts.DR ?? 0}本／FW ${refund.counts.FW ?? 0}本／UT ${refund.counts.UT ?? 0}本`,
          ...refund.breakdown,
        ]}
        refundAvailable={Boolean(full.fitting?.fitting_minutes)}
        labor={laborOptions}
        trials={trials}
        fittingId={full.fitting?.id ?? null}
        fittingNo={full.fitting?.fitting_no ?? null}
      />

      <section className={`${cardCls} no-print mt-6`}>
        <SectionTitle>社内チェックと状態</SectionTitle>
        <div className="flex flex-wrap items-center gap-3">
          {q.reviewed_at ? (
            <p className="text-sm text-(--color-ok)">
              社内確認済み（{new Date(q.reviewed_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}）
            </p>
          ) : (
            <form action={markReviewed}>
              <input type="hidden" name="quote_id" value={q.id} />
              <button className={btnGhostCls} disabled={isOwnQuote}>
                {isOwnQuote ? "ご自身の伝票は確認できません" : "内容を確認しました"}
              </button>
            </form>
          )}
          <form action={setStatus} className="flex items-end gap-2">
            <input type="hidden" name="quote_id" value={q.id} />
            <select name="status" defaultValue={q.status} className={`${inputCls} w-44`}>
              {["draft", "presented", "accepted", "void"].map((s) => (
                <option key={s} value={s}>
                  {QUOTE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button className={btnGhostCls}>状態を変える</button>
          </form>
          {q.quote_issued_at ? (
            <p className="text-xs text-(--color-dim)">
              御見積書 発行済み（{new Date(q.quote_issued_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}）
            </p>
          ) : (
            <form action={issueQuoteDoc}>
              <input type="hidden" name="quote_id" value={q.id} />
              <button className={btnGhostCls}>御見積書を出した</button>
            </form>
          )}
          {postings.length > 0 ? (
            <p className="text-xs text-(--color-ok)">
              売上計上済み（{postings.length}行・
              {new Date(postings[0].posted_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}）
            </p>
          ) : items.length > 0 && !full.work ? (
            <form action={postSalesNow}>
              <input type="hidden" name="quote_id" value={q.id} />
              <button className={btnGhostCls}>売上を計上する</button>
            </form>
          ) : null}
          <Link href={`/q/${id}/work`} className={btnCls}>
            注文書・工房へ
          </Link>
        </div>
        <p className="mt-3 text-xs text-(--color-dim)">
          「お客様にお渡しする前に、必ず他のスタッフのチェックを受けてから提示」— 誰がいつ確認したかを残します。
          御見積書は出しても出さなくても構いません。工房を通す伝票は、お渡し日を入れた時点で売上が Money OS に入ります。
        </p>
      </section>
    </>
  );
}
