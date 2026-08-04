import type { Metadata } from "next";
import { LeadForm } from "../lead-form";
import { ensureLpLink, lpBeacon } from "../lp-track";

/**
 * HP制作（YOZAN WEB制作）集客LP（#101補足・@yozan_web_jp のプロフィールリンク先）。
 * 売りは demo-sales の運用実績そのもの＝「契約前に完成デモを見せる」。
 * 社内から開くときは必ず ?preview=1（閲覧計測から除外）。
 */
export const metadata: Metadata = {
  title: "YOZAN WEB制作 | 完成形を見てから、決められるホームページ制作",
  description:
    "契約の前に、あなたのお店の「完成デモ」を無料でお見せします。見て、触って、気に入ったら進める。店舗・クリニック・教室のためのホームページ制作。",
};
export const dynamic = "force-dynamic";

const ACCENT = "#7ab8f5";

const STEPS = [
  { t: "ヒアリング（10分）", b: "お店の名前と場所、メニューが分かれば十分。資料の準備は不要です。" },
  { t: "完成デモをお届け", b: "実際に動くホームページのデモを作ってURLでお送りします。スマホでそのまま見られます。" },
  { t: "見てから決める", b: "気に入ったらそのまま公開へ。合わなければ断ってOK。デモ費用はかかりません。" },
];

const VALUES = [
  {
    title: "出来上がりが見えない不安をなくす",
    body: "ホームページの発注で一番怖いのは「払ってみないと分からない」こと。YOZAN WEB制作は先に完成形をお見せするので、想像と違ったということが起きません。",
  },
  {
    title: "スマホ・予約導線・地図を最優先",
    body: "閲覧の8割はスマホです。スマホで見やすく、電話・LINE・Web予約へ迷わず進める導線を最初から組み込みます。",
  },
  {
    title: "作って終わりにしない",
    body: "営業時間の変更やお知らせの更新など、公開後の運用まで見据えた作りにします。更新代行のご相談も可能です。",
  },
];

export default async function WebdesignLp({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const sp = await searchParams;
  await ensureLpLink("webdesign");
  const beacon = lpBeacon("webdesign", sp.preview === "1");

  return (
    <main className="min-h-screen bg-[#0a1522] text-white" style={{ fontFeatureSettings: '"palt"' }}>
      {/* hero */}
      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-20 pb-16 text-center">
        <p className="text-sm tracking-[0.35em]" style={{ color: ACCENT }}>
          YOZAN WEB制作
        </p>
        <h1 className="mt-6 text-4xl leading-snug font-bold sm:text-5xl">
          完成形を見てから、
          <br />
          決められる。
        </h1>
        <p className="mt-6 max-w-xl leading-relaxed text-white/70">
          契約の前に、あなたのお店の「完成デモ」を無料でお作りします。
          見て、触って、気に入ったら進める。店舗・クリニック・教室のためのホームページ制作です。
        </p>
        <a
          href="#contact"
          className="mt-10 rounded-full px-10 py-4 text-base font-bold text-black transition-transform hover:scale-[1.02]"
          style={{ background: ACCENT }}
        >
          無料で完成デモを頼んでみる
        </a>
      </section>

      {/* こんな方へ */}
      <section className="border-y border-white/10 bg-white/[0.03] px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold">こんなお悩み、ありませんか？</h2>
          <div className="mt-8 grid gap-3 text-sm leading-relaxed text-white/75 sm:grid-cols-3">
            <p className="rounded-xl border border-white/10 p-5">ホームページがまだ無く、検索してもお店が出てこない</p>
            <p className="rounded-xl border border-white/10 p-5">昔作ったHPがスマホで見づらいまま放置になっている</p>
            <p className="rounded-xl border border-white/10 p-5">制作会社に頼みたいが、出来上がりも金額も見えなくて不安</p>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold">進め方は3ステップ</h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.t} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-2xl font-bold" style={{ color: ACCENT }}>
                {i + 1}
              </p>
              <p className="mt-2 font-bold">{s.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{s.b}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-6">
          {VALUES.map((v, i) => (
            <div key={v.title} className="flex gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="text-3xl font-bold" style={{ color: ACCENT }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <h3 className="text-lg font-bold">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{v.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* contact */}
      <section id="contact" className="border-t border-white/10 bg-white/[0.03] px-6 py-16">
        <div className="mx-auto max-w-xl">
          <h2 className="text-center text-2xl font-bold">無料デモのご依頼・ご相談</h2>
          <p className="mt-3 mb-8 text-center text-sm text-white/60">
            お店の名前と場所だけでOK。1営業日以内にご連絡します。
          </p>
          <LeadForm product="webdesign" accent={ACCENT} />
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-xs text-white/40">
        © 株式会社YOZAN ／ YOZAN WEB制作
      </footer>

      {/* 閲覧計測ビーコン（@yozan/track） */}
      <div dangerouslySetInnerHTML={{ __html: beacon }} />
    </main>
  );
}
