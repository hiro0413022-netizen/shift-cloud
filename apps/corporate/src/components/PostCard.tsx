import Link from 'next/link'
import { excerptOf, fmtDay, IMG, type PostSummary } from '@/lib/cms'

export default function PostCard({ post }: { post: PostSummary }) {
  return (
    <Link href={`/blog/${post.slug}`} className="post-card">
      <div className="post-card-img">
        <img src={post.cover_url || IMG.teamMeeting} alt="" loading="lazy" />
      </div>
      <div className="post-card-body">
        <div className="post-meta">
          <time dateTime={post.published_at}>{fmtDay(post.published_at)}</time>
          <span className="post-cat">{post.category}</span>
        </div>
        <h3>{post.title}</h3>
        <p>{excerptOf(post)}</p>
      </div>
    </Link>
  )
}
