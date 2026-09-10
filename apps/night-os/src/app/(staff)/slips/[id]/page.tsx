import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, Yen } from "@/components/ui";
import { getActiveRules, getSlip, listCasts, resolveNightStore } from "@/lib/night";
import { closeSlip } from "../../floor/actions";
import { setItemCast, voidItem } from "./actions";
import { AddPanel } from "./add-panel";
import { BroughtBy } from "./brought-by";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  set: "セット",
  extend: "延長",
  nomination: "本指名",
  inhouse_nomination: "場内指名",
  douhan: "同伴",
  cast_drink: "ドリンク",
  bottle: "ボトル",
  food: "フード",
  other: "その他",
};

export default async function SlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await resolveNightStore();
  if (!store) notFound();
  const { rules } = await getActiveRules(store.id);
  const [slip, casts] = await Promise.all([getSlip(id, rules), listCasts(store.id)]);
  if (!slip) notFound();

  const elapsed = Math.max(0, Math.floor((Date.now() - new Date(slip.openedAt).getTime()) / 60000));
  const castOptions = casts.map((c) => ({ id: c.id, displayName: c.displayName }));

  return (
    <main className="flex min-h-[calc(100vh-57px)] flex-col lg:flex-row">
      {/* 明細 */}
      <section className="w-full shrink-0 p-4 lg:w-[480px]">
        <div className="mb-3 flex items-center gap-3">
          <Link href="/floor" className="text-sm text-(--color-dim)">
            ← フロア
          </Link>
          <span className="mn text-xl font-bold">{slip.tableCode}</span>
          <span className="text-xs text-(--color-dim)">
            {slip.guests}名 ・ {elapsed}分経過
          </span>
          {slip.status === "closed" && <Chip tone="plain">会計済</Chip>}
        </div>

        <div className="mb-2 flex items-center">
          <span className="text-xs font-bold">伝票明細</span>
          <div className="grow" />
          <span className="text-[10px] text-(--color-dim)">金額のとなりはキャストバック</span>
        </div>

        <div className="mb-3 overflow-hidden rounded-xl border border-(--color-line) bg-white">
          {slip.items.length === 0 && <p className="p-4 text-xs text-(--color-mute)">まだ明細がありません。</p>}
          {slip.items.map((i) => (
            <div
              key={i.id}
              className={`border-b border-(--color-panel-2) p-3 last:border-b-0 ${i.status === "void" ? "bg-(--color-bg)" : ""}`}
            >
              <div className="flex items-start gap-2">
                <div className="grow">
                  <div className={`text-[13px] font-medium ${i.status === "void" ? "text-(--color-mute) line-through" : ""}`}>
                    {i.label}
                    {i.qty > 1 && ` × ${i.qty}`}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Chip>{KIND_LABEL[i.kind] ?? i.kind}</Chip>
                    {i.castName ? (
                      <Chip tone="accent">{i.castName}</Chip>
                    ) : (
                      ["nomination", "inhouse_nomination", "douhan", "cast_drink", "bottle"].includes(i.kind) &&
                      i.status === "active" && <Chip tone="warn">担当を選んでください</Chip>
                    )}
                    {i.status === "void" && <Chip tone="plain">取消</Chip>}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${i.status === "void" ? "text-(--color-mute) line-through" : ""}`}>
                    <Yen value={i.amount} />
                  </div>
                  {i.backAmount > 0 && (
                    <div className="mt-0.5 text-[10px] text-(--color-gold)">
                      バック <Yen value={i.backAmount} />
                    </div>
                  )}
                </div>
              </div>

              {i.status === "active" && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {["nomination", "inhouse_nomination", "douhan", "cast_drink", "bottle"].includes(i.kind) &&
                    castOptions.map((c) => (
                      <form action={setItemCast} key={c.id}>
                        <input type="hidden" name="itemId" value={i.id} />
                        <input type="hidden" name="slipId" value={slip.id} />
                        <input type="hidden" name="castId" value={c.id} />
                        <button
                          className={`min-h-8 rounded-full px-2.5 text-[10px] ${
                            i.castId === c.id
                              ? "bg-(--color-accent) text-white"
                              : "border border-(--color-line) text-(--color-dim)"
                          }`}
                        >
                          {c.displayName}
                        </button>
                      </form>
                    ))}
                  <div className="grow" />
                  <form action={voidItem}>
                    <input type="hidden" name="itemId" value={i.id} />
                    <input type="hidden" name="slipId" value={slip.id} />
                    <button className="min-h-8 rounded-full border border-(--color-line) px-2.5 text-[10px] text-(--color-dim)">
                      取消
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mb-3">
          <BroughtBy
            slipId={slip.id}
            casts={castOptions}
            currentCastId={slip.broughtByCastId}
            currentKind={slip.broughtKind}
            currentName={slip.broughtByName}
          />
        </div>

        <div className="rounded-xl border border-(--color-line) bg-white p-3.5">
          <div className="mb-1 flex items-baseline justify-between text-[11px] text-(--color-dim)">
            <span>
              小計 / サービス料 {Math.round(slip.totals.serviceRate * 100)}% / 税
            </span>
            <span className="text-(--color-txt)">
              <Yen value={slip.totals.subtotal} /> / <Yen value={slip.totals.serviceCharge} /> /{" "}
              <Yen value={slip.totals.tax} />
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-bold">お会計</span>
            <span className="mn text-[28px] font-bold">
              <Yen value={slip.totals.total} />
            </span>
          </div>

          {slip.status === "open" && (
            <form action={closeSlip} className="mt-3 flex gap-2">
              <input type="hidden" name="slipId" value={slip.id} />
              <select name="paymentMethod" className="min-h-12 rounded-lg border border-(--color-line) px-3 text-sm">
                <option value="cash">現金</option>
                <option value="card">カード</option>
                <option value="transfer">振込</option>
                <option value="other">その他</option>
              </select>
              <button
                disabled={slip.missingCastCount > 0}
                className="min-h-12 grow rounded-lg bg-(--color-txt) text-sm font-bold text-white disabled:opacity-40"
              >
                {slip.missingCastCount > 0 ? `担当が ${slip.missingCastCount}件 未入力` : "お会計にする"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* 追加パネル */}
      <section className="grow border-t border-(--color-line) bg-white p-4 lg:border-l lg:border-t-0">
        {slip.status === "open" ? (
          <AddPanel
            slipId={slip.id}
            casts={castOptions}
            drinks={rules.drinks}
            tiers={rules.bottleTiers}
            prices={{
              nomination: rules.price.nomination,
              inhouseNomination: rules.price.inhouseNomination,
              douhan: rules.price.douhan,
              extendPerGuest: rules.price.extendPerGuest,
              extendMinutes: rules.price.extendMinutes,
            }}
            nominationBack={rules.nominationBack}
          />
        ) : (
          <p className="text-sm text-(--color-dim)">この伝票は会計済みです。</p>
        )}

        <div className="mt-4 flex items-start gap-2 rounded-lg bg-(--color-bg) p-3">
          <span className="text-[10px] leading-relaxed text-(--color-dim)">
            追加・取り消しはすべて履歴に残ります。取り消しても明細からは消えず「取消」として残るので、後から誰が何を触ったかが分かります。
          </span>
        </div>
      </section>
    </main>
  );
}
