'use client'

import { useEffect } from 'react'

/**
 * Global motion effects:
 * - Top scroll progress bar (gold)
 * - IntersectionObserver reveal for any element with [data-reveal]
 *   (optional data-delay="1..8" for stagger)
 * - Soft parallax for [data-parallax] backgrounds
 */
export default function MotionFx() {
  useEffect(() => {
    // Scroll progress bar
    const bar = document.getElementById('scroll-progress')
    const onScroll = () => {
      if (!bar) return
      const h = document.documentElement
      const max = h.scrollHeight - h.clientHeight
      bar.style.transform = `scaleX(${max > 0 ? h.scrollTop / max : 0})`
      // parallax
      document.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el => {
        const r = el.getBoundingClientRect()
        const speed = parseFloat(el.dataset.parallax || '0.18')
        const offset = (r.top + r.height / 2 - window.innerHeight / 2) * speed
        el.style.transform = `translateY(${offset}px)`
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    // Reveal on scroll
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target) }
      }),
      { threshold: 0.14 }
    )
    document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el))

    return () => { window.removeEventListener('scroll', onScroll); io.disconnect() }
  }, [])

  return <div id="scroll-progress" aria-hidden="true" />
}
