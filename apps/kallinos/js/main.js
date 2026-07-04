/**
 * KALLINOS - Main JavaScript
 * Shared functionality across all pages
 */

/* ============================================================
   CONSTANTS & CONFIG
   ============================================================ */
const CONFIG = {
  cartKey:      'kallinos_cart',
  wishlistKey:  'kallinos_wishlist',
  userKey:      'kallinos_user',
  sessionKey:   'kallinos_session',
  shippingFree: 20000,  // 送料無料閾値
  shippingFee:  880,    // 送料
  taxRate:      0.10,   // 消費税率
};

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function formatPrice(price) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    minimumFractionDigits: 0
  }).format(price);
}

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/* ============================================================
   LOCAL STORAGE
   ============================================================ */
const Storage = {
  get:    (key) => JSON.parse(localStorage.getItem(key) || 'null'),
  set:    (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  remove: (key) => localStorage.removeItem(key),
};

/* ============================================================
   CART MANAGEMENT
   ============================================================ */
const Cart = {
  get() {
    return Storage.get(CONFIG.cartKey) || [];
  },

  save(items) {
    Storage.set(CONFIG.cartKey, items);
    Cart.updateBadge();
    document.dispatchEvent(new CustomEvent('cartUpdated', { detail: items }));
  },

  add(product, selectedSize, selectedColor, qty = 1) {
    const items = Cart.get();
    const cartId = `${product.id}_${selectedSize}_${selectedColor}`;
    const existing = items.find(i => i.cartId === cartId);

    if (existing) {
      existing.qty += qty;
    } else {
      items.push({
        cartId,
        id:          product.id,
        name:        product.name,
        price:       product.price,
        image_url:   product.image_url,
        category:    product.category,
        selectedSize,
        selectedColor,
        qty,
      });
    }

    Cart.save(items);
    showToast(`「${product.name}」をカートに追加しました`, 'success');
  },

  remove(cartId) {
    const items = Cart.get().filter(i => i.cartId !== cartId);
    Cart.save(items);
  },

  updateQty(cartId, qty) {
    const items = Cart.get();
    const item = items.find(i => i.cartId === cartId);
    if (item) {
      if (qty <= 0) {
        Cart.remove(cartId);
        return;
      }
      item.qty = qty;
      Cart.save(items);
    }
  },

  clear() {
    Cart.save([]);
  },

  getSubtotal() {
    return Cart.get().reduce((sum, i) => sum + i.price * i.qty, 0);
  },

  getCount() {
    return Cart.get().reduce((sum, i) => sum + i.qty, 0);
  },

  getShipping() {
    const sub = Cart.getSubtotal();
    return sub >= CONFIG.shippingFree ? 0 : CONFIG.shippingFee;
  },

  getTotal() {
    return Cart.getSubtotal() + Cart.getShipping();
  },

  updateBadge() {
    const count = Cart.getCount();
    $$('.cart-badge').forEach(el => {
      el.textContent = count;
      el.style.display = count > 0 ? 'flex' : 'none';
    });
  },
};

/* ============================================================
   WISHLIST MANAGEMENT
   ============================================================ */
const Wishlist = {
  get() {
    return Storage.get(CONFIG.wishlistKey) || [];
  },

  has(productId) {
    return Wishlist.get().includes(productId);
  },

  toggle(productId, productName) {
    const list = Wishlist.get();
    const idx  = list.indexOf(productId);

    if (idx > -1) {
      list.splice(idx, 1);
      showToast(`「${productName}」をお気に入りから削除しました`, 'info');
    } else {
      list.push(productId);
      showToast(`「${productName}」をお気に入りに追加しました`, 'success');
    }

    Storage.set(CONFIG.wishlistKey, list);
    document.dispatchEvent(new CustomEvent('wishlistUpdated', { detail: list }));
    return !( idx > -1 );
  },
};

/* ============================================================
   AUTH / SESSION
   ============================================================ */
const Auth = {
  getUser()  { return Storage.get(CONFIG.userKey); },
  getSession(){ return Storage.get(CONFIG.sessionKey); },
  isLoggedIn(){ return !!Auth.getUser() && !!Auth.getSession(); },

  login(userData, sessionToken) {
    Storage.set(CONFIG.userKey,    userData);
    Storage.set(CONFIG.sessionKey, sessionToken);
    document.dispatchEvent(new CustomEvent('authChanged', { detail: { loggedIn: true } }));
  },

  logout() {
    Storage.remove(CONFIG.userKey);
    Storage.remove(CONFIG.sessionKey);
    document.dispatchEvent(new CustomEvent('authChanged', { detail: { loggedIn: false } }));
    showToast('ログアウトしました', 'info');
  },
};

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(message, type = 'info', duration = 3000) {
  let container = $('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: 'fa-check-circle',
    error:   'fa-times-circle',
    info:    'fa-info-circle',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fas ${icons[type] || icons.info}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, duration + 300);
}

/* ============================================================
   HEADER BEHAVIOR
   ============================================================ */
function initHeader() {
  const header = $('.site-header');
  if (!header) return;

  // Scroll effect
  const onScroll = debounce(() => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, 50);

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile menu
  const toggle   = $('.menu-toggle');
  const mobileNav = $('.mobile-nav');

  if (toggle && mobileNav) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      mobileNav.classList.toggle('active');
      document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
    });
  }

  // Close mobile nav on link click
  $$('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => {
      toggle?.classList.remove('active');
      mobileNav?.classList.remove('active');
      document.body.style.overflow = '';
    });
  });

  // Update header auth state
  updateHeaderAuth();
  document.addEventListener('authChanged', updateHeaderAuth);

  // Update cart badge
  Cart.updateBadge();
  document.addEventListener('cartUpdated', Cart.updateBadge);
}

