import Link from 'next/link'
import FadeUp from '@/components/FadeUp'
import CountUp from '@/components/CountUp'
import { IMG } from '@/lib/constants'

const MARQUEE = (
  <>
    <span>Human Resources</span><span>—</span>
    <span>DX &amp; SaaS</span><span>—</span>
    <span>Marketing</span><span>—</span>
    <span>Operation</span><span>—</span>
    <span><b>Kallinos</b> Apparel</span><span>—</span>
  </>
)

export default function HomePage() {
  return (
    <>
      {/* ▌HERO */}
      <section className="hero hero--tall">
        <div className="hero-bg" style={{ backgroundImage: `url('${IMG.heroTop}')` }} />
        <div className="container hero-inner">
          <FadeUp className="hero-copy hero-copy--center">
            <div className="eyebrow" style={{ justifyContent: 'center' }}>Corporate Site / Yozan Group</div>
            <h1>ゴルフ業界の成長を、<br /><span className="grad-word">仕組み</span>で支える。</h1>
            <p className="lead hero-sub" style={{ textAlign: 'center', maxWidth: '640px', margin: '18px auto 0' }}>
              株式会社YOZANは、人材・DX・マーケティング・運営支援・アパレルの
              5事業で、業界に必要な機能を丸ごと提供します。
            </p>
            <div className="hero-chips">
              <span className="badge">自社施設で現場運営</span>
              <span className="badge">5事業ワンストップ</span>
              <span className="badge">ゴルフ業界特化</span>
            </div>
            <div className="btn-row" style={{ justifyContent: 'center', marginTop: '34px' }}>
              <Link className="btn primary" href="/contact">法人のお問い合わせ</Link>
              <Link className="btn secondary" href="/business">5つの事業を見る</Link>
            </div>
          </FadeUp>
        </div>
        <div className="scroll-hint">SCROLL</div>
      </section>

      {/* ▌MARQUEE */}
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">{MARQUEE}{MARQUEE}</div>
      </div>

      {/* ▌5事業ファーストビューパネル */}
      <section className="biz-panel-section">
        <div className="biz-panel-label" data-reveal="">
          <span>YOZAN の 5 事業</span>
        </div>
        <div className="biz-panel-grid">
          <Link className="biz-panel-card biz-panel--human" href="/business#human" data-reveal="" data-delay="1">
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
          <Link className="biz-panel-card biz-panel--dx" href="/business#dx" data-reveal="" data-delay="2">
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
          <Link className="biz-panel-card biz-panel--mkt" href="/marketing" data-reveal="" data-delay="3">
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
          <Link className="biz-panel-card biz-panel--ops" href="/business#operation" data-reveal="" data-delay="4">
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
          <a className="biz-panel-card biz-panel--apparel" href="https://www.kallinos.jp/" target="_blank" rel="noopener" data-reveal="" data-delay="5">
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
          <div className="img-split" data-reveal="">
            <div className="img-split-photo">
              <img src={IMG.golfAerial} alt="ゴルフコース空撮" loading="lazy" />
            </div>
            <div className="img-split-body">
              <div className="eyebrow">Why Yozan</div>
              <h2>この会社は伸びる。<br />そう感じさせる根拠がある。</h2>
              <div style={{ display: 'grid', gap: '20px', marginTop: '24px' }}>
                <div data-reveal="left" data-delay="1">
                  <h3 style={{ fontSize: '17px', marginBottom: '6px' }}>現場を持っている</h3>
                  <p className="muted" style={{ fontSize: '14px' }}>インドアゴルフ施設の運営を通じ、顧客体験・継続率・オペレーションを自社で日々検証しています。</p>
                </div>
                <div data-reveal="left" data-delay="2">
                  <h3 style={{ fontSize: '17px', marginBottom: '6px' }}>5事業がつながっている</h3>
                  <p className="muted" style={{ fontSize: '14px' }}>人材・DX・マーケ・運営支援・アパレルを分断せず、全体最適で組み立てるため支援に一貫性があります。</p>
                </div>
                <div data-reveal="left" data-delay="3">
                  <h3 style={{ fontSize: '17px', marginBottom: '6px' }}>ゴルフ業界に特化している</h3>
                  <p className="muted" style={{ fontSize: '14px' }}>施設・練習場・スクール・プロゴルファーに必要な訴求軸と業務課題を深く理解しています。</p>
                </div>
              </div>
              <div className="btn-row" style={{ marginTop: '32px' }}>
                <Link className="btn primary" href="/business">事業詳細を見る</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ▌Stats */}
      <section className="section-sm">
        <div className="container">
          <div className="stats-strip" data-reveal="scale">
            <div className="stat-item">
              <div className="num"><CountUp end={5} /></div>
              <div className="cap">事業領域<br />ワンストップ提供</div>
            </div>
            <div className="stat-item">
              <div className="num"><CountUp end={100} suffix="%" /></div>
              <div className="cap">ゴルフ業界特化<br />専門性の集中</div>
            </div>
            <div className="stat-item">
              <div className="num"><CountUp end={360} suffix="°" /></div>
              <div className="cap">採用から集客・運営まで<br />一気通貫の支援</div>
            </div>
            <div className="stat-item">
              <div className="num"><CountUp end={1} /></div>
              <div className="cap">現場から生まれた<br />自社プロダクト思想</div>
            </div>
          </div>
        </div>
      </section>

      {/* ▌Photo Mosaic */}
      <section className="section">
        <div className="container">
          <div className="section-head" style={{ textAlign: 'center', maxWidth: '100%' }} data-reveal="">
            <div className="eyebrow" style={{ justifyContent: 'center' }}>Our World</div>
            <h2>YOZANの現場</h2>
          </div>
          <div className="photo-mosaic" data-reveal="">
            <div className="photo-mosaic-item" data-cap="インドアゴルフ施設の運営現場"><img src={IMG.golfSimulator2} alt="インドアゴルフ施設" loading="lazy" /></div>
            <div className="photo-mosaic-item" data-cap="レッスン・コーチング"><img src={IMG.golfCoach} alt="ゴルフコーチング" loading="lazy" /></div>
            <div className="photo-mosaic-item" data-cap="ゴルフコース"><img src={IMG.golfGreen} alt="ゴルフコース" loading="lazy" /></div>
            <div className="photo-mosaic-item" data-cap="KALLINOS アパレル"><img src={IMG.golfApparel} alt="ゴルフアパレル" loading="lazy" /></div>
            <div className="photo-mosaic-item" data-cap="チームでの業務改善"><img src={IMG.teamMeeting} alt="チームミーティング" loading="lazy" /></div>
          </div>
        </div>
      </section>

      {/* ▌Parallax Banner */}
      <section className="parallax-banner">
        <div className="parallax-banner-bg" style={{ backgroundImage: `url('${IMG.golfFairway}')` }} />
        <div className="container">
          <div className="parallax-banner-body" data-reveal="">
            <div className="eyebrow">Numbers &amp; Vision</div>
            <h2>成長を、数字と構想で見せる。</h2>
            <p className="lead" style={{ marginBottom: '32px' }}>信用力は、抽象論では作れません。YOZANは、現場に根ざした実績と拡張戦略の両方を提示します。</p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <Link className="btn primary" href="/vision">成長戦略を見る</Link>
              <Link className="btn secondary" href="/about">会社について</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ▌CTA */}
      <section className="section">
        <div className="container">
          <div className="cta-band" data-reveal="scale">
            <div className="eyebrow">Next Action</div>
            <h3>法人相談、マーケ相談、採用応募。<br />目的別に、最短でつながる導線を用意しています。</h3>
            <div className="btn-row">
              <Link className="btn primary" href="/contact">法人のお問い合わせ</Link>
              <Link className="btn secondary" href="/marketing">マーケティング相談をする</Link>
              <Link className="btn ghost" href="/recruit">採用情報を見る</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
