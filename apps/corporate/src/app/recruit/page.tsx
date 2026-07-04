import type { Metadata } from 'next'
import Link from 'next/link'
import FadeUp from '@/components/FadeUp'
import { IMG } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'RECRUIT',
  description: 'YOZANの採用情報。人材・DX・マーケティング・運営支援・アパレルの成長企業で伸びたい人材を募集。',
}

export default function RecruitPage() {
  const jobs = [
    { icon: '🎒', title: 'キャディースタッフ', desc: 'ゴルフ場へのキャディー派遣。プレーサポート・接客・顧客体験向上。' },
    { icon: '🏌️', title: 'レッスンプロ / コーチ', desc: '施設・スクール・イベントへのコーチ派遣。教育品質と顧客満足を高める。' },
    { icon: '💻', title: 'DX・システム担当', desc: 'PGA NOTE・Golf OSなどのプロダクト開発・導入支援・カスタマーサクセス。' },
    { icon: '📱', title: 'SNSマーケティング担当', desc: '企画・撮影ディレクション・投稿制作・分析改善。' },
    { icon: '🎬', title: 'クリエイティブ担当', desc: '動画編集・デザイン・LP/HP制作・広告素材制作。' },
    { icon: '🏢', title: '施設運営・開業支援', desc: 'インドアゴルフ施設の運営管理・新規開業プロジェクト推進。' },
    { icon: '👗', title: 'アパレル / ブランド担当', desc: 'KALLINOSのブランド企画・商品開発・EC運営・販促。' },
    { icon: '💼', title: '営業・事業開発', desc: '法人提案・パートナー開拓・新規事業推進。' },
  ]

  return (
    <>
      <section className="page-hero" style={{ minHeight: '500px' }}>
        <div className="page-hero-bg" style={{ backgroundImage: `url('${IMG.golfSwing}')` }} />
        <div className="container hero-inner">
          <div className="breadcrumb">HOME / RECRUIT</div>
          <div className="section-head">
            <div className="eyebrow" style={{ color: '#e2c98d' }}>Recruit</div>
            <h1>伸びる会社で、<br />伸びる仕事を。</h1>
            <p className="lead">YOZANは、完成された人材より、前進をつくれる人を歓迎します。現場を知り、仕組みをつくり、ゴルフ業界の未来を支える側へ。</p>
            <div className="btn-row" style={{ marginTop: '28px' }}>
              <Link className="btn primary" href="/contact">エントリーする</Link>
              <a className="btn secondary" href="#jobs">募集職種を見る</a>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <FadeUp>
            <div className="img-split reverse">
              <div className="img-split-photo">
                <img src={IMG.teamMeeting} alt="チーム" loading="lazy" />
              </div>
              <div className="img-split-body">
                <div className="eyebrow">Ideal Profile</div>
                <h2 style={{ fontSize: 'clamp(24px,3vw,40px)' }}>YOZANが求める<br />人物像</h2>
                <ul className="list-clean" style={{ marginTop: '24px' }}>
                  <li>成長企業の中で、自分も成長したい人</li>
                  <li>現場感覚と実行力を大切にできる人</li>
                  <li>指示待ちではなく、改善提案ができる人</li>
                  <li>ゴルフ・接客・スポーツ・IT・SNSに関心がある人</li>
                  <li>チームで成果をつくることに価値を感じる人</li>
                </ul>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="section alt" id="jobs">
        <div className="container">
          <FadeUp className="section-head">
            <div className="eyebrow">Open Roles</div>
            <h2>募集職種</h2>
            <p className="text-lg">5事業を持つYOZANでは、多様なキャリアに挑戦できます。</p>
          </FadeUp>
          <FadeUp>
            <div className="jobs">
              {jobs.map(({ icon, title, desc }) => (
                <div key={title} className="job">
                  <div style={{ fontSize: '28px', marginBottom: '12px' }}>{icon}</div>
                  <h3>{title}</h3>
                  <p className="muted" style={{ marginTop: '8px', fontSize: '14px' }}>{desc}</p>
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
              <div className="img-split-photo">
                <img src={IMG.golfCoach} alt="キャリアパス" loading="lazy" />
              </div>
              <div className="img-split-body">
                <div className="eyebrow">Career Path</div>
                <h2 style={{ fontSize: 'clamp(22px,2.5vw,36px)' }}>ひとつの職種で終わらない。<br />事業成長とともに役割も広がる。</h2>
                <div className="table-like" style={{ marginTop: '24px' }}>
                  {[
                    { dept: '人材事業', path: 'スタッフ → リーダー → 人材事業責任者' },
                    { dept: 'DX事業', path: '担当 → PdM → DX事業責任者' },
                    { dept: 'マーケ', path: '担当 → ディレクター → マーケティング責任者' },
                    { dept: '運営支援', path: 'スタッフ → 店長 → エリア責任者 → 事業責任者' },
                    { dept: 'アパレル', path: '担当 → MD → ブランドディレクター' },
                  ].map(({ dept, path }) => (
                    <div key={dept} className="table-row">
                      <strong>{dept}</strong>
                      <div>{path}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--surface)' }}>
        <div className="container">
          <FadeUp>
            <div className="cta-band" style={{ background: 'linear-gradient(135deg,#dfe7f6,#f0f4fa)', color: '#111' }}>
              <h3 style={{ color: 'var(--navy)' }}>経験の有無より、挑戦する姿勢を重視します。</h3>
              <p style={{ color: 'var(--text-soft)' }}>カジュアル面談からでも構いません。成長企業の中で、自分の可能性を広げたい方を歓迎します。</p>
              <div className="btn-row">
                <Link className="btn primary" href="/contact">エントリーする</Link>
                <a className="btn secondary dark" href="mailto:info@yozan-inc.jp">採用に関するメールを送る</a>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  )
}
