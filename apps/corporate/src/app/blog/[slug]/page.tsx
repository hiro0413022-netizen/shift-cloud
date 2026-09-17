import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import PostCard from '@/components/PostCard'
import { renderBody } from '@/lib/body'
import { excerptOf, fmtDay, getPost, getSite } from '@/lib/cms'

export const revalidate = 60

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return { title: '記事が見つかりません', robots: { index: false } }
  const desc = excerptOf(post)
  return {
    title: post.title,
    description: desc,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: desc,
      publishedTime: post.published_at,
      images: post.cover_url ? [{ url: post.cover_url }] : undefined,
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = await getPost(decodeURIComponent(slug))
  if (!post) notFound()
  const { posts } = await getSite()
  const others = posts.filter((p) => p.slug !== post.slug).slice(0, 3)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    image: post.cover_url ? [post.cover_url] : undefined,
    author: { '@type': 'Organization', name: '株式会社YOZAN' },
    publisher: { '@type': 'Organization', name: '株式会社YOZAN' },
    mainEntityOfPage: `https://yozan-inc.jp/blog/${post.slug}`,
  }
  return (
    <>
      <section className="article-hero">
        <div className="container article-wrap">
          <div className="breadcrumb" style={{ color: 'var(--text-soft)' }}>
            <Link href="/">HOME</Link> / <Link href="/blog">BLOG</Link>
          </div>
          <div className="post-meta" style={{ marginTop: '18px' }}>
            <time dateTime={post.published_at}>{fmtDay(post.published_at)}</time>
            <span className="post-cat">{post.category}</span>
          </div>
          <h1 className="article-title">{post.title}</h1>
          {post.author_name && <div className="muted" style={{ fontSize: '13px' }}>{post.author_name}</div>}
        </div>
      </section>
      <section className="section-sm" style={{ paddingTop: 0 }}>
        <div className="container article-wrap">
          {post.cover_url && <img className="article-cover" src={post.cover_url} alt="" />}
          <div className="article-body" dangerouslySetInnerHTML={{ __html: renderBody(post.body) }} />
          <div className="btn-row" style={{ marginTop: '48px' }}>
            <Link className="btn secondary dark" href="/blog">← 記事一覧へ</Link>
            <Link className="btn primary" href="/contact">お問い合わせ</Link>
          </div>
        </div>
      </section>
      {others.length > 0 && (
        <section className="section alt">
          <div className="container">
            <div className="eyebrow">More</div>
            <h2 style={{ fontSize: 'clamp(22px,2.6vw,32px)', margin: '8px 0 28px' }}>ほかの記事</h2>
            <div className="post-grid">
              {others.map((p) => (
                <PostCard key={p.slug} post={p} />
              ))}
            </div>
          </div>
        </section>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </>
  )
}
