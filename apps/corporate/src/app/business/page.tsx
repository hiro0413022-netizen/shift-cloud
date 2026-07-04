import type { Metadata } from 'next'
import Link from 'next/link'
import FadeUp from '@/components/FadeUp'
import { IMG } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'BUSINESS',
  description: 'YOZANの5事業を紹介。人材事業・DX事業・マーケティング事業・運営支援・アパレル事業でゴルフ業界を支える一貫モデル。',
}

export default function BusinessPage() {
  return (
    <>
      {/* ▌PAGE HERO */}
      <section className="page-hero">
        <div className="page-hero-bg" style={{ backgroundImage: `url('${IMG.golfCourse}')` }} />
        <div className="container hero-inner">
          <div className="breadcrumb">HOME / BUSINESS</div>
          <div className="section-head">
            <div className="eyebrow" style={{ color: '#e2c98d' }}>Business</div>
            <h1>ゴルフ業界を、<br />点ではなく面で支える。</h1>
            <p className="lead">YOZANの5事業は、別々の収益源ではありません。人材・DX・マーケティング・運営支援・アパレルをつなぎ、業界の成長導線そのものをつくるための事業群です。</p>
          </div>
        </div>
      </section>

      {/* ▌01 人材事業 */}
      <section className="section" id="human">
        <div className="container">
          <FadeUp>
            <div className="img-split">
              <div className="img-split-photo">
                <img src={IMG.golfCoach} alt="人材事業" loading="lazy" />
              </div>
              <div className="img-split-body">
                <div className="eyebrow">01 / 人材事業</div>
                <h2 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>人を育て、<br />現場へ届ける。</h2>
                <p style={{ marginTop: '16px', color: 'var(--text-soft)', lineHeight: '1.85' }}>
                  ゴルフ業界の現場を支える人材を、採用・育成・派遣まで一貫して担います。単なる人材紹介ではなく、現場品質を高める人材育成を軸に、業界の人手不足課題に実務で応えます。
                </p>
                <div className="service-tags" style={{ marginTop: '24px' }}>
                  <span className="service-tag">キャディー派遣</span>
                  <span className="service-tag">レッスンプロ派遣</span>
                  <span className="service-tag">人材育成</span>
                </div>
                <div className="grid grid-3" style={{ marginTop: '24px', gap: '16px' }}>
                  {[
                    { icon: '🎒', title: 'キャディー派遣', desc: 'ゴルフ場のプレーサポート・接客品質を支える人材を供給します。' },
                    { icon: '🏌️', title: 'レッスンプロ派遣', desc: '施設・スクール・イベント向けにプロコーチを派遣し、教育品質を安定化。' },
                    { icon: '🎓', title: '人材育成', desc: '採用から教育・配置まで一貫した育成プログラムで現場力を底上げ。' },
                  ].map(({ icon, title, desc }) => (
                    <div key={title} className="card" style={{ padding: '20px', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>{icon}</div>
                      <h3 style={{ fontSize: '15px', marginBottom: '6px' }}>{title}</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-soft)' }}>{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌02 DX事業 */}
      <section className="section alt" id="dx">
        <div className="container">
          <FadeUp>
            <div className="img-split reverse">
              <div className="img-split-photo">
                <img src={IMG.golfSimulator} alt="DX事業" loading="lazy" />
              </div>
              <div className="img-split-body">
                <div className="eyebrow">02 / DX事業</div>
                <h2 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>ゴルフ施設の業務を、<br />デジタルで再設計する。</h2>
                <p style={{ marginTop: '16px', color: 'var(--text-soft)', lineHeight: '1.85' }}>
                  予約・レッスン管理・在庫・発注といった現場業務をDXで効率化。自社開発プロダクトとカスタムシステムで、施設運営の生産性を抜本的に改善します。
                </p>
                <div className="service-tags" style={{ marginTop: '24px' }}>
                  <span className="service-tag">PGA NOTE</span>
                  <span className="service-tag">Golf OS</span>
                  <span className="service-tag">発注管理システム</span>
                  <span className="service-tag">在庫管理システム</span>
                </div>
                <div className="grid grid-2" style={{ marginTop: '24px', gap: '16px' }}>
                  {[
                    { icon: '📋', title: 'PGA NOTE', desc: 'レッスン記録・顧客管理をデジタル化し、コーチと生徒の継続率を高める管理ツール。' },
                    { icon: '⚙️', title: 'Golf OS', desc: '施設の予約・売上・スタッフ管理を一元化するオールインワン運営システム。' },
                    { icon: '📦', title: '発注管理システム', desc: '用品・消耗品の発注フローを自動化し、在庫切れ・過剰発注を防止。' },
                    { icon: '🗄️', title: '在庫管理システム', desc: 'リアルタイム在庫把握と棚卸効率化。現場オペレーションのムダを排除。' },
                  ].map(({ icon, title, desc }) => (
                    <div key={title} className="card" style={{ padding: '20px' }}>
                      <div style={{ fontSize: '28px', marginBottom: '8px' }}>{icon}</div>
                      <h3 style={{ fontSize: '15px', marginBottom: '6px' }}>{title}</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-soft)' }}>{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌03 マーケティング事業 */}
      <section className="section" id="marketing">
        <div className="container">
          <FadeUp>
            <div className="img-split">
              <div className="img-split-photo">
                <img src={IMG.snsMarketing} alt="マーケティング事業" loading="lazy" />
              </div>
              <div className="img-split-body">
                <div className="eyebrow">03 / マーケティング事業</div>
                <h2 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>集客を、<br />属人化から仕組みへ。</h2>
                <p style={{ marginTop: '16px', color: 'var(--text-soft)', lineHeight: '1.85' }}>
                  SNS運用からLP・HP制作、広告運用まで、ゴルフ業界の集客導線を一気通貫で設計・実行します。自社施設で検証したノウハウを、再現性のある形で提供します。
                </p>
                <div className="service-tags" style={{ marginTop: '24px' }}>
                  <span className="service-tag">SNS運用</span>
                  <span className="service-tag">LP制作</span>
                  <span className="service-tag">HP制作</span>
                  <span className="service-tag">広告運用</span>
                </div>
                <div className="btn-row" style={{ marginTop: '28px' }}>
                  <Link className="btn primary" href="/marketing">マーケティング詳細を見る</Link>
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌04 運営支援 */}
      <section className="section alt" id="operation">
        <div className="container">
          <FadeUp>
            <div className="img-split reverse">
              <div className="img-split-photo">
                <img src={IMG.golfSimulator2} alt="運営支援" loading="lazy" />
              </div>
              <div className="img-split-body">
                <div className="eyebrow">04 / 運営支援</div>
                <h2 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>開業から運営まで、<br />現場知見で伴走する。</h2>
                <p style={{ marginTop: '16px', color: 'var(--text-soft)', lineHeight: '1.85' }}>
                  インドアゴルフ施設の自社運営経験をもとに、開業支援から日常的な運営代行・改善提案まで、現場感覚で寄り添います。
                </p>
                <div className="service-tags" style={{ marginTop: '24px' }}>
                  <span className="service-tag">開業支援</span>
                  <span className="service-tag">運営代行</span>
                  <span className="service-tag">店舗改善</span>
                </div>
                <div className="grid grid-3" style={{ marginTop: '24px', gap: '16px' }}>
                  {[
                    { icon: '🏗️', title: '開業支援', desc: '物件選定から内装・機器・スタッフ採用・集客設計まで開業をフルサポート。' },
                    { icon: '🔄', title: '運営代行', desc: '日常オペレーション・スタッフ管理・顧客対応を代行し、オーナー負担を軽減。' },
                    { icon: '📈', title: '店舗改善', desc: '現地調査・数値分析・改善提案で稼働率・継続率・客単価を底上げ。' },
                  ].map(({ icon, title, desc }) => (
                    <div key={title} className="card" style={{ padding: '20px', textAlign: 'center' }}>
                      <div style={{ fontSize: '32px', marginBottom: '8px' }}>{icon}</div>
                      <h3 style={{ fontSize: '15px', marginBottom: '6px' }}>{title}</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-soft)' }}>{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌05 アパレル事業 */}
      <section className="section" id="apparel">
        <div className="container">
          <FadeUp>
            <div className="img-split">
              <div className="img-split-photo">
                <img src={IMG.golfApparel} alt="アパレル事業" loading="lazy" />
              </div>
              <div className="img-split-body">
                <div className="eyebrow">05 / アパレル事業</div>
                <h2 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>ゴルフを、<br />もっと格好よく。</h2>
                <p style={{ marginTop: '16px', color: 'var(--text-soft)', lineHeight: '1.85' }}>
                  KALLINOSは、ゴルフをライフスタイルとして楽しむプレーヤーのためのアパレルブランドです。ウェア・キャップ・バッグ・ベルトなど、コースから日常まで使えるアイテムを展開しています。
                </p>
                <div className="service-tags" style={{ marginTop: '24px' }}>
                  <span className="service-tag">KALLINOS</span>
                  <span className="service-tag">ゴルフウェア</span>
                  <span className="service-tag">キャップ</span>
                  <span className="service-tag">バッグ</span>
                  <span className="service-tag">ベルト</span>
                </div>
                <div className="btn-row" style={{ marginTop: '28px' }}>
                  <a className="btn primary" href="https://www.kallinos.jp/" target="_blank" rel="noopener">
                    KALLINOSブランドサイト ↗
                  </a>
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌5事業一貫モデル */}
      <section className="section" style={{ background: 'var(--navy)', color: 'var(--white)' }}>
        <div className="container">
          <FadeUp className="section-head" style={{ textAlign: 'center', maxWidth: '100%' }}>
            <div className="eyebrow" style={{ justifyContent: 'center' }}>Business Model</div>
            <h2>YOZANの一貫モデル</h2>
            <p className="lead" style={{ maxWidth: '640px', margin: '0 auto' }}>
              人を育て、DXで効率化し、マーケで集客し、運営で成果を出し、アパレルで体験価値を高める。5事業が一つの流れとして機能します。
            </p>
          </FadeUp>
          <FadeUp>
            <div className="grid grid-5">
              {[
                { icon: '👥', num: '01', title: '人材で支える', sub: 'キャディー・コーチ・人材育成' },
                { icon: '💻', num: '02', title: 'DXで効率化', sub: 'PGA NOTE・Golf OS・管理システム' },
                { icon: '📱', num: '03', title: 'マーケで集客', sub: 'SNS・LP・HP・広告運用' },
                { icon: '🏌️', num: '04', title: '運営で成果を出す', sub: '開業支援・運営代行・店舗改善' },
                { icon: '👗', num: '05', title: 'アパレルで体験価値を高める', sub: 'KALLINOS・ゴルフライフスタイル' },
              ].map(({ icon, num, title, sub }) => (
                <div key={num} className="card dark" style={{ textAlign: 'center', padding: '28px 16px' }}>
                  <div style={{ fontSize: '36px', marginBottom: '10px' }}>{icon}</div>
                  <div style={{ fontSize: '11px', color: 'var(--gold)', fontWeight: 700, marginBottom: '6px' }}>{num}</div>
                  <h3 style={{ fontSize: '16px', marginBottom: '6px' }}>{title}</h3>
                  <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '12px' }}>{sub}</p>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ▌CTA */}
      <section className="section">
        <div className="container">
          <FadeUp>
            <div className="cta-band">
              <h3>まずは、どの事業でもお気軽にご相談ください。</h3>
              <div className="btn-row">
                <Link className="btn primary" href="/contact">法人のお問い合わせ</Link>
                <Link className="btn ghost" href="/recruit">採用情報を見る</Link>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  )
}
