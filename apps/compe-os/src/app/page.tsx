import Link from "next/link";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { listComps } from "@/lib/compe";
import { dateShort, yen } from "@/lib/format";
import { Badge, btnCls, cardCls, Empty, inputCls, labelCls } from "@/components/ui";
import { createComp } from "./actions";
import { formatLabel } from "@yozan/core/compe-score";

export default async function HomePage() {
  const actor = await requireActor();
  const comps = await listComps(actor);

  const admin = createAdmin();
  const { data: stores } = await admin
    .from("stores")
    .select("id, name")
    .eq("company_id", actor.companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name");
  const visibleStores = (stores ?? []).filter(
    (s: { id: string }) => actor.isOwner || actor.storeIds.includes(s.id)
  ) as { id: string; name: string }[];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">YOZAN</p>
          <h1 className="text-2xl font-bold tracking-widest">Compe OS</h1>
          <p className="mt-1 text-sm text-(--color-dim)">ゴルフコンペの受付・組み合わせ・スコア・表彰</p>
        </div>
        <form action="/api/logout" method="post">
          <button className="text-sm text-(--color-dim) hover:text-(--color-txt)">{actor.name} — ログアウト</button>
        </form>
      </header>

      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-4 text-sm font-bold">新しいコンペを作る</h2>
        <form action={createComp} className="grid gap-3 sm:grid-cols-[1fr_170px_190px_auto] sm:items-end">
          <label className="block">
            <span className={labelCls}>コンペ名</span>
            <input name="name" required placeholder="例: 第10回ゴルフウィング親睦コンペ" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>開催日</span>
            <input type="date" name="held_on" className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>主催店舗</span>
            <select name="store_id" className={inputCls} defaultValue={actor.primaryStoreId ?? ""}>
              <option value="">（会社全体）</option>
              {visibleStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button className={btnCls}>作成する</button>
        </form>
      </section>

      <section className={cardCls}>
        <h2 className="mb-4 text-sm font-bold">コンペ一覧（{comps.length}件）</h2>
        {comps.length === 0 ? (
          <Empty title="まだコンペがありません" hint="上のフォームから最初のコンペを作成してください" />
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {comps.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={`/c/${c.id}`} className="flex-1 min-w-50">
                  <span className="font-semibold hover:underline">{c.name}</span>
                  <span className="ml-2 text-xs text-(--color-dim)">
                    {dateShort(c.held_on)} ／ {c.venue || "会場未定"} ／ {formatLabel(c.format)} ／ 参加費{yen(c.fee)}
                  </span>
                </Link>
                <span className="text-xs text-(--color-dim)">{c.participant_count}名</span>
                {c.status === "closed" ? (
                  <Badge tone="gray">終了</Badge>
                ) : c.status === "running" ? (
                  <Badge tone="ok">当日</Badge>
                ) : (
                  <Badge tone="warn">準備中</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
