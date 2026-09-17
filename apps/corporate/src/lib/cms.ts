// HP管理（#249）から写真・文言・ブログ・インスタを読む。
// 公開RPC（hp_public_*）は「公開中のものだけ」返す。anon キーは公開前提のキー。
// 取得に失敗してもサイトは既定の写真・文言で表示される（落ちない設計）。
import { cache } from 'react'
import { IMG } from './constants'

const SB_URL = 'https://qrgpblnnhdudigarrtuz.supabase.co'
const SB_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZ3BibG5uaGR1ZGlnYXJydHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjQ1MzMsImV4cCI6MjA5ODU0MDUzM30.rOSGad36v_RoeBAbzSwCoi0imIc4zRwZ7Ub88EAHSCw'
export const SITE_CODE = 'yozan'
export const REVALIDATE = 60

export type PostSummary = {
  slug: string
  title: string
  excerpt: string | null
  cover_url: string | null
  category: string
  published_at: string
}
export type PostFull = PostSummary & { body: string; author_name: string | null; updated_at: string }
export type SiteContent = {
  slots: Record<string, string>
  posts: PostSummary[]
  instagram: { permalink: string; caption: string | null }[]
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      next: { revalidate: REVALIDATE, tags: ['hp'] },
    })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

export const getSite = cache(async (): Promise<SiteContent> => {
  const d = await rpc<SiteContent>('hp_public_site', { p_site: SITE_CODE })
  return { slots: d?.slots ?? {}, posts: d?.posts ?? [], instagram: d?.instagram ?? [] }
})

export const getPost = cache(async (slug: string): Promise<PostFull | null> => {
  return rpc<PostFull>('hp_public_post', { p_site: SITE_CODE, p_slug: slug })
})

/** 差し替え枠の写真。未設定・取得失敗なら既定の写真 */
export function pic(slots: Record<string, string>, key: string, fallback: string): string {
  const v = slots[key]
  if (!v) return fallback
  // 既定値は本番ドメインの絶対URLなので、同じ写真ならローカルパスで出す
  return v.replace(/^https:\/\/(www\.)?yozan-inc\.jp(?=\/images\/)/, '')
}

export function text(slots: Record<string, string>, key: string, fallback: string): string {
  const v = slots[key]
  return v && v.trim() ? v : fallback
}

export function fmtDay(iso: string) {
  const d = new Date(iso)
  const f = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
  return f.format(d)
}

export function excerptOf(p: { excerpt: string | null; body?: string }) {
  if (p.excerpt) return p.excerpt
  const plain = (p.body ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.slice(0, 110)
}

export { IMG }
