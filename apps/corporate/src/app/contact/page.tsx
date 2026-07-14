import type { Metadata } from 'next'
import Link from 'next/link'
import FadeUp from '@/components/FadeUp'
import { IMG } from '@/lib/constants'

export const metadata: Metadata = {
  title: 'CONTACT',
  description: '株式会社YOZANへのお問い合わせ。法人相談、マーケティング相談、採用に関するご相談を受け付けています。',
}

export default function ContactPage() {
  const cards = [
    {
      icon: '🤝', eyebrow: 'For Business', title: '法人のお問い合わせ',
      desc: '事業提携、人材・DX・運営支援のご相談、取材依頼はこちら。',
      hint: '推奨件名：法人問い合わせ / 事業提携 / 取材依頼',
      mailSubject: '法人お問い合わせ', label: 'メールを送る',
    },
    {
      icon: '📱', eyebrow: 'For Marketing', title: 'マーケティング相談',
      desc: 'SNS運用・LP/HP制作・広告運用のご相談はこちら。',
      hint: '推奨件名：マーケ相談 / SNS相談 / HP制作',
      mailSubject: 'マーケティング相談', label: 'マーケ相談メールを送る',
    },
    {
      icon: '🎯', eyebrow: 'For Recruit', title: '採用に関するお問い合わせ',
      desc: '応募、カジュアル面談、採用に関する質問はこちら。',
      hint: '推奨件名：採用応募 / カジュアル面談 / 採用質問',
      mailSubject: '採用に関するお問い合わせ', label: '採用メールを送る',
    },
  ]

  return (
    <>
      <section className="page-hero" style={{ minHeight: '420px' }}>
        <div className="page-hero-bg" style={{ backgroundImage: `url('${IMG.golfGreen}')` }} />
        <div className="container hero-inner">
          <div className="breadcrumb">HOME / CONTACT</div>
          <div className="section-head">
            <div className="eyebrow" style={{ color: '#e2c98d' }}>Contact</div>
            <h1>目的別に、最短でつながる。</h1>
            <p className="lead">事業提携、マーケティング相談、採用、取材等のご相談を受け付けています。内容を確認のうえ、担当者よりご連絡いたします。</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <FadeUp>
            <div className="contact-grid">
              {cards.map(({ icon, eyebrow, title, desc, hint, mailSubject, label }) => (
                <div key={title} className="contact-card">
                  <div style={{ fontSize: '40px', marginBottom: '16px' }}>{icon}</div>
                  <div className="eyebrow">{eyebrow}</div>
                  <h3 style={{ marginTop: '12px' }}>{title}</h3>
                  <p className="muted" style={{ marginTop: '12px', fontSize: '14px' }}>{desc}</p>
                  <p style={{ marginTop: '16px', fontSize: '13px' }}><strong>推奨件名：</strong>{hint.replace('推奨件名：', '')}</p>
                  <a
                    className="btn primary"
                    style={{ marginTop: '20px', width: '100%', justifyContent: 'center' }}
                    href={`mailto:info@yozan-inc.jp?subject=${encodeURIComponent(mailSubject)}`}
                  >
                    {label}
                  </a>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <FadeUp>
            <div className="img-split">
              <div className="img-split-photo">
                <img src={IMG.golfSimulator} alt="YOZAN" loading="lazy" />
              </div>
              <div className="img-split-body">
                <div className="eyebrow">Mail</div>
                <h2 style={{ fontSize: 'clamp(24px,3vw,40px)' }}>共通窓口</h2>
                <p style={{ marginTop: '20px', fontSize: '22px', fontWeight: 700, color: 'var(--navy)' }}>
                  <a href="mailto:info@yozan-inc.jp" style={{ color: 'var(--navy-2)' }}>info@yozan-inc.jp</a>
                </p>
                <p className="muted" style={{ marginTop: '16px', fontSize: '14px' }}>ご不明な点はお気軽にご連絡ください。担当者よりご返信いたします。</p>
                <div className="pill-nav">
                  <Link href="/">TOPへ戻る</Link>
                  <Link href="/recruit">採用ページ</Link>
                  <Link href="/business">事業一覧</Link>
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  )
}
