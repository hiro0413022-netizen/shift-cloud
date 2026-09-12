import Link from "next/link";
import { INQUIRY_KINDS } from "@/lib/inquiry";

/**
 * お問い合わせへの入口（#235）。トップの最下部とPROFILEの最下部に置く。
 * 取材・スポンサーの担当者は「プロフィールを読む → 連絡先を探す」ので、読み終わった位置に出す。
 * 種類ボタンは ?type= でフォームの種類を選んだ状態で開く（1タップ減らす）。
 */
export default function ContactCta({ slug }: { slug: string }) {
  const base = `/${slug}/contact`;
  return (
    <section className="reveal overflow-hidden rounded-2xl bg-(--color-ink) text-white">
      <div className="relative px-6 py-10 md:px-10 md:py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_80%_at_90%_10%,rgba(176,141,63,0.28),transparent_70%)]" />
        <div className="relative">
          <p className="sec-title mb-1 text-xs uppercase text-(--color-gold-2)">Contact</p>
          <h2 className="text-2xl font-black md:text-3xl">お仕事のご依頼・お問い合わせ</h2>
          <p className="mt-3 max-w-xl text-sm leading-7 text-neutral-300">
            取材・メディア出演、スポンサー・協賛のご相談、レッスン・イベント出演のご依頼は、下記よりご連絡ください。
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {INQUIRY_KINDS.map((k) => (
              <Link
                key={k.key}
                href={`${base}?type=${k.key}`}
                className="rounded-full border border-white/25 px-4 py-2 text-xs font-bold text-neutral-200 transition hover:border-(--color-gold-2) hover:text-(--color-gold-2)"
              >
                {k.label}
              </Link>
            ))}
          </div>
          <Link
            href={base}
            className="mt-8 inline-flex w-full items-center justify-center rounded-full bg-(--color-gold) px-8 py-4 text-base font-bold tracking-wide text-white transition hover:bg-(--color-gold-2) hover:text-(--color-ink) sm:w-auto"
          >
            連絡先を見る　→
          </Link>
        </div>
      </div>
    </section>
  );
}
