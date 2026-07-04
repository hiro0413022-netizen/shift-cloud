import type { Metadata } from 'next'
import Link from 'next/link'
import FadeUp from '@/components/FadeUp'
import { IMG } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'VISION',
  description: 'ゴルフ業界のインフラ企業化を目指すYOZANの成長戦略。人材・DX・マーケ・運営支援・アパレルの5事業で業界を支える構想を紹介。',
}

export default function VisionPage() {
  return (
    <>
      <section className="page-hero" style={{ minHeight: '520px' }}>
        <div className="page-hero-bg" style={{ backgroundImage: `url('${IMG.golfAerial}')` }} />
        <div className="container hero-inner">
          <div className="breadcrumb">HOME / VISION</div>
          <div className="section-head">
            <div className="eyebrow" style={{ color: '#e2c98d' }}>Vision</div>
            <h1>5事業の相乗効果で、<br />インフラ企業化を見据える。</h1>
            <p className="lead">YOZANが目指すのは、単なる多角化ではありません。ゴルフ業界に必要な人材・DX・マーケ・運営支援・アパレルの機能を一気通貫で持ち続けることです。</p>
          </div>
        </div>
      </section>

      <section className="section-sm" style={{ background: '#f8f9fc' }}>
        <div className="container">
          <FadeUp>
            <div className="stats-strip">
              {[
                { num: '5', cap: '相乗効果を生む\n事業領域' },
                { num: '12+', cap: 'サービス\nラインナップ' },
                { num: '30', cap: '関西エリアでの\n店舗展開構想' },
                { num: '1', cap: '目指す姿は\n業界インフラ企業' },
              ].map(({ num, cap }) => (
                <div key={num} className="stat-item">
                  <div className="num">{num}</div>
                  <div className="cap" style={{ whiteSpace: 'pre-line' }}>{cap}</div>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <FadeUp>
            <div className="img-split">
              <div className="img-split-body">
                <div className="eyebrow">Growth Strategy</div>
                <h2>成長の軸は、<br />足し算ではなく相乗効果。</h2>
                <div className="timeline" style={{ marginTop: '32px' }}>
                  {[
                    { step: '01', title: '人材供給力の強化', desc: 'キャディー・コーチ・育成人材の採用と育成を強化し、業界全体の人手不足解消を牽引します。' },
                    { step: '02', title: 'DXプロダクトの普及', desc: 'PGA NOTE・Golf OSなどのDXツールを業界標準として普及させ、施設運営の効率化を実現します。' },
                    { step: '03', title: 'マーケ支援の収益化', desc: '自社施設で機能した集客ノウハウを外部提供し、ゴルフ業界の集客インフラとして確立します。' },
                    { step: '04', title: '運営支援の横展開', desc: '開業支援・運営代行・店舗改善を関西30店舗構想と連動させ、業界の新規参入と既存店改善を加速します。' },
                    { step: '05', title: 'アパレルブランドの拡大', desc: 'KALLINOSをゴルフ業界を代表するライフスタイルブランドへ成長させ、体験価値の底上げに貢献します。' },
                  ].map(({ step, title, desc }) => (
                    <div key={step} className="timeline-item" style={{ borderTop: '1px solid rgba(13,34,64,.1)' }}>
                      <div className="timeline-year" style={{ color: 'var(--gold)' }}>{step}</div>
                      <div>
                        <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>{title}</h3>
                        <p className="muted" style={{ fontSize: '14px' }}>{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="img-split-photo">
                <img src={IMG.golfGreen} alt="ゴルフコース" loading="lazy" />
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="parallax-banner">
        <div className="parallax-banner-bg" style={{ backgroundImage: `url('${IMG.golfCourse}')` }} />
        <div className="container">
          <FadeUp className="parallax-banner-body">
            <div className="eyebrow">Infrastructure</div>
            <h2>なくてはならない機能を<br />持つ会社へ。</h2>
            <p className="lead">人材、DX、マーケティング、運営支援、アパレル。YOZANは、それぞれを単独事業としてではなく、業界の成長基盤として捉えています。変化の速い時代でも、現場に必要とされる機能を持ち続ける会社は強い。YOZANはそのポジションを取りにいきます。</p>
          </FadeUp>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <FadeUp>
            <div className="cta-band">
              <h3>この会社は伸びる。そう思える構想を、実務に落とし込む。</h3>
              <div className="btn-row">
                <Link className="btn primary" href="/contact">提携・相談はこちら</Link>
                <Link className="btn ghost" href="/recruit">採用情報を見る</Link>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  )
}