function updateHeaderAuth() {
  const user = Auth.getUser();
  const loginLink   = $('.header-login-link');
  const accountLink = $('.header-account-link');

  if (loginLink)   loginLink.style.display   = user ? 'none' : '';
  if (accountLink) accountLink.style.display = user ? '' : 'none';
}

/* ============================================================
   SCROLL ANIMATIONS
   ============================================================ */
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -60px 0px',
  });

  $$('.fade-up, .fade-in').forEach(el => observer.observe(el));
}

/* ============================================================
   ACCORDION
   ============================================================ */
function initAccordions() {
  $$('.accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion-item');
      const isActive = item.classList.contains('active');

      // Close all
      $$('.accordion-item').forEach(i => i.classList.remove('active'));

      // Open clicked (unless it was already open)
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}

/* ============================================================
   TABS
   ============================================================ */
function initTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabGroup = btn.closest('[data-tabs]');
      const target   = btn.dataset.tab;

      $$('.tab-btn', tabGroup || document).forEach(b => b.classList.remove('active'));
      $$('.tab-panel', tabGroup || document).forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      $(`[data-panel="${target}"]`)?.classList.add('active');
    });
  });
}

/* ============================================================
   NEWSLETTER FORM
   ============================================================ */
async function initNewsletter() {
  $$('.newsletter-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('.newsletter-input');
      const btn   = form.querySelector('.newsletter-btn');
      const email = input?.value?.trim();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('有効なメールアドレスを入力してください', 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = '登録中...';

      try {
        await fetch('tables/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, is_active: true }),
        });

        showToast('メールマガジンにご登録いただきありがとうございます', 'success');
        input.value = '';
      } catch {
        showToast('登録に失敗しました。後ほどお試しください', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '登録する';
      }
    });
  });
}

/* ============================================================
   PRODUCT CARD BUILDER
   ============================================================ */
function buildProductCard(product) {
  const isWished = Wishlist.has(product.id);
  const badges = [];
  if (product.is_new)     badges.push('<span class="product-card-badge badge-new">NEW</span>');
  if (product.is_limited) badges.push('<span class="product-card-badge badge-limited">LIMITED</span>');
  if (product.is_popular && !product.is_new) badges.push('<span class="product-card-badge badge-popular">POPULAR</span>');

  return `
    <article class="product-card fade-up" data-id="${product.id}">
      <a href="product-detail.html?id=${product.id}" class="product-card-image-wrap">
        <img
          src="${product.image_url || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80'}"
          alt="${product.name}"
          class="product-card-image"
          loading="lazy"
        >
        ${badges.join('')}
        <div class="product-card-actions">
          <button
            class="product-wishlist-btn ${isWished ? 'active' : ''}"
            data-id="${product.id}"
            data-name="${product.name}"
            onclick="event.preventDefault(); toggleWishlist(this)"
            aria-label="お気に入り"
          >
            <i class="${isWished ? 'fas' : 'far'} fa-heart"></i>
          </button>
          <a href="product-detail.html?id=${product.id}" class="btn btn-white btn-sm" style="flex:1">詳細を見る</a>
        </div>
      </a>
      <div class="product-card-info">
        <span class="product-card-category">${product.category || ''}</span>
        <h3 class="product-card-name">${product.name}</h3>
        <span class="product-card-price">${formatPrice(product.price)}</span>
      </div>
    </article>
  `;
}

function toggleWishlist(btn) {
  const id   = btn.dataset.id;
  const name = btn.dataset.name;
  const added = Wishlist.toggle(id, name);
  const icon  = btn.querySelector('i');

  if (added) {
    btn.classList.add('active');
    icon.classList.replace('far', 'fas');
  } else {
    btn.classList.remove('active');
    icon.classList.replace('fas', 'far');
  }
}
window.toggleWishlist = toggleWishlist;

/* ============================================================
   API HELPERS
   ============================================================ */
const API = {
  async getProducts(params = {}) {
    const qs = new URLSearchParams({ limit: 100, ...params });
    const res = await fetch(`tables/products?${qs}`);
    if (!res.ok) throw new Error('商品データの取得に失敗しました');
    return res.json();
  },

  async getProduct(id) {
    const res = await fetch(`tables/products/${id}`);
    if (!res.ok) throw new Error('商品が見つかりません');
    return res.json();
  },

  async createOrder(data) {
    const res = await fetch('tables/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('注文の送信に失敗しました');
    return res.json();
  },

  async getCoupon(code) {
    const res = await fetch(`tables/coupons?search=${encodeURIComponent(code)}`);
    if (!res.ok) throw new Error('クーポン情報の取得に失敗しました');
    const data = await res.json();
    return data.data?.find(c => c.code === code && c.is_active) || null;
  },

  async createMember(data) {
    const res = await fetch('tables/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('会員登録に失敗しました');
    return res.json();
  },

  async getMemberByEmail(email) {
    const res = await fetch(`tables/members?search=${encodeURIComponent(email)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.find(m => m.email === email) || null;
  },

  async submitContact(data) {
    const res = await fetch('tables/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('送信に失敗しました');
    return res.json();
  },
};

window.API = API;
window.Cart = Cart;
window.Wishlist = Wishlist;
window.Auth = Auth;
window.formatPrice = formatPrice;
window.buildProductCard = buildProductCard;
window.showToast = showToast;
window.CONFIG = CONFIG;

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initScrollAnimations();
  initAccordions();
  initTabs();
  initNewsletter();
});
