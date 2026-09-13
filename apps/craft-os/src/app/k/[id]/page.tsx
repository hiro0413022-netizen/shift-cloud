import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getKarte, QUOTE_STATUS_LABELS } from "@/lib/craft";
import { dateShort, yen, yenPlain } from "@/lib/format";
import { Badge, cardCls, Empty, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * お客様カルテ。
 * 「前はどのシャフトを何インチで組んだか」を紙のファイルから探していたのをやめるための画面。
 * 新しく作るデータは無い。表紙・伝票・工房にあるものを、お客様1人ぶんに集めているだけ。
 */
export default async function KartePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const k = await getKarte(actor, id);
  if (!k) notFound();

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <Link href="/" className="text-xs text-(--color-dim) hover:underline">
          ← 一覧へ
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{k.customerName} 様</h1>
        <p className="mt-1 text-sm text-(--color-dim)">
          フィッティング {k.fittings.length}回 ／ 伝票 {k.quotes.length}件 ／ お買い上げ合計 {yen(k.totalSpend)}
          {k.guest?.phone || k.guest?.mobile ? ` ／ ${k.guest.mobile ?? k.guest.phone}` : ""}
        </p>
      </header>

      <section className={`${cardCls} mb-6`}>
        <SectionTitle>組み上がりの実測</SectionTitle>
        {k.builds.length === 0 ? (
          <Empty title="実測の記録はまだありません" hint="工房で組み上がりの数値を入れると、ここに残ります" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                  <th className="py-2 pr-3">組立日</th>
                  <th className="py-2 pr-3">伝票</th>
                  <th className="py-2 pr-3">ヘッド</th>
                  <th className="py-2 pr-3">長さ</th>
                  <th className="py-2 pr-3">総重量</th>
                  <th className="py-2 pr-3">バランス</th>
                  <th className="py-2 pr-3">振動数</th>
                  <th className="py-2">グリップ／スリーブ</th>
                </tr>
              </thead>
              <tbody>
                {k.builds.map((b) => (
                  <tr key={b.id} className="border-b border-(--color-line) last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap text-(--color-dim)">{dateShort(b.assembled_on)}</td>
                    <td className="py-2 pr-3 text-xs text-(--color-dim)">{b.quote_no}</td>
                    <td className="py-2 pr-3">{b.head_name ?? "—"}</td>
                    <td className="py-2 pr-3">{b.actual_length ?? "—"}</td>
                    <td className="py-2 pr-3">{b.actual_weight ?? "—"}</td>
                    <td className="py-2 pr-3">{b.actual_balance ?? "—"}</td>
                    <td className="py-2 pr-3">{b.actual_cpm ?? "—"}</td>
                    <td className="py-2 text-xs text-(--color-dim)">
                      {b.grip_layers ?? "—"}
                      {b.grip_wrap ? `／${b.grip_wrap}` : ""}
                      {b.sleeve_source ? `／${b.sleeve_source}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-(--color-dim)">
          目標値ではなく、実際に組み上がった数値です。同じ感触で作り直すときはこちらを見てください。
        </p>
      </section>

      <section className={`${cardCls} mb-6`}>
        <SectionTitle>お買い上げ</SectionTitle>
        {k.purchases.length === 0 ? (
          <Empty title="まだありません" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                  <th className="py-2 pr-3">日付</th>
                  <th className="py-2 pr-3">伝票</th>
                  <th className="py-2 pr-3">区分</th>
                  <th className="py-2 pr-3">商品</th>
                  <th className="py-2 pr-3">メーカー</th>
                  <th className="py-2 pr-3">仕上げ</th>
                  <th className="py-2 text-right">金額</th>
                </tr>
              </thead>
              <tbody>
                {k.purchases.map((p) => (
                  <tr key={p.id} className="border-b border-(--color-line) last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap text-(--color-dim)">{dateShort(p.quote_date)}</td>
                    <td className="py-2 pr-3 text-xs">
                      <Link href={`/q/${p.quote_id}/quote`} className="text-(--color-accent) underline">
                        {p.quote_no}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-xs text-(--color-dim)">{p.item_category ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {p.product_name}
                      {p.spec ? ` ${p.spec}` : ""}
                      {p.club_type ? <span className="ml-1 text-xs text-(--color-dim)">{p.club_type}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-xs text-(--color-dim)">{p.manufacturer ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs">{p.finish_length_inch ? `${p.finish_length_inch}inch` : "—"}</td>
                    <td className="py-2 text-right">{yenPlain(Number(p.amount ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className={cardCls}>
          <SectionTitle>採用した試打シャフト</SectionTitle>
          {k.picked.length === 0 ? (
            <Empty title="まだありません" />
          ) : (
            <ul className="space-y-2 text-sm">
              {k.picked.map((t) => (
                <li key={t.id} className="border-b border-(--color-line) pb-2 last:border-0">
                  <div>
                    {t.product?.manufacturer} {t.product?.name}
                    {t.product?.spec ? ` ${t.product.spec}` : ""}
                  </div>
                  <div className="text-xs text-(--color-dim)">
                    {dateShort(t.fitting_date)} ／ 試打 {t.demo_no} ／ {t.head_name ?? "ヘッド未記入"}
                    {t.memo ? ` ／ ${t.memo}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cardCls}>
          <SectionTitle>これまでの表紙と伝票</SectionTitle>
          <ul className="space-y-2 text-sm">
            {k.fittings.map((f) => (
              <li key={`f${f.id}`} className="flex items-center justify-between gap-2">
                <Link href={`/f/${f.id}`} className="text-(--color-accent) underline">
                  {f.fitting_no}
                </Link>
                <span className="text-xs text-(--color-dim)">
                  {dateShort(f.fitting_date)} ／ {f.fitting_menu ?? "—"}
                  {f.fitting_minutes ? `（${f.fitting_minutes}分）` : ""}
                </span>
              </li>
            ))}
            {k.quotes.map((q) => (
              <li key={`q${q.id}`} className="flex items-center justify-between gap-2">
                <Link href={`/q/${q.id}/quote`} className="text-(--color-accent) underline">
                  {q.quote_no}
                </Link>
                <span className="flex items-center gap-2 text-xs text-(--color-dim)">
                  {dateShort(q.quote_date)} ／ {yen(q.total)}
                  <Badge tone={q.status === "draft" ? "gray" : q.status === "void" ? "danger" : "ok"}>
                    {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
