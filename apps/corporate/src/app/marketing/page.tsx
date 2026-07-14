import type { Metadata } from 'next'
import Link from 'next/link'
import FadeUp from '@/components/FadeUp'
import { IMG } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'MARKETING',
  description: 'YOZANのマーケティング事業。ゴルフ施設・練習場・スクール向けSNS運用・LP制作・HP制作・広告運用を一気通貫で提供。',
}

export default function MarketingPage() {
  return (
    <>
      {/* ▌PAGE HERO */}
      <section className="page-hero" style={{ minHeight: '560px' }}>
        <div className="page-hero-bg" style={{ backgroundImage: `url('${IMG.snsMarketing}')` }} />
        <div className="container hero-inner">
          <div className="breadcrumb">HOME / MARKETING</div>
          <div className="section-head">
            <div className="eyebrow" style={{ color: '#e2c98d' }}>Marketing</div>
            <h1>ゴルフ業界の集客を、<br />仕組みで変える。</h1>
            <p className="lead">SNS・LP・HP・広告を、バラバラに発注しているだけでは集客は変わりません。YOZANは、ゴルフ施設に特化した視点で、4つのサービスを一気通貫で設計・実行します。</p>
            <div className="btn-row" style={{ marginTop: '28px' }}>
              <Link className="btn primary" href="/contact?subject=marketing">無料相談を申し込む</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ▌Problem */}
      <section className="section">
        <div className="container">
          <FadeUp>
            <div className="img-split">
              <div className="img-split-body" style={{ background: '#f8f9fc' }}>
                <div className="eyebrow">Problem</div>
                <h2 style={{ fontSize: 'clamp(24px,3vw,40px)' }}>こんな課題に、<br />なっていませんか。</h2>
                <ul className="list-clean" style={{ marginTop: '24px' }}>
                  <li>投稿しているのに来店予約につながらない</li>
                  <li>施設の魅力を何で見せればいいか分からない</li>
                  <li>HPが古くて問い合わせが来ない</li>
                  <li>広告費をかけても効果が見えない</li>
                  <li>競合との差別化ができていない</li>
                  <li>集客施策がバラバラでPDCAが回っていない</li>
                </ul>
              </div>
              <div className="img-split-photo">
                <img src={IMG.golfSimulator2} alt="ゴルフ施設" loading="lazy" />
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌Services */}
      <section className="section alt" id="services">
        <div className="container">
          <FadeUp className="section-head">
            <div className="eyebrow">Services</div>
            <h2>4つのサービスで、<br />集客を仕組み化する。</h2>
          </FadeUp>
          <FadeUp>
            <div className="grid grid-2" style={{ gap: '32px' }}>
              {[
                { img: IMG.golfAerial, eyebrow: '01 / SNS運用', title: 'SNS運用', desc: '戦略設計・撮影ディレクション・投稿制作・数値分析・改善提案まで一気通貫で対応。' },
                { img: IMG.golfSimulator, eyebrow: '02 / LP制作', title: 'LP制作', desc: '体験申込・問い合わせ獲得に特化したランディングページ。CVRを最大化する設計で制作します。' },
                { img: IMG.teamMeeting, eyebrow: '03 / HP制作', title: 'HP制作', desc: '施設・スクール・企業の信頼性を高めるコーポレートサイト。SEOと更新性を考慮した設計。' },
                { img: IMG.golfCourse, eyebrow: '04 / 広告運用', title: '広告運用', desc: 'Meta広告・Google広告を活用し、ターゲット設計から入稿・改善まで費用対効果重視で運用。' },
              ].map(({ img, eyebrow, title, desc }) => (
                <div key={title} className="photo-feature" style={{ minHeight: '360px' }}>
                  <img src={img} alt={title} loading="lazy" />
                  <div className="photo-feature-overlay">
                    <div className="eyebrow">{eyebrow}</div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌Why Yozan */}
      <section className="parallax-banner">
        <div className="parallax-banner-bg" style={{ backgroundImage: `url('${IMG.golfFairway}')` }} />
        <div className="container">
          <FadeUp className="parallax-banner-body">
            <div className="eyebrow">Why Yozan</div>
            <h2>YOZANのマーケ支援が、<br />他社と違う理由。</h2>
            <div className="grid grid-2" style={{ marginTop: '40px', textAlign: 'left', gap: '20px' }}>
              {[
                { title: 'ゴルフ業界特化', desc: '施設・練習場・スクールに必要な訴求軸と業務課題を深く理解しています。' },
                { title: '4サービス一気通貫', desc: 'SNS・LP・HP・広告をバラバラにせず、集客導線全体を設計します。' },
                { title: '撮影に強い', desc: '打席・設備・レッスン・スタッフの空気感まで、見せ方を設計します。' },
                { title: '自社検証済み', desc: '自社施設の現場知見をもとに、再現性のある打ち手を提供します。' },
              ].map(({ title, desc }) => (
                <div key={title} style={{ background: 'rgba(255,255,255,.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.12)', borderRadius: '16px', padding: '28px' }}>
                  <h3 style={{ fontSize: '17px', color: '#fff', marginBottom: '8px' }}>{title}</h3>
                  <p style={{ color: 'rgba(255,255,255,.72)', fontSize: '14px' }}>{desc}</p>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌CTA */}
      <section className="section" style={{ background: 'var(--surface)' }}>
        <div className="container">
          <FadeUp>
            <div className="cta-band">
              <div className="eyebrow">Call To Action</div>
              <h3>まずは、今の集客導線を診断しませんか。</h3>
              <p>ゴルフ施設・練習場・スクール向けに、現状の課題と改善余地を整理してご提案します。</p>
              <div className="btn-row">
                <Link className="btn primary" href="/contact">無料相談を申し込む</Link>
                <a className="btn ghost" href="mailto:info@yozan-inc.jp">info@yozan-inc.jp へメール</a>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  )
}
