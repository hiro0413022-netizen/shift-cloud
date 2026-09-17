import type { Metadata } from 'next'
import PostCard from '@/components/PostCard'
import { getSite, pic, IMG } from '@/lib/cms'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'NEWS & BLOG',
  description: '株式会社YOZANのお知らせ・ブログ。ゴルフ業界の現場から、事業のニュースや取り組みをお届けします。',
  alternates: { canonical: '/blog' },
}

export default async function BlogIndexPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { slots, posts } = await getSite()
  const { cat } = await searchParams
  const cats = Array.from(new Set(posts.map((p) => p.category)))
  const list = cat ? posts.filter((p) => p.category === cat) : posts
  return (
    <>
      <section className="page-hero" style={{ minHeight: '380px' }}>
        <div className="page-hero-bg" style={{ backgroundImage: `url('${pic(slots, 'home.photo8', IMG.golfFairway)}')` }} />
        <div className="container hero-inner">
          <div className="breadcrumb">HOME / BLOG</div>
          <div className="section-head">
            <div className="eyebrow" style={{ color: '#e2c98d' }}>News &amp; Blog</div>
            <h1>お知らせ・ブログ</h1>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          {cats.length > 1 && (
            <div className="pill-nav" style={{ marginBottom: '28px' }}>
              <a href="/blog" className={!cat ? 'active' : ''}>すべて</a>
              {cats.map((c) => (
                <a key={c} href={`/blog?cat=${encodeURIComponent(c)}`} className={cat === c ? 'active' : ''}>{c}</a>
              ))}
            </div>
          )}
          {list.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', padding: '60px 0' }}>まだ記事はありません。</p>
          ) : (
            <div className="post-grid">
              {list.map((p) => (
                <PostCard key={p.slug} post={p} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  )
}
