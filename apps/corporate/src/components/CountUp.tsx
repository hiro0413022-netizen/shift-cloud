'use client'

import { useEffect, useRef } from 'react'

interface Props {
  end: number
  suffix?: string
  prefix?: string
  duration?: number
  className?: string
}

export default function CountUp({ end, suffix = '', prefix = '', duration = 1600, className = '' }: Props) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      io.disconnect()
      const start = performance.now()
      const tick = (now: number) => {
        const p = Math.min((now - start) / duration, 1)
        const eased = 1 - Math.pow(1 - p, 3)
        el.textContent = `${prefix}${Math.round(end * eased)}${suffix}`
        if (p < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [end, suffix, prefix, duration])

  return <span ref={ref} className={className}>{prefix}0{suffix}</span>
}
