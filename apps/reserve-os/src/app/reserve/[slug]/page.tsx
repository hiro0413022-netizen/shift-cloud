import { notFound } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { ReserveForm } from "./reserve-form";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/** 今日(JST)の日付を datetime-local の min 用文字列にする（YYYY-MM-DDT09:00） */
function jstMinDateTime(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return `${parts}T09:00`;
}

function Brand() {
  return (
    <div className="text-center">
      <p className="eyebrow">GOLF WING</p>
    </div>
  );
}

function Hero({ service }: { service: Row }) {
  return (
    <header className="hero px-6 pb-14 pt-12 text-center">
      <p className="eyebrow" style={{ color: "#cdb26f" }}>GOLF WING · FITTING STUDIO</p>
      <h1 className="mt-3 text-3xl font-bold leading-tight tracking-wide sm:text-4xl">
        {String(service.name ?? "シャフトフィッティング")}
      </h1>
      <div className="hero-rule mx-auto my-6 w-24" />
      <p className="mx-auto max-w-md text-[15px] leading-relaxed text-[#e8e4d6]">
        {String(service.lead_text ?? "")}
      </p>
      <a href="#form" className="mt-8 inline-block rounded-full bg-(--color-gold) px-8 py-3 text-sm font-bold text-[#1a1508] shadow-lg transition-transform hover:-translate-y-0.5">
        予約フォームへ進む
      </a>
      <p className="mt-3 text-xs text-[#b9b39c]">公式LINEからそのままお申し込みいただけます</p>
    </header>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-xl px-6 py-10">
      <div className="mb-5 flex items-center gap-3">
        <span className="text-sm font-bold tracking-widest text-(--color-gold)">{n}</span>
        <h2 className="section-title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default async function ReservePage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const admin = createAdmin();

  const { data: service } = await admin
    .from("res_services")
    .select("*")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (!service) notFound();

  // メニュー（コマ数・料金）。料金・所要時間の正はプラン側（DECISIONS #57）
  const { data: planRows } = await admin
    .from("res_plans")
    .select("id, name, summary, target_clubs, duration_min, price, price_note")
    .eq("service_id", service.id)
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort_order");
  const plans = (planRows ?? []) as Row[];

  // ⑦ 予約完了後（完了画面）
  if (sp.done === "1") {
    return (
      <main className="min-h-screen">
        <Hero service={service} />
        <div className="mx-auto max-w-xl px-6 py-14">
          <div className="hud reveal rounded-2xl border border-emerald-500/30 bg-(--color-panel) p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-(--color-accent) text-3xl text-white">✓</div>
            <h2 className="mt-5 text-xl font-bold">お申し込みを受け付けました</h2>
            <p className="mt-3 text-sm leading-relaxed text-(--color-dim)">
              ご入力ありがとうございます。<br />ご希望日時をもとにスタッフが空き状況を確認し、確定のご連絡を差し上げます。
            </p>
            <div className="mt-6 space-y-2 rounded-xl bg-(--color-panel-2) p-4 text-left text-sm">
              <p className="flex items-center gap-2"><span className="step-num !h-6 !w-6 !text-xs">1</span>受付確認メールをお送りしました（届かない場合は迷惑メールをご確認ください）</p>
              <p className="flex items-center gap-2"><span className="step-num !h-6 !w-6 !text-xs">2</span>スタッフが日程を確認し、確定のご連絡をします</p>
              <p className="flex items-center gap-2"><span className="step-num !h-6 !w-6 !text-xs">3</span>公式LINEにも通知が届きます</p>
            </div>
            <a href={`/reserve/${slug}`} className="mt-6 inline-block text-sm font-medium text-(--color-accent)">トップへ戻る</a>
          </div>
        </div>
      </main>
    );
  }

  const minDT = jstMinDateTime();
  // 所要時間はメニューごとに違うので「55分 / 110分」のように併記する
  const durations = Array.from(new Set(plans.map((p) => Number(p.duration_min)).filter((n) => Number.isFinite(n))));
  const durationText = durations.length ? durations.map((d) => `${d}分`).join(" / ") : null;

  const flow = [
    ["予約", "公式LINEまたは本フォームからお申し込み。ご希望日時を第3希望までお選びください。"],
    ["来店", "確定日時にご来店。受付でお名前をお伝えください。"],
    ["ヒアリング", "現在のお悩み・目標・使用クラブをプロが詳しくお伺いします。"],
    ["計測", "弾道計測器でヘッドスピード・打ち出し角・スピン量などを測定。"],
    ["試打", "複数のシャフト・ヘッドを実際に打ち比べ、データで違いを確認します。"],
    ["選定", "計測データとフィーリングから、最適な組み合わせをご提案。"],
    ["結果説明", "測定結果とおすすめ内容を分かりやすくご説明します。"],
  ];

  const faqs = [
    ["初心者でも受けられますか？", "はい。むしろ早い段階でご自身に合うクラブを知ることで上達が早まります。丁寧にご説明しますのでご安心ください。"],
    ["クラブを持っていなくても大丈夫ですか？", "問題ございません。試打用クラブをご用意しています。お持ちのクラブがあればお持ちいただくとより精度が高まります。"],
    ["何本持参すればいいですか？", "普段お使いのドライバーや気になるクラブがあれば数本お持ちください。手ぶらでも受けられます。"],
    ["購入しないといけませんか？", "いいえ。フィッティングのみのご利用も歓迎です。結果をお持ち帰りいただくだけでも構いません。"],
    ["女性でも受けられますか？", "もちろんです。女性向けのシャフトも取り揃えております。お気軽にお越しください。"],
    ["どのくらい時間がかかりますか？", durationText ? `メニューにより ${durationText} です。内容により前後する場合があります。` : "内容により異なります。お気軽にお問い合わせください。"],
  ];

  return (
    <main className="min-h-screen">
      <Hero service={service} />

      {/* ① フィッティングとは */}
      <Section n="①" title="フィッティングとは">
        <div className="hud reveal rounded-2xl border border-(--color-line) bg-(--color-panel) p-6">
          <p className="leading-relaxed text-(--color-txt)">
            同じヘッドでもシャフトが変わるだけで、飛距離・方向性・打感は大きく変わります。
            GOLF WINGのフィッティングは、弾道計測とプロの試打診断であなたのスイングを数値化し、最も力を引き出せる1本を見つける専門メニューです。
            ドライバー・フェアウェイウッド・ユーティリティのシャフトフィッティングに加え、アイアンフィッティングもご用意しています。
          </p>
          <ul className="mt-4 space-y-2 text-sm text-(--color-dim)">
            {["飛距離ロスの原因を数値で可視化", "方向性・ミスの傾向を安定させる", "自分に本当に合う重量・硬さ・調子が分かる", "無駄な買い替えを防ぎ、コスパよく上達"].map((t) => (
              <li key={t} className="flex items-start gap-2"><span className="mt-1 text-(--color-accent)">◆</span>{t}</li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ② メニュー・料金（3メニュー / DECISIONS #57） */}
      <Section n="②" title="メニュー・料金">
        <div className="space-y-4">
          {plans.map((p) => (
            <div key={String(p.id)} className="hud reveal rounded-2xl border border-(--color-line) bg-(--color-panel) p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-lg font-bold">{String(p.name)}</p>
                <p className="text-xl font-bold text-(--color-accent)">
                  ¥{Number(p.price).toLocaleString("ja-JP")}
                  <span className="ml-1 text-xs font-medium text-(--color-dim)">（税込）</span>
                </p>
              </div>
              <dl className="mt-4 divide-y divide-(--color-line) text-sm">
                {p.target_clubs != null && (
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="shrink-0 text-(--color-dim)">対象クラブ</dt>
                    <dd className="text-right font-medium">{String(p.target_clubs)}</dd>
                  </div>
                )}
                {p.duration_min != null && (
                  <div className="flex justify-between gap-4 py-3">
                    <dt className="text-(--color-dim)">所要時間</dt>
                    <dd className="font-medium">{Number(p.duration_min)} 分</dd>
                  </div>
                )}
              </dl>
              {p.price_note != null && (
                <p className="mt-3 rounded-lg bg-(--color-panel-2) p-3 text-xs leading-relaxed text-(--color-dim)">※ {String(p.price_note)}</p>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ③ フィッティングの流れ */}
      <Section n="③" title="当日の流れ">
        <ol className="space-y-3">
          {flow.map(([t, d], i) => (
            <li key={t} className="hud reveal flex gap-4 rounded-2xl border border-(--color-line) bg-(--color-panel) p-4">
              <span className="step-num shrink-0">{i + 1}</span>
              <div>
                <p className="font-semibold">{t}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-(--color-dim)">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* ④ 事前ヒアリング（予約フォーム） */}
      <section id="form" className="mx-auto max-w-xl scroll-mt-4 px-6 py-10">
        <div className="mb-5 flex items-center gap-3">
          <span className="text-sm font-bold tracking-widest text-(--color-gold)">④</span>
          <h2 className="section-title">ご予約・事前ヒアリング</h2>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-(--color-dim)">
          下記フォームからお申し込みください。ご入力いただいた内容は、当日のフィッティング精度の向上に活用します。
        </p>
        {/* LIFF ID があれば公式LINEから開いたときに userId を拾う（DECISIONS #56） */}
        <ReserveForm
          slug={slug}
          minDateTime={minDT}
          liffId={process.env.NEXT_PUBLIC_LIFF_ID}
          plans={plans.map((p) => ({
            id: String(p.id),
            name: String(p.name),
            summary: p.summary != null ? String(p.summary) : null,
            durationMin: p.duration_min != null ? Number(p.duration_min) : null,
            price: Number(p.price),
          }))}
        />
      </section>

      {/* ⑤ 注意事項 */}
      <Section n="⑤" title="注意事項">
        <div className="hud reveal rounded-2xl border border-(--color-line) bg-(--color-panel) p-6">
          <dl className="space-y-4 text-sm">
            {[
              ["ご予約について", "本フォームはお申し込みです。スタッフが空き状況を確認し、確定のご連絡をもってご予約成立となります。"],
              ["キャンセルについて", "ご都合が悪くなった場合は、確定のご連絡メールへの返信、またはお電話でお早めにご連絡ください。"],
              ["持ち物", "普段お使いのクラブ（あれば）、ゴルフグローブ、動きやすい服装。手ぶらでもご参加いただけます。"],
              ["お支払い方法", "現金・各種クレジットカードがご利用いただけます。詳細は当日ご案内します。"],
              ["所要時間", durationText ? `メニューにより ${durationText}。内容により前後します。` : "内容により異なります。"],
            ].map(([t, d]) => (
              <div key={t}>
                <dt className="font-semibold text-(--color-txt)">{t}</dt>
                <dd className="mt-1 leading-relaxed text-(--color-dim)">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      {/* ⑥ FAQ */}
      <Section n="⑥" title="よくあるご質問">
        <div className="hud reveal rounded-2xl border border-(--color-line) bg-(--color-panel) px-6 py-2">
          {faqs.map(([q, a]) => (
            <details key={q} className="faq">
              <summary>{q}</summary>
              <p className="pb-4 text-sm leading-relaxed text-(--color-dim)">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      <footer className="hero mt-6 px-6 py-10 text-center">
        <p className="eyebrow" style={{ color: "#cdb26f" }}>GOLF WING</p>
        <a href="#form" className="mt-4 inline-block rounded-full bg-(--color-gold) px-8 py-3 text-sm font-bold text-[#1a1508]">予約フォームへ進む</a>
        <p className="mt-6 text-xs text-[#b9b39c]">© GOLF WING</p>
      </footer>
    </main>
  );
}
