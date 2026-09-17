import type { MetadataRoute } from 'next'
import { getSite } from '@/lib/cms'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://yozan-inc.jp'
  const pages = ['', '/business', '/marketing', '/about', '/vision', '/recruit', '/contact', '/blog']
  const { posts } = await getSite()
  return [
    ...pages.map((p) => ({ url: `${base}${p}`, changeFrequency: 'monthly' as const, priority: p === '' ? 1 : 0.7 })),
    ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: p.published_at, changeFrequency: 'yearly' as const, priority: 0.6 })),
  ]
}
