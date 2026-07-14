/**
 * KALLINOS - Shared HTML Components
 * Header, Footer, Nav injection for all pages
 */

function getHeaderHTML(activePage = '') {
  const navLinks = [
    { href: 'products.html',  label: 'Collection' },
    { href: 'brand.html',     label: 'Brand Story' },
    { href: 'size-guide.html',label: 'Size Guide' },
    { href: 'faq.html',       label: 'FAQ' },
    { href: 'contact.html',   label: 'Contact' },
  ];

  const navHTML = navLinks.map(link => `
    <a href="${link.href}" class="nav-link ${activePage === link.href ? 'nav-link--active' : ''}">${link.label}</a>
  `).join('');

  const mobileNavHTML = navLinks.map(link => `
    <a href="${link.href}" class="mobile-nav-link">
      ${link.label}
      <i class="fas fa-chevron-right"></i>
    </a>
  `).join('') + `
    <a href="auth.html" class="mobile-nav-link">
      Account
      <i class="fas fa-chevron-right"></i>
    </a>
    <a href="cart.html" class="mobile-nav-link">
      Cart
      <i class="fas fa-chevron-right"></i>
    </a>
  `;

  return `
    <header class="site-header" id="site-header">
      <div class="header-inner">
        <a href="index.html" class="site-logo" aria-label="KALLINOS トップへ">
          <span class="logo-text">KALLINOS</span>
        </a>

        <nav class="header-nav desktop-only" aria-label="グローバルナビ">
          ${navHTML}
        </nav>

        <div class="header-icons">
          <a href="auth.html" class="header-icon desktop-only header-login-link" title="ログイン" aria-label="ログイン">
            <i class="far fa-user"></i>
          </a>
          <a href="auth.html?tab=account" class="header-icon desktop-only header-account-link" title="マイアカウント" aria-label="マイアカウント" style="display:none">
            <i class="fas fa-user"></i>
          </a>
          <a href="cart.html" class="header-icon" title="カート" aria-label="カート">
            <i class="fas fa-shopping-bag"></i>
            <span class="cart-badge" style="display:none">0</span>
          </a>
          <button class="menu-toggle mobile-only" aria-label="メニューを開く" aria-expanded="false">
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>
    </header>

    <nav class="mobile-nav" aria-label="モバイルナビ">
      <div class="mobile-nav-links">
        ${mobileNavHTML}
      </div>
      <div style="margin-top:2rem; padding-top:1.5rem; border-top:1px solid var(--color-grey-6)">
        <p style="font-size:0.7rem; letter-spacing:0.2em; text-transform:uppercase; color:var(--color-grey-4); margin-bottom:1rem; font-family:var(--font-secondary);">FOLLOW US</p>
        <div style="display:flex; gap:1rem">
          <a href="#" style="color:var(--color-grey-3); font-size:1.1rem"><i class="fab fa-instagram"></i></a>
          <a href="#" style="color:var(--color-grey-3); font-size:1.1rem"><i class="fab fa-twitter"></i></a>
          <a href="#" style="color:var(--color-grey-3); font-size:1.1rem"><i class="fab fa-facebook-f"></i></a>
        </div>
      </div>
    </nav>
  `;
}

function getFooterHTML() {
  return `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-inner">
          <!-- Brand -->
          <div>
            <span class="footer-brand-logo">KALLINOS</span>
            <p class="footer-brand-desc">
              シンプルで洗練されたデザインに、ゴルフシーンで求められる機能性を融合したラグジュアリー・スポーツブランド。
            </p>
            <div class="footer-social">
              <a href="#" class="footer-social-link" aria-label="Instagram"><i class="fab fa-instagram"></i></a>
              <a href="#" class="footer-social-link" aria-label="Twitter"><i class="fab fa-twitter"></i></a>
              <a href="#" class="footer-social-link" aria-label="Facebook"><i class="fab fa-facebook-f"></i></a>
              <a href="#" class="footer-social-link" aria-label="YouTube"><i class="fab fa-youtube"></i></a>
            </div>
          </div>

          <!-- Collection -->
          <div>
            <h4 class="footer-nav-title">Collection</h4>
            <ul class="footer-nav-list">
              <li><a href="products.html?category=モックネック" class="footer-nav-link">モックネック</a></li>
              <li><a href="products.html?category=ポロシャツ" class="footer-nav-link">ポロシャツ</a></li>
              <li><a href="products.html?category=パンツ" class="footer-nav-link">パンツ</a></li>
              <li><a href="products.html?category=アウター" class="footer-nav-link">アウター</a></li>
              <li><a href="products.html?category=キャップ" class="footer-nav-link">キャップ</a></li>
              <li><a href="products.html?category=限定コレクション" class="footer-nav-link">限定コレクション</a></li>
            </ul>
          </div>

          <!-- Info -->
          <div>
            <h4 class="footer-nav-title">Information</h4>
            <ul class="footer-nav-list">
              <li><a href="brand.html" class="footer-nav-link">ブランドストーリー</a></li>
              <li><a href="size-guide.html" class="footer-nav-link">サイズガイド</a></li>
              <li><a href="faq.html" class="footer-nav-link">よくあるご質問</a></li>
              <li><a href="contact.html" class="footer-nav-link">お問い合わせ</a></li>
            </ul>
          </div>

          <!-- Legal -->
          <div>
            <h4 class="footer-nav-title">Legal</h4>
            <ul class="footer-nav-list">
              <li><a href="legal.html#tokushoho" class="footer-nav-link">特定商取引法に基づく表記</a></li>
              <li><a href="legal.html#privacy" class="footer-nav-link">プライバシーポリシー</a></li>
              <li><a href="legal.html#terms" class="footer-nav-link">利用規約</a></li>
              <li><a href="legal.html#returns" class="footer-nav-link">返品・交換について</a></li>
              <li><a href="legal.html#shipping" class="footer-nav-link">配送について</a></li>
            </ul>
          </div>
        </div>

        <div class="footer-bottom">
          <span>&copy; 2025 KALLINOS. All Rights Reserved.</span>
          <span style="letter-spacing:0.08em">Designed with care for those who seek quality.</span>
        </div>
      </div>
    </footer>
  `;
}

function injectComponents(activePage = '') {
  const headerMount = document.getElementById('header-mount');
  const footerMount = document.getElementById('footer-mount');

  if (headerMount) headerMount.innerHTML = getHeaderHTML(activePage);
  if (footerMount) footerMount.innerHTML = getFooterHTML();

  // ヘッダー挿入後にモバイルメニューを初期化
  const toggle = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('.mobile-nav');

  if (toggle && mobileNav) {
    toggle.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('active');
      toggle.classList.toggle('active');
      toggle.setAttribute('aria-expanded', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // リンククリックでメニューを閉じる
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        mobileNav.classList.remove('active');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  // ヘッダー認証状態・カートバッジ更新
  if (typeof updateHeaderAuth === 'function') updateHeaderAuth();
  if (typeof Cart !== 'undefined') Cart.updateBadge();
}

window.injectComponents = injectComponents;
window.getHeaderHTML    = getHeaderHTML;
window.getFooterHTML    = getFooterHTML;
