import Link from "next/link";
import type { StalledItem } from "@/lib/stalled-pure";
import { acknowledgeAlert } from "@/app/(main)/feed-actions";
import { Icon } from "@/components/icons";

/**
 * ① 止まっているもの（#244）。ホームの最上段に赤で固定。
 * 表示だけで終わらせない＝1件ごとに「直し方」のボタンを付ける（alerts-must-be-fixable）。
 * 「確認した」は gn_alert_acks に記録。内容（件数）が変わればキーが変わって再表示される。
 */
export function StalledBand({ items }: { items: StalledItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-red-400/50 bg-red-400/10 px-4 py-3" aria-label="止まっているもの">
      <div className="mb-2 flex items-center gap-2 text-[15px] font-bold text-(--color-danger)">
        <Icon name="bell" size={18} />
        止まっているもの {items.length}件
      </div>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-(--color-panel)/60 px-3 py-2.5">
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-[15px] font-bold">{it.title}</p>
              <p className="mt-0.5 text-sm text-(--color-dim)">{it.detail}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {it.fix.external ? (
                <a href={it.fix.href} target="_blank" rel="noreferrer" className="btn-main">
                  {it.fix.label} →
                </a>
              ) : (
                <Link href={it.fix.href} className="btn-main">
                  {it.fix.label} →
                </Link>
              )}
              <form action={acknowledgeAlert}>
                <input type="hidden" name="key" value={it.key} />
                <button className="btn-sub" title="直したら押す。件数が変わればまた出ます">
                  確認した
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
