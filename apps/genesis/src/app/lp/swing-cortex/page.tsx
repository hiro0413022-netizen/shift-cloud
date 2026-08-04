import type { Metadata } from "next";
import { LeadForm } from "../lead-form";
import { ensureLpLink, lpBeacon } from "../lp-track";

/**
 * SWING CORTEX 集客LP（#101・公開ページ・Instagramプロフィールのリンク先）。
 * 外販はstandard仕様のみ訴求（生徒CRMはpro=自社限定・DECISIONS P4）。
 * 社内から開くときは必ず ?preview=1。
 */
export const metadata: Metadata = {
  title: "SWING CORTEX | コーチの目に、根拠を。",
  description:
    "見たままの症状を入れると、原因・対処・ドリルがその場で出る。実際のレッスン記録から生まれた、ゴルフコーチのための現場診断ツール。",
};
export const dynamic = "force-dynamic";

const ACCENT = "#5eead4";

const STEPS = [
  { t: "症状を見たまま入力", b: "「右に曲がる」「トップで伸び上がる」— 症状名を知らなくても、見たまま・音声でOK。" },
  { t: "原因とチェック項目が出る", b: "体の使い方ベースの確認ポイントを優先度順に提示。新人コーチの「次に何を見るか」を支えます。" },
  { t: "対処とドリルまでその場で", b: "原因ごとの対処法と練習ドリル、生徒さんへの説明文まで。レッスンの流れを止めません。" },
];

const VALUES = [
  {
    title: "実際のレッスン記録から生まれた",
    body: "机上の理論ではなく、現場のコーチが書いた数千件のレッスンコメントを元に設計。現場で通じる言葉で答えが返ります。",
  },
  {
    title: "AIがカルテ文まで下書き",
    body: "診断結果と所見から、レッスン後のコメントをAIが下書き。コーチは確認して整えるだけ。記録の手間が激減します。",
  },
  {
    title: "スクールの指導メソッドに育つ",
    body: "自校のレッスン記録を取り込むほど、答えが「その店のメソッド」に寄っていきます。指導の標準化と新人育成に。",
  },
];

export default async function SwingCortexLp({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const sp = await searchParams;
  await ensureLpLink("swing-cortex");
  const beacon = lpBeacon("swing-cortex", sp.preview === "1");

  return (
    <main className="min-h-screen bg-[#06171a] text-white" style={{ fontFeatureSettings: '"palt"' }}>
      {/* hero */}
      <section className="mx-auto flex max-w-3xl flex-col items-center px-6 pt-20 pb-16 text-center">
        <p className="text-sm tracking-[0.35em]" style={{ color: ACCENT }}>
          SWING CORTEX
        </p>
        <h1 className="mt-6 text-4xl leading-snug font-bold sm:text-5xl">
          コーチの目に、
          <br />
          根拠を。
        </h1>
        <p className="mt-6 max-w-xl leading-relaxed text-white/70">
          見たままの症状を入れると、原因・対処・ドリルがその場で出る。
          実際のレッスン記録から生まれた、ゴルフコーチのための現場診断ツールです。
        </p>
        <a
          href="#contact"
          className="mt-10 rounded-full px-10 py-4 text-base font-bold text-black transition-transform hover:scale-[1.02]"
          style={{ background: ACCENT }}
        >
          資料請求・デモを見る（無料）
        </a>
      </section>

      {/* how it works */}
      <section className="border-y border-white/10 bg-white/[0.03] px-6 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-2xl font-bold">レッスン中に、3ステップ</h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.t} className="rounded-xl border border-white/10 p-5">
                <p className="text-2xl font-bold" style={{ color: ACCENT }}>
                  {i + 1}
                </p>
                <p className="mt-2 font-bold">{s.t}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* value */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-bold">選ばれる理由</h2>
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
          <h2 className="text-center text-2xl font-bold">資料請求・お問い合わせ</h2>
          <p className="mt-3 mb-8 text-center text-sm text-white/60">
            デモ画面のご案内・料金・導入のご相談など、お気軽にどうぞ。
          </p>
          <LeadForm product="swing-cortex" accent={ACCENT} />
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-xs text-white/40">
        © 株式会社YOZAN ／ SWING CORTEX
      </footer>

      {/* 閲覧計測ビーコン（@yozan/track） */}
      <div dangerouslySetInnerHTML={{ __html: beacon }} />
    </main>
  );
}
