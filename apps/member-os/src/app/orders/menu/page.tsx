import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank } from "@/lib/store-scope";
import { createAdmin } from "@/lib/supabase/admin";
import { toggleSoldOut, toggleActive, updatePrice } from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/**
 * メニュー管理（#155）
 *
 * モバイルオーダーに出す品目・価格・売り切れをここで管理する。
 * ⚠ 価格は **Squareのカタログと同じ値に保つこと**。片方だけ直すと、
 *   店頭レジで打つ金額とスマホ注文の金額がズレる（Square側は scripts/frank-square-setup.mjs）。
 */
export default async function MenuPage() {
  const actor = await requireReceptionActor();
  if (!canAccessFrank(actor)) notFound();

  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_menu_items")
    .select("id, category, name, price_general, price_member, sold_out, active")
    .eq("company_id", actor.companyId).is("deleted_at", null)
    .order("sort", { ascending: true });

  const items = (data ?? []) as Row[];
  const groups = new Map<string, Row[]>();
  for (const it of items) {
    const c = s(it.category);
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push(it);
  }
  const soldOut = items.filter((i) => i.sold_out).length;

  return (
    <main className="mx-auto max-w-4xl px-5 py-6">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">FRANK GOLF</p>
          <h1 className="text-2xl font-bold tracking-wide">メニュー管理</h1>
          <p className="text-xs text-(--color-dim)">
            {items.length}品 ／ 売り切れ {soldOut}品 ・ 価格は税込
          </p>
        </div>
        <Link href="/orders" className="text-sm text-(--color-dim) underline underline-offset-4">← 電子伝票</Link>
      </header>

      <p className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
        価格を変えたら <strong>Square のカタログも同じ値に直してください</strong>。
        片方だけだと、店頭レジで打つ金額とスマホ注文の金額がズレます。<br />
        価格の変更が影響するのは<strong>これから注文される分だけ</strong>です（過去の伝票は注文時点の金額のまま残ります）。
      </p>

      {[...groups.entries()].map(([cat, rows]) => (
        <section key={cat} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-gold)">{cat}</h2>
          <div className="space-y-1.5">
            {rows.map((it) => {
              const id = s(it.id);
              const isSoldOut = Boolean(it.sold_out);
              const isActive = it.active !== false;
              return (
                <div
                  key={id}
                  className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
                    !isActive ? "border-(--color-line) bg-(--color-panel-2) opacity-50"
                    : isSoldOut ? "border-amber-300 bg-amber-50" : "border-(--color-line) bg-(--color-panel)"
                  }`}
                >
                  <span className="min-w-[9rem] flex-1 text-sm font-medium">{s(it.name)}</span>

                  <form action={updatePrice} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={id} />
                    <label className="text-[11px] text-(--color-dim)">一般</label>
                    <input name="price_general" type="number" min={0} defaultValue={n(it.price_general)}
                      className="w-20 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm tabular-nums" />
                    <label className="text-[11px] text-(--color-dim)">会員</label>
                    <input name="price_member" type="number" min={0} defaultValue={n(it.price_member)}
                      className="w-20 rounded-lg border border-(--color-line) bg-white px-2 py-1.5 text-sm tabular-nums" />
                    <button className="rounded-lg border border-(--color-line) bg-white px-2.5 py-1.5 text-xs">保存</button>
                  </form>

                  <form action={toggleSoldOut}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="to" value={isSoldOut ? "0" : "1"} />
                    <button className={`rounded-lg px-3 py-1.5 text-xs ${isSoldOut ? "bg-amber-600 text-white" : "border border-(--color-line) bg-white text-(--color-dim)"}`}>
                      {isSoldOut ? "売り切れ中" : "売り切れにする"}
                    </button>
                  </form>

                  <form action={toggleActive}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="to" value={isActive ? "0" : "1"} />
                    <button className="rounded-lg border border-(--color-line) bg-white px-2.5 py-1.5 text-xs text-(--color-dim)">
                      {isActive ? "メニューから外す" : "メニューに戻す"}
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
