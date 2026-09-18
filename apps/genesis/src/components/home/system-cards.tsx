import { Icon } from "@/components/icons";
import type { SystemCard } from "@/lib/store-links";

/**
 * システムへ直行（#248）。
 * GOLF WING の店舗ダッシュボード下「業務システム」と同じ形: 名前＋一言のカードが2〜5列で並び、押すと別タブで開く。
 * 暗い画面に合わせて色だけ GENESIS に揃えた。スマホでは2列・指で押しやすい高さ。
 */
export function SystemCards({ cards, title = "システムへ直行" }: { cards: SystemCard[]; title?: string }) {
  if (cards.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="text-xs text-(--color-faint)">押すと別タブで開きます（{cards.length}件）</span>
      </div>
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:grid-cols-3 sm:gap-2.5 lg:grid-cols-4 2xl:grid-cols-6">
        {cards.map((c) => (
          <a
            key={c.key}
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-[72px] flex-col items-start gap-1.5 rounded-xl border border-(--color-line) bg-(--color-panel) p-3 transition-colors sm:flex-row sm:gap-2.5 hover:border-(--color-accent) hover:bg-(--color-panel-2) active:bg-(--color-panel-2)"
          >
            <span className="flex h-7 w-7 shrink-0 sm:mt-0.5 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-sky-400/10 text-(--color-accent)">
              <Icon name={c.icon} size={17} />
            </span>
            <span className="w-full min-w-0 flex-1">
              <span className="flex items-center gap-1">
                <span className="break-words text-[15px] font-bold leading-tight sm:truncate">{c.name}</span>
                <Icon name="ext" size={12} className="text-(--color-faint) opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              {c.note && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-(--color-dim)">{c.note}</span>}
              {c.store && <span className="mt-0.5 block text-[11px] text-(--color-faint)">{c.store}</span>}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
