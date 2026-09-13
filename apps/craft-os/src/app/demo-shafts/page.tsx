import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { getDemoShaftStats, listDemoShafts } from "@/lib/craft";
import { yenPlain } from "@/lib/format";
import { Badge, cardCls, inputCls, SectionTitle } from "@/components/ui";
import { TopNav } from "@/components/nav";
import { LinkRow } from "./link-row";
import { updateDemoShaft } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  matched: "紐づけ済み（自動）",
  manual: "紐づけ済み（手動）",
  needs_review: "候補が複数",
  unmatched: "未一致",
  no_product: "マスタに登録しない",
};

export default async function DemoShaftsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const actor = await requireActor();
  const sp = await searchParams;
  const status = sp.status ?? null;
  const [stats, rows] = await Promise.all([
    getDemoShaftStats(actor),
    listDemoShafts(actor, { status, q: sp.q ?? null, limit: 300 }),
  ]);

  const review = status === "unmatched" || status === "needs_review";

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">YOZAN</p>
        <h1 className="text-2xl font-bold tracking-widest">試打シャフト台帳</h1>
        <p className="mt-1 text-sm text-(--color-dim)">
          ラックの試打NOと商品マスタの紐づけ。ここが繋がっているから、表紙も見積も定価を持たなくて済みます。
        </p>
      </header>

      <TopNav active="demo" />

      <section className={`${cardCls} mb-6`}>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["全部", stats.total, null],
            ["紐づけ済み", stats.matched, "matched"],
            ["候補が複数", stats.needsReview, "needs_review"],
            ["未一致", stats.unmatched, "unmatched"],
            ["棚番号なし", stats.noShelf, null],
            ["廃盤", stats.haiban, null],
          ].map(([label, n, s]) => (
            <div key={String(label)}>
              <p className="text-xs text-(--color-dim)">{String(label)}</p>
              {s ? (
                <Link href={`/demo-shafts?status=${s}`} className="text-2xl font-bold text-(--color-accent) underline">
                  {Number(n)}
                </Link>
              ) : (
                <p className="text-2xl font-bold">{Number(n)}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className={cardCls}>
        <SectionTitle
          right={
            <form className="flex gap-2">
              <input name="q" defaultValue={sp.q ?? ""} placeholder="試打NO・シャフト名" className={`${inputCls} w-56 px-2 py-1 text-xs`} />
              <select name="status" defaultValue={status ?? ""} className={`${inputCls} w-44 px-2 py-1 text-xs`}>
                <option value="">すべて</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button className="rounded-lg border border-(--color-line) px-3 text-xs">絞る</button>
            </form>
          }
        >
          {status ? STATUS_LABELS[status] ?? status : "一覧"}（{rows.length}件）
        </SectionTitle>

        {review ? (
          <div className="space-y-3">
            {rows.map((r) => (
              <LinkRow
                key={r.id}
                demoNo={r.demo_no}
                name={r.import_name ?? ""}
                maker={r.import_maker ?? ""}
                clubType={r.club_type}
                price={r.import_price == null ? null : Number(r.import_price)}
              />
            ))}
            {rows.length === 0 && <p className="py-8 text-center text-sm text-(--color-dim)">確認待ちはありません。</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                  <th className="py-2 pr-2">試打NO</th>
                  <th className="py-2 pr-2">商品マスタの名前</th>
                  <th className="py-2 pr-2">メーカー</th>
                  <th className="py-2 pr-2">番手</th>
                  <th className="py-2 pr-2 text-right">定価（マスタ）</th>
                  <th className="py-2 pr-2 text-right">Excelの定価</th>
                  <th className="py-2 pr-2">棚</th>
                  <th className="py-2 pr-2">状態</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const master = r.product?.list_price ?? null;
                  const excel = r.import_price == null ? null : Number(r.import_price);
                  const diff = master != null && excel != null && master !== excel;
                  return (
                    <tr key={r.id} className="border-b border-(--color-line) last:border-0">
                      <td className="py-2 pr-2 font-mono text-xs">{r.demo_no}</td>
                      <td className="py-2 pr-2">
                        {r.product ? (
                          <>
                            {r.product.name}
                            {r.product.spec ? ` ${r.product.spec}` : ""}
                          </>
                        ) : (
                          <span className="text-(--color-dim)">{r.import_name}</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-xs text-(--color-dim)">{r.product?.manufacturer ?? r.import_maker}</td>
                      <td className="py-2 pr-2 text-xs">{r.club_type}</td>
                      <td className="py-2 pr-2 text-right">{master == null ? "—" : yenPlain(master)}</td>
                      <td className={`py-2 pr-2 text-right text-xs ${diff ? "font-bold text-amber-700" : "text-(--color-dim)"}`}>
                        {excel == null ? "—" : yenPlain(excel)}
                      </td>
                      <td className="py-2 pr-2 text-xs">{r.shelf ?? "—"}</td>
                      <td className="py-2 pr-2">
                        <Badge tone={r.match_status === "unmatched" || r.match_status === "needs_review" ? "warn" : r.status === "廃盤" ? "gray" : "ok"}>
                          {r.status === "廃盤" ? "廃盤" : STATUS_LABELS[r.match_status] ?? r.match_status}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <form action={updateDemoShaft} className="flex items-center gap-1">
                          <input type="hidden" name="demo_no" value={r.demo_no} />
                          <input name="shelf" defaultValue={r.shelf ?? ""} placeholder="棚" className="w-14 rounded border border-(--color-line) px-1 py-0.5 text-xs" />
                          <select name="status" defaultValue={r.status} className="rounded border border-(--color-line) px-1 py-0.5 text-xs">
                            {["在庫", "廃盤", "貸出中", "紛失"].map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <input type="hidden" name="note" value={r.note ?? ""} />
                          <button className="rounded border border-(--color-line) px-1.5 py-0.5 text-xs">保存</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length >= 300 && (
          <p className="mt-3 text-xs text-(--color-dim)">300件まで表示しています。上の検索で絞ってください。</p>
        )}
      </section>

      <p className="mt-4 text-xs text-(--color-dim)">
        オレンジ色の「Excelの定価」は、商品マスタと食い違っている行です。正しいのは商品マスタ側（発注管理で保守）です。
      </p>
    </main>
  );
}
