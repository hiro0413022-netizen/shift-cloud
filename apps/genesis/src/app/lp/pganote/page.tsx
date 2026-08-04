import type { Metadata } from "next";
import { LeadForm } from "../lead-form";
import { ensureLpLink, lpBeacon } from "../lp-track";

/**
 * PGA NOTE 集客LP（#101・公開ページ・Instagramプロフィールのリンク先）。
 * 社内から開くときは必ず ?preview=1（閲覧計測から除外・@yozan/trackの鉄則）。
 */
export const metadata: Metadata = {
  title: "PGA NOTE | レッスンを、記録から強くする",
  description:
    "レッスンの記録と生徒とのつながりを仕組みにする、ゴルフコーチのためのノートシステム。全国80以上の施設で利用されています。",
};
export const dynamic = "force-dynamic";

const ACCENT = "#7be3a6";

const VALUES = [
  {
    title: "レッスンが「記録」として残る",
    body: "その日の指導内容・課題・次回のテーマを簡単に記録。生徒ごとの上達の道筋が、コーチにも生徒にも見えるようになります。",
  },
  {
    title: "生徒とのつながりが続く",
    body: "レッスンノートを生徒と共有。次のレッスンまでの間も「何を練習すればいいか」が手元に残るので、継続率が変わります。",
  },
  {
    title: "スクール運営の資産になる",
    body: "コーチ個人の頭の中にあった指導ノウハウが、スクールに蓄積される資産に。コーチが替わっても指導の質を引き継げます。",
  },
];

export default async function PgaNoteLp({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const sp = await searchParams;
  await ensureLpLink("pganote");
  const beacon = lpBeacon("pganote", sp.preview === "1");

  return (
    <main className="min-h-screen bg-[#08130d] text-white" style={{ fontFeatureSettings: '"palt"' }}>
      {/* hero */}
      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-20 pb-16 text-center">
        <p className="text-sm tracking-[0.35em]" style={{ color: ACCENT }}>
          PGA NOTE
        </p>
        <h1 className="mt-6 text-4xl leading-snug font-bold sm:text-5xl">
          レッスンを、
          <br />
          記録から強くする。
        </h1>
        <p className="mt-6 max-w-xl leading-relaxed text-white/70">
          PGA NOTEは、レッスンの記録と生徒とのつながりを仕組みにする、ゴルフコーチのためのノートシステムです。
          全国80以上のスクール・練習場で使われています。
        </p>
        <a
          href="#contact"
          className="mt-10 rounded-full px-10 py-4 text-base font-bold text-black transition-transform hover:scale-[1.02]"
          style={{ background: ACCENT }}
        >
          資料請求はこちら（無料）
        </a>
      </section>

      {/* こんなお悩みありませんか */}
      <section className="border-y border-white/10 bg-white/[0.03] px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold">こんなお悩み、ありませんか？</h2>
          <div className="mt-8 grid gap-3 text-sm leading-relaxed text-white/75 sm:grid-cols-3">
            <p className="rounded-xl border border-white/10 p-5">前回のレッスンで何を教えたか、思い出すのに時間がかかる</p>
            <p className="rounded-xl border border-white/10 p-5">生徒が次のレッスンまでに何を練習すればいいか、伝わっていない</p>
            <p className="rounded-xl border border-white/10 p-5">指導ノウハウがコーチ個人に溜まり、スクールに残らない</p>
          </div>
        </div>
      </section>

      {/* value */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold">PGA NOTEができること</h2>
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
        <p className="mt-8 text-center text-sm text-white/50">
          導入のご相談から運用開始まで、担当者が伴走します。まずは資料をご覧ください。
        </p>
      </section>

      {/* contact */}
      <section id="contact" className="border-t border-white/10 bg-white/[0.03] px-6 py-16">
        <div className="mx-auto max-w-xl">
          <h2 className="text-center text-2xl font-bold">資料請求・お問い合わせ</h2>
          <p className="mt-3 mb-8 text-center text-sm text-white/60">
            料金・導入事例・デモのご希望など、お気軽にどうぞ。
          </p>
          <LeadForm product="pganote" accent={ACCENT} />
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-xs text-white/40">
        © 株式会社YOZAN ／ PGA NOTE
      </footer>

      {/* 閲覧計測ビーコン（@yozan/track） */}
      <div dangerouslySetInnerHTML={{ __html: beacon }} />
    </main>
  );
}
