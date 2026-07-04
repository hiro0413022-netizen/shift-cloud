import Link from 'next/link'
import FadeUp from '@/components/FadeUp'
import { IMG } from '@/lib/constants'

export default function HomePage() {
  return (
    <>
      {/* ▌HERO */}
      <section className="hero hero--tall">
        <div className="hero-bg" style={{ backgroundImage: `url('${IMG.heroTop}')` }} />
        <div className="container hero-inner">
          <FadeUp className="hero-copy hero-copy--center">
            <div className="eyebrow" style={{ justifyContent: 'center' }}>Corporate Site / Yozan Group</div>
            <h1>ゴルフ業界の成長を、<br />仕組みで支える。</h1>
            <p className="lead hero-sub" style={{ textAlign: 'center', maxWidth: '640px', margin: '18px auto 0' }}>
              株式会社YOZANは、5つの事業で業界に必要な機能を丸ごと提供します。
            </p>
          </FadeUp>
        </div>
        <div className="scroll-hint">SCROLL</div>
      </section>

      {/* ▌5事業ファーストビューパネル */}
      <section className="biz-panel-section">
        <div className="biz-panel-label">
          <span>YOZAN の 5 事業</span>
        </div>
        <div className="biz-panel-grid">
          <Link className="biz-panel-card biz-panel--human" href="/business#human">
            <div className="biz-panel-card-inner">
              <div className="biz-panel-icon">👥</div>
              <div className="biz-panel-num">01</div>
              <h3 className="biz-panel-title">人材事業</h3>
              <ul className="biz-panel-list">
                <li>キャディー派遣</li>
                <li>レッスンプロ派遣</li>
                <li>人材育成</li>
              </ul>
              <div className="biz-panel-cta">詳細を見る →</div>
            </div>
          </Link>
          <Link className="biz-panel-card biz-panel--dx" href="/business#dx">
            <div className="biz-panel-card-inner">
              <div className="biz-panel-icon">💻</div>
              <div className="biz-panel-num">02</div>
              <h3 className="biz-panel-title">DX事業</h3>
              <ul className="biz-panel-list">
                <li>PGA NOTE</li>
                <li>Golf OS</li>
                <li>発注管理システム</li>
                <li>在庫管理システム</li>
              </ul>
              <div className="biz-panel-cta">詳細を見る →</div>
            </div>
          </Link>
          <Link className="biz-panel-card biz-panel--mkt" href="/marketing">
            <div className="biz-panel-card-inner">
              <div className="biz-panel-icon">📱</div>
              <div className="biz-panel-num">03</div>
              <h3 className="biz-panel-title">マーケティング<br />事業</h3>
              <ul className="biz-panel-list">
                <li>SNS運用</li>
                <li>LP制作</li>
                <li>HP制作</li>
                <li>広告運用</li>
              </ul>
              <div className="biz-panel-cta">詳細を見る →</div>
            </div>
          </Link>
          <Link className="biz-panel-card biz-panel--ops" href="/business#operation">
            <div className="biz-panel-card-inner">
              <div className="biz-panel-icon">🏌️</div>
              <div className="biz-panel-num">04</div>
              <h3 className="biz-panel-title">運営支援</h3>
              <ul className="biz-panel-list">
                <li>開業支援</li>
                <li>運営代行</li>
                <li>店舗改善</li>
              </ul>
              <div className="biz-panel-cta">詳細を見る →</div>
            </div>
          </Link>
          <a className="biz-panel-card biz-panel--apparel" href="https://www.kallinos.jp/" target="_blank" rel="noopener">
            <div className="biz-panel-card-inner">
              <div className="biz-panel-icon">👗</div>
              <div className="biz-panel-num">05</div>
              <h3 className="biz-panel-title">アパレル事業</h3>
              <ul className="biz-panel-list">
                <li>KALLINOS</li>
                <li>ゴルフウェア</li>
                <li>キャップ / バッグ / ベルト</li>
              </ul>
              <div className="biz-panel-cta">ブランドサイト ↗</div>
            </div>
          </a>
        </div>
      </section>

      {/* ▌Why Yozan */}
      <section className="section alt">
        <div className="container">
          <FadeUp>
            <div className="img-split">
              <div className="img-split-photo">
                <img src={IMG.golfAerial} alt="ゴルフコース空撮" loading="lazy" />
              </div>
              <div className="img-split-body">
                <div className="eyebrow">Why Yozan</div>
                <h2>この会社は伸びる。<br />そう感じさせる根拠がある。</h2>
                <div style={{ display: 'grid', gap: '20px', marginTop: '24px' }}>
                  <div>
                    <h3 style={{ fontSize: '17px', marginBottom: '6px' }}>現場を持っている</h3>
                    <p className="muted" style={{ fontSize: '14px' }}>インドアゴルフ施設の運営を通じ、顧客体験・継続率・オペレーションを自社で日々検証しています。</p>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '17px', marginBottom: '6px' }}>5事業がつながっている</h3>
                    <p className="muted" style={{ fontSize: '14px' }}>人材・DX・マーケ・運営支援・アパレルを分断せず、全体最適で組み立てるため支援に一貫性があります。</p>
                  </div>
                  <div>
                    <h3 style={{ fontSize: '17px', marginBottom: '6px' }}>ゴルフ業界に特化している</h3>
                    <p className="muted" style={{ fontSize: '14px' }}>施設・練習場・スクール・プロゴルファーに必要な訴求軸と業務課題を深く理解しています。</p>
                  </div>
                </div>
                <div className="btn-row" style={{ marginTop: '32px' }}>
                  <Link className="btn primary" href="/business">事業詳細を見る</Link>
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌Photo Mosaic */}
      <section className="section">
        <div className="container">
          <FadeUp className="section-head" style={{ textAlign: 'center', maxWidth: '100%' }}>
            <div className="eyebrow" style={{ justifyContent: 'center' }}>Our World</div>
            <h2>YOZANの現場</h2>
          </FadeUp>
          <FadeUp>
            <div className="photo-mosaic">
              <div className="photo-mosaic-item"><img src={IMG.golfSimulator2} alt="インドアゴルフ施設" loading="lazy" /></div>
              <div className="photo-mosaic-item"><img src={IMG.golfCoach} alt="ゴルフコーチング" loading="lazy" /></div>
              <div className="photo-mosaic-item"><img src={IMG.golfGreen} alt="ゴルフコース" loading="lazy" /></div>
              <div className="photo-mosaic-item"><img src={IMG.golfApparel} alt="ゴルフアパレル" loading="lazy" /></div>
              <div className="photo-mosaic-item"><img src={IMG.teamMeeting} alt="チームミーティング" loading="lazy" /></div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌Parallax Banner */}
      <section className="parallax-banner">
        <div className="parallax-banner-bg" style={{ backgroundImage: `url('${IMG.golfFairway}')` }} />
        <div className="container">
          <FadeUp className="parallax-banner-body">
            <div className="eyebrow">Numbers &amp; Vision</div>
            <h2>成長を、数字と構想で見せる。</h2>
            <p className="lead" style={{ marginBottom: '32px' }}>信用力は、抽象論では作れません。YOZANは、現場に根ざした実績と拡張戦略の両方を提示します。</p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <Link className="btn primary" href="/vision">成長戦略を見る</Link>
              <Link className="btn secondary" href="/about">会社について</Link>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌CTA */}
      <section className="section">
        <div className="container">
          <FadeUp>
            <div className="cta-band">
              <div className="eyebrow">Next Action</div>
              <h3>法人相談、マーケ相談、採用応募。<br />目的別に、最短でつながる導線を用意しています。</h3>
              <div className="btn-row">
                <Link className="btn primary" href="/contact">法人のお問い合わせ</Link>
                <Link className="btn secondary" href="/marketing">マーケティング相談をする</Link>
                <Link className="btn ghost" href="/recruit">採用情報を見る</Link>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  )
}
