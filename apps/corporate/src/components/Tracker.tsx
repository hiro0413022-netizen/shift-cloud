'use client'
// 閲覧の計測（HP管理 #249）。Cookieは使わず、端末ごとのランダムIDを localStorage に置く。
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

const SB_URL = 'https://qrgpblnnhdudigarrtuz.supabase.co'
const SB_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZ3BibG5uaGR1ZGlnYXJydHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjQ1MzMsImV4cCI6MjA5ODU0MDUzM30.rOSGad36v_RoeBAbzSwCoi0imIc4zRwZ7Ub88EAHSCw'

function rid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
function stored(store: Storage | undefined, key: string) {
  try {
    if (!store) return rid()
    let v = store.getItem(key)
    if (!v) {
      v = rid()
      store.setItem(key, v)
    }
    return v
  } catch {
    return rid()
  }
}

let lastReferrer: string | null = null

export default function Tracker({ site }: { site: string }) {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname || navigator.webdriver) return
    if (/^(localhost|127\.)/.test(location.hostname)) return
    const q = new URLSearchParams(location.search)
    if (q.has('preview')) return
    // 最初の1回だけ外部の参照元を使う（サイト内の移動は internal 扱い）
    const referrer = lastReferrer === null ? document.referrer : location.origin + '/'
    lastReferrer = location.href
    const body = {
      p_site: site,
      p_path: pathname,
      p_referrer: referrer,
      p_src: q.get('src') ?? q.get('utm_source'),
      p_visitor: stored(typeof localStorage === 'undefined' ? undefined : localStorage, 'hp_vid'),
      p_session: stored(typeof sessionStorage === 'undefined' ? undefined : sessionStorage, 'hp_sid'),
      p_title: document.title,
      p_device: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    }
    const t = setTimeout(() => {
      fetch(`${SB_URL}/rest/v1/rpc/hp_track`, {
        method: 'POST',
        keepalive: true,
        headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => {})
    }, 300) // タイトルが切り替わるのを待つ
    return () => clearTimeout(t)
  }, [pathname, site])
  return null
}
