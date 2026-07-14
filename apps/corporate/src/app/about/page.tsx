import type { Metadata } from 'next'
import Link from 'next/link'
import FadeUp from '@/components/FadeUp'
import { IMG } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'ABOUT',
  description: '株式会社YOZANの理念とメッセージ。共に歩む、共に成す。を軸に、ゴルフ業界の成長を支える企業像を紹介します。',
}

export default function AboutPage() {
  return (
    <>
      <section className="page-hero" style={{ minHeight: '500px' }}>
        <div className="page-hero-bg" style={{ backgroundImage: `url('${IMG.golfFairway}')` }} />
        <div className="container hero-inner">
          <div className="breadcrumb">HOME / ABOUT</div>
          <div className="section-head">
            <div className="eyebrow" style={{ color: '#e2c98d' }}>About</div>
            <h1>共に歩む、共に成す。</h1>
            <p className="lead">YOZANは、自社だけが伸びる会社を目指していません。現場、取引先、求職者、業界全体と向き合いながら、共に前進できる仕組みを5つの事業としてつくる会社です。</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <FadeUp>
            <div className="img-split">
              <div className="img-split-photo">
                <img src={IMG.teamMeeting} alt="チームミーティング" loading="lazy" />
              </div>
              <div className="img-split-body">
                <div className="eyebrow">Message</div>
                <h2 style={{ fontSize: 'clamp(24px,3vw,40px)' }}>なぜ、5事業を<br />同時に育てるのか。</h2>
                <div className="quote-block" style={{ marginTop: '28px' }}>
                  <p>ゴルフ業界には、人を夢中にさせる魅力があります。一方で、現場を深く見るほど、人材不足・業務の非効率・集客の属人化・体験価値のばらつきといった課題も見えてきます。YOZANは、それらを一つの打ち手で解決できるとは考えていません。人を育て、現場へ届ける。業務をDXで効率化する。マーケティングで集客を仕組み化する。開業と運営を現場知見でサポートする。そして、ゴルフをもっと格好よく楽しめるアパレルで体験価値を高める。これらを別々の事業ではなく、業界の成長を支える仕組みとして実装することが、YOZANの使命です。</p>
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <FadeUp>
            <div className="grid grid-2">
              <div className="photo-feature" style={{ minHeight: '380px' }}>
                <img src={IMG.golfCoach} alt="経営理念" loading="lazy" />
                <div className="photo-feature-overlay">
                  <div className="eyebrow">Philosophy</div>
                  <h3>経営理念</h3>
                  <p>共に歩む、共に成す。お客様、パートナー、現場スタッフ、求職者。多くの人と歩みながら成果をつくることで、持続的な成長は実現します。</p>
                </div>
              </div>
              <div className="photo-feature" style={{ minHeight: '380px' }}>
                <img src={IMG.golfSimulator2} alt="会社のあり方" loading="lazy" />
                <div className="photo-feature-overlay">
                  <div className="eyebrow">Identity</div>
                  <h3>会社のあり方</h3>
                  <p>YOZANは、ゴルフ業界の現場で本当に必要とされる機能を、人材・DX・マーケ・運営支援・アパレルとして一つずつ事業化し続ける会社です。</p>
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <FadeUp>
            <div className="cta-band">
              <h3>信用力は、言葉だけでは生まれない。<br />現場を持ち、実務で価値を返し続けることがYOZANの信頼です。</h3>
              <div className="btn-row">
                <Link className="btn primary" href="/vision">成長戦略を見る</Link>
                <Link className="btn ghost" href="/contact">お問い合わせ</Link>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  )
}
