/**
 * 業務システムへのリンクカード（sp_links）。
 *
 * 店舗ダッシュボード（/store）とスタッフのホーム（/home）で同じ見た目にするための共通部品。
 * フックを使わないので、サーバーコンポーネントからもクライアントコンポーネントからも使える。
 * どのリンクを出すか（会社・店舗での絞り込み）は呼び出し側が決める。ここは描くだけ。
 *
 * 2列は任意値（repeat(2, minmax(0,1fr))）で書く。globals.css のモバイル救済（md未満で .grid-cols-2 を1列に畳む）に
 * 掛かるとスマホで縦1列になり、カードが長く伸びるため。
 */
export type SystemLink = { id?: string; label: string; url: string; note: string | null };

export function SystemLinkCards({
  links,
  gridClassName = "grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:grid-cols-3 lg:grid-cols-5",
  emptyText,
}: {
  links: SystemLink[];
  gridClassName?: string;
  emptyText?: string;
}) {
  if (links.length === 0) {
    return emptyText ? <p className="text-sm text-zinc-400">{emptyText}</p> : null;
  }
  return (
    <div className={gridClassName}>
      {links.map((l, i) => (
        <a
          key={l.id ?? `${i}-${l.url}`}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[4.5rem] flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors hover:border-brand active:bg-zinc-50"
        >
          <p className="flex items-start justify-between gap-2 text-sm font-semibold leading-snug">
            <span>{l.label}</span>
            <span aria-hidden className="text-zinc-300">↗</span>
          </p>
          {l.note && <p className="mt-1 text-[11px] leading-snug text-zinc-400">{l.note}</p>}
        </a>
      ))}
    </div>
  );
}
