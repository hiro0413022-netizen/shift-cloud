import Link from "next/link";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { getDemoShaftStats, listQuotes, QUOTE_STATUS_LABELS, FITTING_MENUS, WORK_STEPS } from "@/lib/craft";
import { dateShort, yen } from "@/lib/format";
import { Badge, btnCls, cardCls, Empty, inputCls, labelCls } from "@/components/ui";
import { TopNav } from "@/components/nav";
import { GuestPicker } from "@/components/guest-picker";
import { createQuote } from "./actions";

export const dynamic = "force-dynamic";

/** 工房の進捗バー。紙の注文書 最終行（発注→到着→組立→REVE送信→お渡し→TD→お支払い）と同じ並び */
function Steps({ work }: { work: Record<string, unknown> | null }) {
  if (!work) return <span className="text-xs text-(--color-dim)">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {WORK_STEPS.map((s) => {
        const done = Boolean(work[s.key]);
        return (
          <span
            key={s.key}
            title={done ? `${s.label} ${String(work[s.key])}` : `${s.label} まだ`}
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              done ? "bg-(--color-accent) text-white" : "bg-(--color-panel-2) text-(--color-dim)"
            }`}
          >
            {s.label}
          </span>
        );
      })}
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const actor = await requireActor();
  const sp = await searchParams;
  const [quotes, demo] = await Promise.all([
    listQuotes(actor, { q: sp.q ?? null, status: sp.status ?? null }),
    getDemoShaftStats(actor),
  ]);

  const admin = createAdmin();
  const [{ data: stores }, { data: staff }] = await Promise.all([
    admin.from("stores").select("id, name").eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null).order("name"),
    admin.from("staff").select("id, name").eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null).order("sort_order"),
  ]);
  const visibleStores = ((stores ?? []) as { id: string; name: string }[]).filter(
    (s) => actor.isOwner || actor.storeIds.includes(s.id)
  );

  // 手が止まっているもの。「到着したのに組み上がっていない」「お渡ししたのに未入金」を上に出す
  const waiting = quotes.filter((q) => q.work && q.work.arrived_on && !q.work.assembled_on);
  const unpaid = quotes.filter((q) => q.work && q.work.delivered_on && !q.work.paid_on);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">YOZAN</p>
          <h1 className="text-2xl font-bold tracking-widest">Craft OS</h1>
          <p className="mt-1 text-sm text-(--color-dim)">フィッティング表紙 → 見積 → 注文書 → 工房</p>
        </div>
        <form action="/api/logout" method="post">
          <button className="text-sm text-(--color-dim) hover:text-(--color-txt)">{actor.name} — ログアウト</button>
        </form>
      </header>

      <TopNav active="home" />

      {(waiting.length > 0 || unpaid.length > 0) && (
        <section className={`${cardCls} mb-6 border-amber-200 bg-amber-50/40`}>
          <h2 className="mb-3 text-sm font-bold text-amber-800">手が止まっているもの</h2>
          <ul className="space-y-1 text-sm">
            {waiting.map((q) => (
              <li key={`w${q.id}`}>
                <Link href={`/q/${q.id}/work`} className="underline">
                  {q.quote_no} {q.customer_name} 様
                </Link>
                <span className="ml-2 text-(--color-dim)">入荷済み（{dateShort(q.work?.arrived_on)}）で、まだ組み上がっていません</span>
              </li>
            ))}
            {unpaid.map((q) => (
              <li key={`p${q.id}`}>
                <Link href={`/q/${q.id}/work`} className="underline">
                  {q.quote_no} {q.customer_name} 様
                </Link>
                <span className="ml-2 text-(--color-dim)">お渡し済み（{dateShort(q.work?.delivered_on)}）で、お支払いが未記録です</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-4 text-sm font-bold">フィッティングを始める</h2>
        <form action={createQuote} className="grid gap-4 md:grid-cols-2">
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-(--color-line) pb-3">
          <h2 className="text-sm font-bold">見積・工房（{quotes.length}件）</h2>
          <form className="flex gap-2">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="お客様名で絞る" className={`${inputCls} w-48`} />
            <select name="status" defaultValue={sp.status ?? ""} className={`${inputCls} w-40`}>
              <option value="">すべての状態</option>
              {Object.entries(QUOTE_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button className="rounded-lg border border-(--color-line) px-3 text-sm">絞る</button>
          </form>
        </div>

        {quotes.length === 0 ? (
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
                  <th className="py-2 pr-3">状態</th>
                  <th className="py-2 pr-3 text-right">合計</th>
                  <th className="py-2">工房</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="border-b border-(--color-line) last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Link href={`/q/${q.id}`} className="font-medium text-(--color-accent) underline">
                        {q.quote_no}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{q.customer_name} 様</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-(--color-dim)">{dateShort(q.fitting_date ?? q.quote_date)}</td>
                    <td className="py-2 pr-3 text-(--color-dim)">{q.fitter_name ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={q.status === "draft" ? "gray" : q.status === "void" ? "danger" : "ok"}>
                        {QUOTE_STATUS_LABELS[q.status] ?? q.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{q.itemCount > 0 ? yen(q.total) : "—"}</td>
                    <td className="py-2">
                      <Steps work={q.work as unknown as Record<string, unknown> | null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-4 text-xs text-(--color-dim)">
        試打シャフト台帳: {demo.total}本／商品マスタに紐づけ済み {demo.matched}本
        {demo.unmatched + demo.needsReview > 0 && (
          <>
            {" "}
            ・{" "}
            <Link href="/demo-shafts?status=unmatched" className="underline">
              確認待ち {demo.unmatched + demo.needsReview}本
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
