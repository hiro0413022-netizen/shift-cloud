import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import MotionFx from '@/components/MotionFx'

export const metadata: Metadata = {
  title: { default: '株式会社YOZAN | ゴルフ業界の成長を、仕組みで支える会社', template: '%s | 株式会社YOZAN' },
  description: '株式会社YOZANのコーポレートサイト。人材事業・DX事業・マーケティング事業・運営支援・アパレル事業を通じてゴルフ業界の成長を支える会社です。',
  metadataBase: new URL('https://yozan-inc.jp'),
  openGraph: {
    siteName: '株式会社YOZAN',
    locale: 'ja_JP',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <MotionFx />
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
