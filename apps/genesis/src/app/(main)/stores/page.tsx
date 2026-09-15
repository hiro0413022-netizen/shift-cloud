import Link from "next/link";
import { requireGenesisActor, visibleStores } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getStoreLauncher } from "@/lib/store-launcher";
import { Icon } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * 店舗のシステムへ直行（#244 ⑧）
 * ユーザー指摘「予約確認など他システムに飛びにくい」。
 * 店舗を選ぶ → その店で使うアプリの入口が「今日の状態つき」で並ぶ。
 * 各アプリは別プロジェクトなので別タブで開く（ログインは共通の auth.users・#staff-login-id）。
 */
export default async function StoresPage({ searchParams }: { searchParams: Promise<{ store?: string; alias?: string }> }) {
  const actor = await requireGenesisActor();
  const sp = await searchParams;
  const stores = await visibleStores(actor);
  // ?alias=frank|gw は JARVIS（声）からの指定（jarvis-pure.detectStoreAlias）
  const byAlias =
    sp.alias === "frank"
      ? stores.find((s) => /FRANK|FRUNK|姫路/.test(s.name))
      : sp.alias === "gw"
        ? stores.find((s) => /GOLF ?WING|宝塚/i.test(s.name))
        : null;
  const chosenId = sp.store && stores.some((s) => s.id === sp.store) ? sp.store : byAlias?.id ?? stores[0]?.id ?? null;
  const admin = createAdmin();
  const { data: storeRow } = chosenId
    ? await admin.from("stores").select("id,name,code").eq("id", chosenId).eq("company_id", actor.companyId).maybeSingle()
    : { data: null };
  const launcher = storeRow ? await getStoreLauncher(actor.companyId, storeRow as { id: string; name: string; code: string | null }) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">店舗のシステムへ</h1>
        <div className="flex gap-1 rounded-lg bg-(--color-panel-2) p-1 text-sm">
          {stores.map((s) => (
            <Link
              key={s.id}
              href={`/stores?store=${s.id}`}
              className={`rounded-md px-3 py-2 ${s.id === chosenId ? "bg-(--color-line) font-bold" : "text-(--color-dim)"}`}
            >
              {s.name}
            </Link>
          ))}
        </div>
        <p className="text-sm text-(--color-faint)">別タブで開きます。ログインし直しは不要です。</p>
      </div>

      {!launcher ? (
        <p className="py-6 text-sm text-(--color-dim)">見られる店舗がありません。</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {launcher.cards.map((c) => {
            const [first, ...rest] = c.links;
            const st = c.status;
            const dim = st != null && st.count === 0 && !st.hot;
            return (
              <section key={c.key} className="flex flex-col gap-1.5 rounded-xl border border-(--color-line) bg-(--color-panel) p-3.5">
                <div className="mb-1 flex items-center gap-3 px-1">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-400/10 text-(--color-accent)">
                    <Icon name={c.icon} size={18} />
                  </span>
                  <div>
                    <p className="text-base font-bold">{c.name}</p>
                    <p className="text-xs text-(--color-faint)">{c.system}</p>
                  </div>
                </div>
                <a
                  href={first.href}
                  target="_blank"
                  rel="noreferrer"
                  className={`flex min-h-11 items-center gap-2 rounded-lg bg-(--color-panel-2) px-3 text-[15px] font-bold ${dim ? "opacity-60" : ""}`}
                >
                  <span className="flex-1">
                    {st ? (
                      <>
                        {st.label}
                        {st.count != null && (
                          <span className={`tnum ml-2 ${st.hot ? "text-(--color-danger)" : st.count > 0 ? "text-(--color-accent)" : "text-(--color-faint)"}`}>
                            {st.count}
                            {c.key === "shift" ? "名" : "件"}
                          </span>
                        )}
                      </>
                    ) : (
                      first.label
                    )}
                  </span>
                  <Icon name="arrow" size={14} className="text-(--color-faint)" />
                </a>
                {rest.map((l) => (
                  <a
                    key={l.href + l.label}
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-(--color-dim) hover:bg-(--color-panel-2) hover:text-(--color-txt)"
                  >
                    <span className="flex-1">{l.label}</span>
                    <Icon name="arrow" size={14} className="text-(--color-faint)" />
                  </a>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
