'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" href="/">YOZAN<span> GROUP</span></Link>
        <nav className="nav">
          <Link href="/business">BUSINESS</Link>
          <Link href="/marketing">MARKETING</Link>
          <Link href="/about">ABOUT</Link>
          <Link href="/vision">VISION</Link>
          <Link href="/recruit">RECRUIT</Link>
          <Link href="/contact">CONTACT</Link>
        </nav>
        <div className="header-cta">
          <Link className="btn ghost" href="/marketing">マーケ相談</Link>
          <Link className="btn primary" href="/contact">法人お問い合わせ</Link>
        </div>
        <button
          className="menu-btn"
          aria-label="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>
      <div className={`container mobile-nav${menuOpen ? ' open' : ''}`}>
        <Link href="/business"  onClick={() => setMenuOpen(false)}>BUSINESS</Link>
        <Link href="/marketing" onClick={() => setMenuOpen(false)}>MARKETING</Link>
        <Link href="/about"     onClick={() => setMenuOpen(false)}>ABOUT</Link>
        <Link href="/vision"    onClick={() => setMenuOpen(false)}>VISION</Link>
        <Link href="/recruit"   onClick={() => setMenuOpen(false)}>RECRUIT</Link>
        <Link href="/contact"   onClick={() => setMenuOpen(false)}>CONTACT</Link>
      </div>
    </header>
  )
}
