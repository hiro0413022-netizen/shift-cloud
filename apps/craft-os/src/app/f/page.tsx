import Link from "next/link";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { FITTING_MENUS, listFittings } from "@/lib/craft";
import { dateShort, yen } from "@/lib/format";
import { btnCls, cardCls, Empty, inputCls, labelCls, SectionTitle } from "@/components/ui";
import { TopNav } from "@/components/nav";
import { GuestPicker } from "@/components/guest-picker";
import { createFitting } from "../actions";

export const dynamic = "force-dynamic";

export default async function FittingsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const rows = await listFittings(actor, { q: sp.q ?? null });

  const admin = createAdmin();
  const [{ data: stores }, { data: staff }] = await Promise.all([
    admin.from("stores").select("id, name").eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null).order("name"),
    admin.from("staff").select("id, name").eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null).order("sort_order"),
  ]);
  const visibleStores = ((stores ?? []) as { id: string; name: string }[]).filter(
    (s) => actor.isOwner || actor.storeIds.includes(s.id)
  );
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">YOZAN</p>
          <h1 className="text-2xl font-bold tracking-widest">フィッティング表紙</h1>
          <p className="mt-1 text-sm text-(--color-dim)">お客様にお渡しする紙。伝票はここから何件でも作れます</p>
        </div>
        <form action="/api/logout" method="post">
          <button className="text-sm text-(--color-dim) hover:text-(--color-txt)">{actor.name} — ログアウト</button>
        </form>
      </header>

      <TopNav active="fittings" />

      <section className={`${cardCls} mb-6`}>
        <SectionTitle>フィッティングを始める</SectionTitle>
        <form action={createFitting} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <GuestPicker />
            <label className="block">
              <span className={labelCls}>ご連絡先（任意）</span>
              <input name="customer_contact" className={inputCls} placeholder="お電話・メールなど" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>実施日</span>
              <input type="date" name="fitting_date" defaultValue={today} className={inputCls} />
            </label>
            <label className="block">
              <span className={labelCls}>担当フィッター</span>
              <input name="fitter_name" list="fitters" className={inputCls} placeholder="例: 井殿" />
              <datalist id="fitters">
                {((staff ?? []) as { id: string; name: string }[]).map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className={labelCls}>お客様区分</span>
              <select name="member_kind" className={inputCls} defaultValue="ビジター">
                <option value="会員">会員</option>
                <option value="ビジター">ビジター</option>
                <option value="スタッフ">スタッフ</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>割引区分</span>
              <select name="segment" className={inputCls} defaultValue="visitor_no_fitting">
                <option value="visitor_no_fitting">フィッティング歴なし（一見のお客様）</option>
                <option value="visitor_or_intro">フィッティング歴あり／プロ紹介／再フィッティング／旧会員</option>
                <option value="member_paid_fitting">フィッティング料をお支払いの会員</option>
                <option value="from_demo_or_lesson">試打からのご購入／レッスン時のご購入</option>
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>メニュー</span>
              <select name="fitting_menu" className={inputCls} defaultValue="">
                <option value="">（選択）</option>
                {FITTING_MENUS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>フィッティング料</span>
              <select name="fitting_minutes" className={inputCls} defaultValue="">
                <option value="">なし</option>
                <option value="110">110分（22,000円）</option>
                <option value="55">55分（16,500円）</option>
              </select>
            </label>
            {visibleStores.length > 1 && (
              <label className="block sm:col-span-2">
                <span className={labelCls}>店舗</span>
                <select name="store_id" className={inputCls} defaultValue={actor.primaryStoreId ?? ""}>
                  <option value="">（会社全体）</option>
                  {visibleStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="sm:col-span-2">
              <button className={btnCls}>表紙をつくる</button>
            </div>
          </div>
        </form>
      </section>

      <section className={cardCls}>
        <SectionTitle
          right={
            <form className="flex gap-2">
              <input name="q" defaultValue={sp.q ?? ""} placeholder="お客様名で絞る" className={`${inputCls} w-48`} />
              <button className="rounded-lg border border-(--color-line) px-3 text-sm">絞る</button>
            </form>
          }
        >
          表紙（{rows.length}件）
        </SectionTitle>

        {rows.length === 0 ? (
          <Empty title="まだ1件もありません" hint="上の「フィッティングを始める」から作ってください" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                  <th className="py-2 pr-3">番号</th>
                  <th className="py-2 pr-3">お客様</th>
                  <th className="py-2 pr-3">実施日</th>
                  <th className="py-2 pr-3">担当</th>
                  <th className="py-2 pr-3">メニュー</th>
                  <th className="py-2 pr-3 text-right">伝票</th>
                  <th className="py-2 text-right">返金済み</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id} className="border-b border-(--color-line) last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Link href={`/f/${f.id}`} className="font-medium text-(--color-accent) underline">
                        {f.fitting_no}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{f.customer_name} 様</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-(--color-dim)">{dateShort(f.fitting_date)}</td>
                    <td className="py-2 pr-3 text-(--color-dim)">{f.fitter_name ?? "—"}</td>
                    <td className="py-2 pr-3 text-(--color-dim)">
                      {f.fitting_menu ?? "—"}
                      {f.fitting_minutes ? `（${f.fitting_minutes}分）` : ""}
                    </td>
                    <td className="py-2 pr-3 text-right">{f.quoteCount > 0 ? `${f.quoteCount}件` : "—"}</td>
                    <td className="py-2 text-right">{f.refundUsed > 0 ? yen(f.refundUsed) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
