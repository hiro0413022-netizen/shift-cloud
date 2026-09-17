'use client'
import { useEffect } from 'react'

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } }
  }
}

export default function InstagramFeed({ items }: { items: { permalink: string }[] }) {
  useEffect(() => {
    const run = () => window.instgrm?.Embeds.process()
    if (window.instgrm) return run()
    if (document.getElementById('ig-embed-js')) return
    const s = document.createElement('script')
    s.id = 'ig-embed-js'
    s.async = true
    s.src = 'https://www.instagram.com/embed.js'
    s.onload = run
    document.body.appendChild(s)
  }, [items])
  return (
    <div className="ig-grid">
      {items.map((i) => (
        <div className="ig-item" key={i.permalink}>
          <blockquote className="instagram-media" data-instgrm-permalink={i.permalink} data-instgrm-version="14">
            <a href={i.permalink} target="_blank" rel="noopener">Instagramで見る</a>
          </blockquote>
        </div>
      ))}
    </div>
  )
}
