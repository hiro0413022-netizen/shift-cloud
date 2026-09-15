import Link from "next/link";
import type { DrillLevel } from "@/lib/drilldown";
import { Icon } from "@/components/icons";

/**
 * ⑦ 数字の深掘りパネル（#244）。右から開く。全店 → 店舗 → 種別 → その人。
 * すべて URL（?drill=&store=&kind=）で状態を持つ＝ブラウザの戻るで1段戻れる／音声（JARVIS）からも開ける。
 */
export function DrillPanel({ level, closeHref }: { level: DrillLevel; closeHref: string }) {
  const unit = level.total.unit;
  const fmtVal = (v: number, u: string) => (u === "円" ? v.toLocaleString("ja-JP") : u === "%" ? String(Math.round(v * 10) / 10) : String(v));
  const parent = level.crumbs.length >= 2 ? level.crumbs[level.crumbs.length - 2].href : closeHref;
  return (
    <div className="gn-panel" role="dialog" aria-label={level.title}>
      <Link href={closeHref} className="absolute inset-0 bg-black/55" aria-label="閉じる" />
      <div className="gn-panel-body">
        <div className="flex items-center gap-3 border-b border-(--color-line) px-4 py-3 md:px-6">
          <Link href={parent} className="flex h-10 w-10 items-center justify-center rounded-lg border border-(--color-line) text-(--color-dim)" aria-label="ひとつ戻る">
            <Icon name="back" size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-(--color-dim)">
              {level.crumbs.map((c, i) => (
                <span key={c.href} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-(--color-faint)">›</span>}
                  {i === level.crumbs.length - 1 ? <span className="text-(--color-txt)">{c.label}</span> : <Link href={c.href} className="text-(--color-accent) hover:underline">{c.label}</Link>}
                </span>
              ))}
            </div>
            <p className="truncate text-lg font-bold">{level.title}</p>
          </div>
          <Link href={closeHref} className="flex h-10 w-10 items-center justify-center rounded-lg border border-(--color-line) text-(--color-dim)" aria-label="閉じる">
            <Icon name="close" size={18} />
          </Link>
        </div>

        <div className="flex flex-1 flex-col gap-3 px-4 py-4 md:px-6">
          {unit && (
            <p className="tnum text-4xl font-bold leading-none">
              {fmtVal(level.total.value, unit)}
              <span className="ml-1 text-base font-medium text-(--color-dim)">{unit}</span>
            </p>
          )}
          {level.note && <p className="text-sm text-(--color-warn)">{level.note}</p>}
          {level.rows.length === 0 && !level.note && <p className="py-6 text-sm text-(--color-dim)">該当なし</p>}
          <ul className="space-y-2">
            {level.rows.map((r) => {
              const max = Math.max(1, ...level.rows.map((x) => x.value));
              const inner = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold">{r.label}</p>
                    {r.sub && <p className="mt-0.5 text-xs text-(--color-faint)">{r.sub}</p>}
                    {r.unit && r.value > 0 && (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-(--color-line)">
                        <div className="h-full bg-(--color-accent)" style={{ width: `${Math.round((r.value / max) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  {r.unit && (
                    <p className="tnum text-2xl font-bold">
                      {fmtVal(r.value, r.unit)}
                      <span className="ml-0.5 text-xs text-(--color-dim)">{r.unit}</span>
                    </p>
                  )}
                  {(r.next || r.external) && <Icon name="arrow" size={16} className="text-(--color-faint)" />}
                </>
              );
              const cls = "flex min-h-14 items-center gap-3 rounded-xl border border-(--color-line) bg-(--color-panel-2)/60 px-4 py-3 hover:border-sky-700";
              if (r.next)
                return (
                  <li key={r.key}>
                    <Link href={r.next} className={cls}>
                      {inner}
                    </Link>
                  </li>
                );
              if (r.external)
                return (
                  <li key={r.key}>
                    <a href={r.external} target="_blank" rel="noreferrer" className={cls}>
                      {inner}
                    </a>
                  </li>
                );
              return (
                <li key={r.key} className={cls}>
                  {inner}
                </li>
              );
            })}
          </ul>
          {level.actions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {level.actions.map((a) =>
                a.external ? (
                  <a key={a.href + a.label} href={a.href} target="_blank" rel="noreferrer" className="btn-main">
                    {a.label} →
                  </a>
                ) : (
                  <Link key={a.href + a.label} href={a.href} className="btn-sub">
                    {a.label}
                  </Link>
                )
              )}
            </div>
          )}
          <p className="mt-auto pt-4 text-xs text-(--color-faint)">出どころ：{level.source}</p>
        </div>
      </div>
    </div>
  );
}
