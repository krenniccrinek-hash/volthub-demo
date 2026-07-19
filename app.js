/* IonxSupply demo — simulated marketplace app. All data in localStorage. */

/* ================= state ================= */
const DBKEY = 'ionxsupply_db_v1';
let DB;
try { DB = JSON.parse(localStorage.getItem(DBKEY)) || null; } catch (e) { DB = null; }
if (!DB || DB.v !== 3) {
  DB = seedDB();
  DB.v = 3;
  DB.products.forEach(p => { p.img = 'img/' + p.id + '.jpg'; });  // real CC-licensed photos; partArt() SVG is the onerror fallback
  const _sc = DB.products.find(p => p.id === 'p_bbshd'); if (_sc) _sc.imgs = ['img/p_bbshd.jpg', 'img/p_torque.jpg', 'img/p_kt35.jpg'];  // demo multi-photo gallery
  DB.guestCart = { items: [], codes: {} };
  save();
}
if (!DB.guestCart) DB.guestCart = { items: [], codes: {} };

function save() {
  try { localStorage.setItem(DBKEY, JSON.stringify(DB)); }
  catch (e) { console.warn('save failed', e); if (typeof toast === 'function') toast('<b>Storage is full.</b> Try fewer or smaller images.', 'err'); }
}
function resetDemo() { localStorage.removeItem(DBKEY); location.hash = '#/'; location.reload(); }

const me = () => DB.users.find(u => u.id === DB.session) || null;
const sellerById = (id) => DB.sellers.find(s => s.id === id);
const productById = (id) => DB.products.find(p => p.id === id);
const userById = (id) => DB.users.find(u => u.id === id);
const bikeById = (id) => BIKES.find(b => b.id === id);
const catById = (id) => CATS.find(c => c.id === id);
const mySeller = () => { const u = me(); return u && u.sellerId ? sellerById(u.sellerId) : null; };
const cartOf = () => me() ? me().cart : DB.guestCart;

function ratingOf(sellerId) {
  const rs = DB.reviews.filter(r => r.sellerId === sellerId && !r.hidden);
  if (!rs.length) return { avg: 0, count: 0 };
  return { avg: rs.reduce((s, r) => s + r.rating, 0) / rs.length, count: rs.length };
}
const sellerActive = (id) => { const s = sellerById(id); return s && s.status === 'active'; };
const visibleProducts = () => DB.products.filter(p => p.qty > 0 && sellerActive(p.sellerId));

/* ---------- storefront branding ---------- */
const sellerBannerBg = (s) => s.banner ? `url('${s.banner}') center/cover no-repeat` : s.color;
const sellerLogoBg = (s) => s.accent || s.color;
const sellerInitials = (s) => esc(s.name.split(' ').map(w => w[0]).join('').slice(0, 2));
const logoContent = (s) => s.logo ? `<img class="logo-fill" src="${esc(s.logo)}" alt="">` : sellerInitials(s);
const PRESET_GRADIENTS = [
  'linear-gradient(135deg,#2f3136,#6b6f76)', 'linear-gradient(135deg,#17181a,#3a3c40)',
  'linear-gradient(135deg,#123a6b,#2f7ed8)', 'linear-gradient(135deg,#0f766e,#2dd4bf)',
  'linear-gradient(135deg,#155e75,#7dd3fc)', 'linear-gradient(135deg,#4c1d95,#a78bfa)',
  'linear-gradient(135deg,#9d174d,#f472b6)', 'linear-gradient(135deg,#b45309,#f59e0b)',
  'linear-gradient(135deg,#b91c1c,#f87171)', 'linear-gradient(135deg,#166534,#4ade80)',
  'linear-gradient(135deg,#1e293b,#64748b)', 'linear-gradient(135deg,#7c2d12,#fb923c)',
];
const gradColors = (str) => { const m = (str || '').match(/#[0-9a-f]{6}/gi); return m && m.length >= 2 ? [m[0], m[1]] : ['#2f3136', '#6b6f76']; };

/* ================= pricing (same contract as the build plan) ================= */
const FEE_RATE = 0.067, FEE_MIN = 50;
function priceGroup(items, code) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = items.reduce((s, i) => s + i.ship * i.qty, 0);
  let raw = 0;
  if (code) raw = code.type === 'percent' ? Math.round(subtotal * code.value / 100) : code.value;
  const discount = Math.min(raw, subtotal);
  const total = subtotal - discount + shipping;
  const fee = Math.min(Math.max(Math.round((subtotal - discount) * FEE_RATE), FEE_MIN), total);
  return { subtotal, discount, shipping, total, fee };
}
function validateCode(sellerId, str, subtotal) {
  if (!str) return { ok: false, msg: '' };
  const c = DB.codes.find(x => x.sellerId === sellerId && x.code.toUpperCase() === str.trim().toUpperCase());
  if (!c || !c.active) return { ok: false, msg: 'Code not found for this seller.' };
  if (c.expires && c.expires < Date.now()) return { ok: false, msg: 'This code has expired.' };
  if (c.max != null && c.uses >= c.max) return { ok: false, msg: 'This code hit its usage limit.' };
  if (subtotal < c.min) return { ok: false, msg: `Needs a ${money(c.min)} minimum from this seller.` };
  return { ok: true, code: c };
}

/* ================= router ================= */
const routes = {
  '': viewHome, 'search': viewSearch, 'p': viewProduct, 's': viewStore, 'sellers': viewSellers,
  'bike': viewBike, 'sell': viewSell, 'dashboard': viewDashboard, 'admin': viewAdmin,
  'cart': viewCart, 'checkout': viewCheckout, 'success': viewSuccess, 'orders': viewOrders,
  'account': viewAccount, 'legal': viewLegal,
};
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const seg = path.split('/').filter(Boolean);
  return { seg, q: new URLSearchParams(qs || '') };
}
function go(h) { location.hash = h; }
let _lastRoute = null;
function render() {
  const { seg, q } = parseHash();
  const fn = routes[seg[0] || ''] || notFound;
  const routeKey = seg[0] || 'home';
  renderNav(); renderFooter();
  const v = $('#view');
  const paint = () => {
    v.classList.remove('view-enter'); void v.offsetWidth;
    v.innerHTML = fn(seg, q) || '';
    v.classList.add('view-enter');
    revealInit();
    $$('#view [data-count]').forEach(el => countUp(el, +el.dataset.count, el.dataset.prefix || '', el.dataset.suffix || ''));
  };
  window.scrollTo({ top: 0 });
  if (routeKey !== _lastRoute) {
    _lastRoute = routeKey;
    v.classList.remove('view-enter');
    v.innerHTML = skeletonFor(routeKey);
    clearTimeout(render._t);
    render._t = setTimeout(paint, 300);
  } else { paint(); }
}
function skeletonFor(key) {
  const cards = (n) => `<div class="grid grid-products">${Array.from({ length: n }).map(() => `<div class="sk-card"><div class="sk sk-img"></div><div class="sk-pad"><div class="sk sk-line w80"></div><div class="sk sk-line w50"></div><div class="sk sk-line w40" style="margin-top:.5rem"></div></div></div>`).join('')}</div>`;
  const head = `<div class="sk sk-line" style="width:220px;height:26px;margin-bottom:.5rem"></div><div class="sk sk-line" style="width:340px;height:14px;margin-bottom:1.4rem"></div>`;
  if (key === 'p') return `<div class="wrap"><div class="sk sk-line" style="width:280px;height:12px;margin:1rem 0 1.2rem"></div><div class="pd"><div class="sk" style="aspect-ratio:4/3;border-radius:var(--r-lg)"></div><div><div class="sk sk-line" style="width:70px;height:22px;border-radius:999px;margin-bottom:.9rem"></div><div class="sk sk-line w80" style="height:28px;margin-bottom:.6rem"></div><div class="sk sk-line w50"></div><div class="sk sk-line" style="width:130px;height:36px;margin:1.1rem 0"></div><div class="sk sk-line" style="height:46px;border-radius:12px;margin-bottom:1rem"></div><div class="sk sk-line" style="height:72px;border-radius:var(--r)"></div></div></div></div>`;
  if (key === 's') return `<div class="wrap"><div class="sk" style="height:172px;border-radius:var(--r-lg);margin-top:1.3rem"></div><div style="display:flex;gap:1.1rem;padding:0 1.4rem;margin-top:-30px"><div class="sk" style="width:92px;height:92px;border-radius:22px;flex:none"></div><div style="flex:1;padding-top:1.7rem"><div class="sk sk-line w50" style="height:22px;margin-bottom:.5rem"></div><div class="sk sk-line w40"></div></div></div><div style="margin-top:1.8rem">${cards(4)}</div></div>`;
  if (key === 'dashboard' || key === 'admin' || key === 'account') return `<div class="wrap"><div style="display:flex;gap:1rem;align-items:center;margin:1.1rem 0 1.2rem"><div class="sk" style="width:54px;height:54px;border-radius:14px;flex:none"></div><div style="flex:1"><div class="sk sk-line w40" style="height:20px;margin-bottom:.4rem"></div><div class="sk sk-line w50"></div></div></div><div class="stat-grid">${Array.from({ length: 5 }).map(() => `<div class="sk" style="height:88px;border-radius:var(--r)"></div>`).join('')}</div><div class="sk" style="height:210px;border-radius:var(--r);margin-top:1.2rem"></div></div>`;
  const panel = (h) => `<div class="sk" style="height:${h}px;border-radius:var(--r);margin-bottom:1rem"></div>`;
  if (key === 'cart' || key === 'checkout') return `<div class="wrap" style="padding-top:1.4rem">${head}${panel(150)}${panel(150)}${panel(220)}</div>`;
  if (key === 'orders') return `<div class="wrap" style="padding-top:1.4rem">${head}${panel(120)}${panel(120)}${panel(120)}</div>`;
  if (key === 'legal') return `<div class="wrap" style="padding-top:1.4rem;max-width:760px">${head}<div class="sk" style="height:420px;border-radius:var(--r)"></div></div>`;
  if (key === 'sell') return `<div class="wrap" style="padding-top:2rem;text-align:center"><div class="sk sk-line" style="width:60%;max-width:440px;height:44px;margin:0 auto .8rem"></div><div class="sk sk-line" style="width:70%;max-width:520px;height:16px;margin:0 auto 2rem"></div><div class="grid" style="grid-template-columns:repeat(3,1fr);gap:1rem">${Array.from({ length: 3 }).map(() => `<div class="sk" style="height:150px;border-radius:var(--r)"></div>`).join('')}</div></div>`;
  return `<div class="wrap" style="padding-top:1.4rem">${head}${cards(8)}</div>`;
}
function heroFallTiles() {
  const picks = [...visibleProducts()].sort((a, b) => b.ts - a.ts);
  if (!picks.length) return '';
  const N = 9; let html = '';
  for (let i = 0; i < N; i++) {
    const p = picks[i % picks.length];
    const left = (i / N) * 92 + 2 + (Math.random() * 4 - 2);
    const dur = 30 + Math.random() * 20;
    const delay = -Math.random() * dur;
    const r0 = Math.round(Math.random() * 20 - 10), r1 = r0 + Math.round(Math.random() * 24 - 12);
    const w = 98 + Math.round(Math.random() * 32);
    html += `<a class="ft" href="#/p/${p.id}" tabindex="-1" title="${esc(p.title)} · ${money(p.price)}" style="left:${left.toFixed(1)}%;width:${w}px;--r0:${r0}deg;--r1:${r1}deg;animation-duration:${dur.toFixed(1)}s;animation-delay:${delay.toFixed(1)}s"><span class="ft-in"><span class="ft-img">${productArt(p)}</span><span class="ft-price">${money(p.price)}</span><span class="ft-go">View →</span></span></a>`;
  }
  return `<div class="hero-fall" aria-hidden="true">${html}</div>`;
}
window.addEventListener('hashchange', render);

/* ================= nav & footer ================= */
function logoLockup() {
  return `<span class="logo-txt">Ion</span><svg class="logo-atom" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" aria-hidden="true"><ellipse cx="50" cy="50" rx="43" ry="15"/><ellipse cx="50" cy="50" rx="43" ry="15" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="43" ry="15" transform="rotate(120 50 50)"/><circle cx="50" cy="50" r="8" fill="currentColor" stroke="none"/><circle cx="93" cy="50" r="5.5" fill="currentColor" stroke="none"/><circle cx="28.5" cy="87" r="5.5" fill="currentColor" stroke="none"/><circle cx="28.5" cy="13" r="5.5" fill="currentColor" stroke="none"/></svg><span class="logo-txt">Supply</span>`;
}
function cartCount() { return cartOf().items.reduce((s, i) => s + i.qty, 0); }
function renderNav() {
  const u = me(), s = mySeller();
  $('#nav').innerHTML = `<div class="nav"><div class="nav-inner">
    <a class="logo" href="#/" aria-label="IonxSupply"><img class="logo-img" src="img/logo.png" alt="IonxSupply" onerror="this.outerHTML=logoLockup()"></a>
    <nav class="nav-links">
      <a href="#/search">Shop parts</a><a href="#/sellers">Sellers</a><a href="#/sell">Sell on IonxSupply</a>
      ${u && u.role === 'admin' ? '<a href="#/admin">Admin</a>' : ''}
      ${s ? '<a href="#/dashboard">Dashboard</a>' : ''}
    </nav>
    <form class="nav-search" onsubmit="event.preventDefault();go('#/search?q='+encodeURIComponent(this.q.value))">
      ${icon('search')}<input name="q" placeholder="Search parts, brands, bikes…" autocomplete="off">
    </form>
    <div class="nav-actions">
      <button class="cart-btn" onclick="showCartDrawer()" aria-label="Cart">${icon('cart')}${cartCount() ? `<span class="cart-count">${cartCount()}</span>` : ''}</button>
      ${u ? `<div class="user-menu"><button class="avatar" onclick="this.nextElementSibling.classList.toggle('open')">${esc(u.name.split(' ').map(w => w[0]).join('').slice(0, 2))}</button>
        <div class="user-drop">
          <a href="#/account">My account</a><a href="#/orders">My orders</a>
          ${s ? '<a href="#/dashboard">Seller dashboard</a>' : '<a href="#/sell">Become a seller</a>'}
          ${u.role === 'admin' ? '<a href="#/admin">Admin panel</a>' : ''}
          <button onclick="logout()">Sign out</button>
        </div></div>`
      : `<button class="btn btn-primary btn-sm" onclick="openAuth()">Sign in</button>`}
      <button class="hamburger" onclick="mobileMenu()" aria-label="Menu">${icon('menu')}</button>
    </div></div></div>`;
}
function mobileMenu() {
  const u = me(), s = mySeller();
  modal(`${modalHead('Menu')}<div class="modal-body"><div class="user-drop open" style="position:static;box-shadow:none;border:none;min-width:0">
    <a href="#/search" onclick="closeModal()">Shop parts</a><a href="#/sellers" onclick="closeModal()">Sellers</a>
    <a href="#/sell" onclick="closeModal()">Sell on IonxSupply</a>
    ${s ? '<a href="#/dashboard" onclick="closeModal()">Seller dashboard</a>' : ''}
    ${u && u.role === 'admin' ? '<a href="#/admin" onclick="closeModal()">Admin</a>' : ''}
    <a href="#/orders" onclick="closeModal()">My orders</a><a href="#/account" onclick="closeModal()">My account</a>
    ${u ? '<button onclick="closeModal();logout()">Sign out</button>' : '<button onclick="closeModal();openAuth()">Sign in</button>'}
  </div></div>`);
}
function renderFooter() {
  $('#footer').innerHTML = `<div class="footer"><div class="footer-inner">
    <div><div class="logo" style="color:#fff" aria-label="IonxSupply"><img class="logo-img logo-img-invert" src="img/logo.png" alt="IonxSupply" onerror="this.outerHTML=logoLockup()"></div>
      <p style="font-size:.84rem;margin-top:.6rem;max-width:270px">The parts market that knows your bike. Verified sellers, fitment-first search, buyer protection.</p>
      <form class="news-input" onsubmit="event.preventDefault();joinDropAlerts(this)">
        <input placeholder="Email for drop alerts" type="email" required><button class="btn btn-aqua btn-sm" type="submit">Join</button></form>
      <p style="font-size:.72rem;opacity:.72;margin-top:.45rem;max-width:270px">New listings + restocks in the categories and bikes you shop. No spam.</p></div>
    <div><h5>Marketplace</h5><a href="#/search">All parts</a><a href="#/search?cat=batteries">Batteries</a><a href="#/search?cat=motors">Motors</a><a href="#/search?cond=used">Used parts</a><a href="#/sellers">Seller directory</a></div>
    <div><h5>Sell</h5><a href="#/sell">Become a seller</a><a href="#/legal/prohibited">Prohibited items</a><a href="#/dashboard">Seller dashboard</a></div>
    <div><h5>Trust & legal</h5><a href="#/legal/refunds">Buyer protection</a><a href="#/legal/tos">Terms of Service</a><a href="#/legal/privacy">Privacy</a><a href="#/legal/prohibited">Battery shipping rules</a></div>
    <div class="fine"><span>© 2026 IonxSupply — demo build. Simulated data; no real payments, sellers or inventory.</span><span>Sold by independent sellers · IonxSupply is a marketplace venue</span></div>
  </div></div>`;
}

/* ================= auth ================= */
function openAuth(mode = 'in') {
  modal(`${modalHead(mode === 'in' ? 'Welcome back' : 'Create your account')}<div class="modal-body">
    <div class="side-tabs"><button class="${mode === 'in' ? 'active' : ''}" onclick="openAuth('in')">Sign in</button><button class="${mode === 'up' ? 'active' : ''}" onclick="openAuth('up')">Create account</button></div>
    <form class="form" onsubmit="event.preventDefault();${mode === 'in' ? 'doLogin(this)' : 'doSignup(this)'}">
      ${mode === 'up' ? `<div class="field"><label>Name</label><input name="name" required placeholder="Alex Rider"></div>` : ''}
      <div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input name="pw" type="password" required minlength="6" placeholder="••••••••"><div class="hint">Demo only — stored in your own browser.</div></div>
      ${mode === 'up' ? `<label class="check-line"><input type="checkbox" required> I agree to the <a href="#/legal/tos" onclick="closeModal()">Terms of Service</a> and <a href="#/legal/privacy" onclick="closeModal()">Privacy Policy</a>.</label>` : ''}
      <div id="auth-err"></div>
      <button class="btn btn-primary" type="submit">${mode === 'in' ? 'Sign in' : 'Create account'}</button>
    </form>
    <div style="margin-top:1.1rem;border-top:1px solid var(--line);padding-top:.9rem">
      <div style="font-size:.78rem;color:var(--ink3);margin-bottom:.5rem">Demo shortcuts — one click, no typing:</div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="personaLogin('u_buyer')">👤 Buyer demo</button>
        <button class="btn btn-outline btn-sm" onclick="personaLogin('u_seller')">🏪 Seller demo</button>
        <button class="btn btn-outline btn-sm" onclick="personaLogin('u_admin')">🛡️ Admin demo</button>
      </div></div></div>`);
}
function personaLogin(id) { loginAs(userById(id)); }
function doLogin(f) {
  const u = DB.users.find(x => x.email.toLowerCase() === f.email.value.toLowerCase());
  if (!u || u.pw !== btoa(f.pw.value)) { $('#auth-err').innerHTML = '<div class="form-err">Wrong email or password. Try a demo shortcut below.</div>'; return; }
  loginAs(u);
}
function doSignup(f) {
  if (DB.users.some(x => x.email.toLowerCase() === f.email.value.toLowerCase())) { $('#auth-err').innerHTML = '<div class="form-err">That email already has an account.</div>'; return; }
  const u = { id: uid('u'), email: f.email.value, pw: btoa(f.pw.value), name: f.name.value, role: 'buyer', wishlist: [], cart: { items: [], codes: {} }, tos: true, tosTs: Date.now() };
  DB.users.push(u); loginAs(u, true);
}
function loginAs(u, fresh = false) {
  // merge guest cart
  DB.guestCart.items.forEach(gi => {
    const ex = u.cart.items.find(i => i.pid === gi.pid);
    if (ex) ex.qty = Math.min(ex.qty + gi.qty, productById(gi.pid).qty); else u.cart.items.push(gi);
  });
  DB.guestCart = { items: [], codes: {} };
  DB.session = u.id; save(); closeModal(); render();
  toast(fresh ? `<b>Welcome to IonxSupply,</b> ${esc(u.name.split(' ')[0])}!` : `<b>Signed in</b> as ${esc(u.name)}`);
}
function logout() { DB.session = null; save(); go('#/'); render(); toast('Signed out.'); }
function requireAuth() { if (!me()) { openAuth(); return false; } return true; }

/* ================= product card ================= */
function pCard(p) {
  const s = sellerById(p.sellerId), r = ratingOf(p.sellerId);
  const wished = me() && me().wishlist.includes(p.id);
  return `<div class="card p-card reveal" onclick="go('#/p/${p.id}')">
    <div class="p-art">${productArt(p)}<span class="sold-tag badge badge-${p.cond}">${condName(p.cond)}</span>
      <button class="wish ${wished ? 'on' : ''}" onclick="event.stopPropagation();toggleWish('${p.id}',this)" aria-label="Save">${icon('heart')}</button></div>
    <div class="p-body"><div class="p-title">${esc(p.title)}</div>
      <div class="p-meta"><span class="p-seller" onclick="event.stopPropagation();go('#/s/${s.slug}')" title="Visit ${esc(s.name)}">${esc(s.name)}</span> · ${stars(r.avg)} <span>(${r.count})</span></div>
      <div class="p-price-row"><span class="p-price">${money(p.price)}</span><span class="p-ship">${p.ship ? '+' + money(p.ship) + ' ship' : 'Free ship'}</span></div>
    </div></div>`;
}
const condName = (c) => ({ new: 'New', like_new: 'Like new', used: 'Used', for_parts: 'For parts' }[c] || c);
function toggleWish(pid, btn) {
  if (!requireAuth()) return;
  const w = me().wishlist, i = w.indexOf(pid);
  if (i >= 0) { w.splice(i, 1); btn && btn.classList.remove('on'); toast('Removed from watchlist.'); }
  else { w.push(pid); btn && btn.classList.add('on'); toast('<b>Saved</b> to your watchlist.'); }
  save();
}

/* ================= views ================= */
function heroFloats() {
  const picks = [...visibleProducts()].sort((a, b) => b.sold - a.sold).slice(0, 12).filter((_, i) => i % 2 === 0).slice(0, 6);
  const slots = [
    { l: '3%', t: '15%', d: 23, delay: 0, k: 1 },
    { l: '10%', t: '55%', d: 27, delay: 5, k: 2 },
    { l: '5%', t: '86%', d: 25, delay: 10, k: 3 },
    { l: '87%', t: '13%', d: 26, delay: 2.5, k: 3 },
    { l: '90%', t: '52%', d: 22, delay: 7.5, k: 1 },
    { l: '84%', t: '84%', d: 28, delay: 12, k: 2 },
  ];
  return `<div class="hero-floats" aria-hidden="true">${picks.map((p, i) => { const s = slots[i] || slots[0]; return `<a class="hero-float k${s.k}" href="#/p/${p.id}" tabindex="-1" title="${esc(p.title)} · ${money(p.price)}" style="left:${s.l};top:${s.t};animation-duration:${s.d}s;animation-delay:-${s.delay}s"><span class="hf-inner"><span class="hf-img">${productArt(p)}</span><span class="hf-price">${money(p.price)}</span><span class="hf-go">View →</span></span></a>`; }).join('')}</div>`;
}
function viewHome() {
  const pop = [...visibleProducts()].sort((a, b) => b.sold - a.sold).slice(0, 8);
  const fresh = [...visibleProducts()].sort((a, b) => b.ts - a.ts).slice(0, 4);
  const tops = [...DB.sellers].filter(s => s.status === 'active').map(s => ({ s, r: ratingOf(s.id) })).sort((a, b) => b.r.avg - a.r.avg || b.r.count - a.r.count).slice(0, 4);
  const recent = DB.recent.map(productById).filter(p => p && p.qty > 0 && sellerActive(p.sellerId)).slice(0, 4);
  return `
  <div class="hero"><div class="hero-blob b1"></div><div class="hero-blob b2"></div>${heroFallTiles()}
    <div class="hero-inner">
      <span class="hero-eyebrow"><span class="dot"></span> ${visibleProducts().length} parts live from ${DB.sellers.filter(s => s.status === 'active').length} verified sellers</span>
      <h1>Every part. Every bike.<br><em>One garage.</em></h1>
      <p class="sub">Buy and sell e-bike, e-scooter and e-moto parts from verified sellers — with fitment search that actually knows what fits your ride.</p>
      <form class="hero-search" onsubmit="event.preventDefault();go('#/search?q='+encodeURIComponent(this.q.value))">
        <input name="q" placeholder="Try “52V battery”, “hydraulic brakes”, “RadRover”…"><button class="btn btn-primary" type="submit">${icon('search')} Search</button></form>
      <div class="hero-chips">
        ${['Batteries', 'Mid-drive motors', 'Controllers', 'Hydraulic brakes', 'Fat tires'].map(c => `<button class="chip" onclick="go('#/search?q=${encodeURIComponent(c)}')">${c}</button>`).join('')}
      </div></div>
    <div class="trustbar">
      <span>${icon('shield')} Verified sellers only</span><span>${icon('check')} Buyer protection on every order</span>
      <span>${icon('bolt')} Fitment-checked listings</span><span>${icon('truck')} Tracked shipping</span></div>
  </div>
  <div class="wrap">
    <section class="section"><div class="section-head reveal"><div><h2>🔥 Trending parts</h2><p>Best sellers across the market, last 30 days</p></div><a class="see-all" href="#/search?sort=selling">See all →</a></div>
      <div class="grid grid-products">${pop.map(pCard).join('')}</div></section>
    <section class="section"><div class="section-head reveal"><div><h2>Shop by category</h2></div></div>
      <div class="grid grid-cats">${CATS.map(c => `<div class="cat-tile reveal" data-cat="${c.id}" onclick="go('#/search?cat=${c.id}')"><div class="ic">${icon(c.icon)}</div><b>${c.name}</b><small>${c.blurb}</small></div>`).join('')}</div></section>
    <section class="section"><div class="section-head reveal"><div><h2>Shop by bike</h2><p>Parts filtered to what actually fits</p></div></div>
      <div class="hero-chips" style="justify-content:flex-start">${BIKES.map(b => `<button class="chip reveal" onclick="go('#/bike/${b.id}')">${b.brand} ${b.model}</button>`).join('')}</div></section>
    <section class="section"><div class="band reveal"><h2>Turn your parts bin into a storefront.</h2>
      <p>Your own shop at <b>yourname.ionxsupply.example</b>, discount codes, dashboards and payouts — we take 6.7% only when you sell.</p>
      <div class="stats"><div><b data-count="${DB.products.reduce((s, p) => s + p.sold, 0)}"></b><span>parts sold</span></div><div><b data-count="${DB.reviews.length}"></b><span>verified reviews</span></div><div><b>6.7%</b><span>flat fee, listing is free</span></div></div>
      <a class="btn btn-aqua btn-lg" href="#/sell">Apply to sell →</a></div></section>
    <section class="section"><div class="section-head reveal"><div><h2>Top-rated sellers</h2></div><a class="see-all" href="#/sellers">Directory →</a></div>
      <div class="grid grid-sellers">${tops.map(({ s, r }) => sCard(s, r)).join('')}</div></section>
    <section class="section"><div class="section-head reveal"><div><h2>Fresh listings</h2></div><a class="see-all" href="#/search?sort=new">Newest →</a></div>
      <div class="grid grid-products">${fresh.map(pCard).join('')}</div></section>
    ${recent.length ? `<section class="section"><div class="section-head reveal"><div><h2>Recently viewed</h2></div></div><div class="grid grid-products">${recent.map(pCard).join('')}</div></section>` : ''}
  </div>`;
}
function sCard(s, r) {
  return `<div class="card s-card reveal" onclick="go('#/s/${s.slug}')">
    <div class="s-head"><div class="s-logo" style="background:${sellerLogoBg(s)}">${logoContent(s)}</div>
      <div><div class="s-name">${esc(s.name)} ${s.verified ? `<span class="badge badge-verified">${icon('check')} Verified</span>` : ''}</div>
      <div class="rating-line">${stars(r.avg)} ${r.avg ? r.avg.toFixed(1) : '—'} · ${r.count} reviews</div></div></div>
    <div class="s-tag">${esc(s.tagline)}</div>
    <div style="font-size:.75rem;color:var(--ink3)">${DB.products.filter(p => p.sellerId === s.id && p.qty > 0).length} items · joined ${timeAgo(s.joined)}</div></div>`;
}

/* ---------- search ---------- */
function similarProducts(query) {
  const toks = (query || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 2);
  const popular = () => [...visibleProducts()].sort((a, b) => b.sold - a.sold).slice(0, 8);
  if (!toks.length) return popular();
  const scored = visibleProducts().map(p => {
    const title = p.title.toLowerCase();
    const hay = (title + ' ' + p.brand + ' ' + p.desc + ' ' + Object.values(p.specs).join(' ') + ' ' + (catById(p.cat)?.name || '') + ' ' + p.fits.map(id => { const b = bikeById(id); return b ? b.brand + ' ' + b.model : ''; }).join(' ')).toLowerCase();
    let score = 0;
    toks.forEach(t => { if (title.includes(t)) score += 3; else if (hay.includes(t)) score += 1; });
    return { p, score };
  }).filter(x => x.score > 0);
  scored.sort((a, b) => b.score - a.score || b.p.sold - a.p.sold);
  const out = scored.slice(0, 8).map(x => x.p);
  return out.length ? out : popular();
}
function viewSearch(seg, q) {
  const f = { q: q.get('q') || '', cat: q.get('cat') || '', cond: q.get('cond') || '', bike: q.get('bike') || '', min: q.get('min') || '', max: q.get('max') || '', sort: q.get('sort') || 'relevance', seller: q.get('seller') || '' };
  let list = visibleProducts();
  if (f.q) { const t = f.q.toLowerCase(); list = list.filter(p => (p.title + ' ' + p.brand + ' ' + p.desc + ' ' + Object.values(p.specs).join(' ')).toLowerCase().includes(t) || (bikeById(f.bike) ? true : BIKES.some(b => p.fits.includes(b.id) && (b.brand + ' ' + b.model).toLowerCase().includes(t)))); }
  if (f.cat) list = list.filter(p => p.cat === f.cat);
  if (f.cond) list = list.filter(p => p.cond === f.cond);
  if (f.bike) list = list.filter(p => p.universal || p.fits.includes(f.bike));
  if (f.seller) list = list.filter(p => p.sellerId === f.seller);
  if (f.min) list = list.filter(p => p.price >= f.min * 100);
  if (f.max) list = list.filter(p => p.price <= f.max * 100);
  if (f.sort === 'low') list.sort((a, b) => a.price - b.price);
  else if (f.sort === 'high') list.sort((a, b) => b.price - a.price);
  else if (f.sort === 'new') list.sort((a, b) => b.ts - a.ts);
  else if (f.sort === 'selling') list.sort((a, b) => b.sold - a.sold);
  else list.sort((a, b) => (b.sold * 2 + b.views / 50) - (a.sold * 2 + a.views / 50));
  const similar = (!list.length && f.q) ? similarProducts(f.q) : [];
  const setF = (k, v) => { const p = new URLSearchParams(); Object.entries({ ...f, [k]: v }).forEach(([a, b]) => b && p.set(a, b)); return `go('#/search?${p.toString().replace(/'/g, '')}')`; };
  const pills = [];
  if (f.q) pills.push(['q', `“${esc(f.q)}”`]); if (f.cat) pills.push(['cat', catById(f.cat)?.name]);
  if (f.cond) pills.push(['cond', condName(f.cond)]); if (f.bike) { const b = bikeById(f.bike); pills.push(['bike', b ? b.brand + ' ' + b.model : '']); }
  if (f.seller) { const s = sellerById(f.seller); if (s) pills.push(['seller', s.name]); }
  return `<div class="wrap"><div class="page-head"><h1>Shop parts</h1><p>Fitment-checked listings from verified sellers.</p></div>
  <div class="browse">
    <button class="filters-toggle btn btn-outline btn-sm" onclick="$('.filters').classList.toggle('open');this.textContent=this.textContent.includes('Show')?'✕ Hide filters':'☰ Show filters'">☰ Show filters</button>
    <aside class="filters">
      <h4>Fits my bike</h4>
      <select onchange="${setF('bike', '')}.replace('bike=','x=');(function(v){const p=new URLSearchParams(location.hash.split('?')[1]||'');v?p.set('bike',v):p.delete('bike');go('#/search?'+p)})(this.value)">
        <option value="">Any bike</option>${BIKES.map(b => `<option value="${b.id}" ${f.bike === b.id ? 'selected' : ''}>${b.brand} ${b.model}</option>`).join('')}</select>
      <h4>Category</h4>
      ${CATS.map(c => `<label><input type="radio" name="cat" ${f.cat === c.id ? 'checked' : ''} onchange="${setF('cat', c.id)}">${c.name}</label>`).join('')}
      <label><input type="radio" name="cat" ${!f.cat ? 'checked' : ''} onchange="${setF('cat', '')}">All categories</label>
      <h4>Condition</h4>
      ${['new', 'like_new', 'used', 'for_parts'].map(c => `<label><input type="radio" name="cond" ${f.cond === c ? 'checked' : ''} onchange="${setF('cond', c)}">${condName(c)}</label>`).join('')}
      <label><input type="radio" name="cond" ${!f.cond ? 'checked' : ''} onchange="${setF('cond', '')}">Any condition</label>
      <h4>Price</h4>
      <div class="price-row"><input type="number" placeholder="Min $" value="${f.min}" onchange="${setF('min', '')}.replace('min=','x=');(function(v){const p=new URLSearchParams(location.hash.split('?')[1]||'');v?p.set('min',v):p.delete('min');go('#/search?'+p)})(this.value)">
      <span>–</span><input type="number" placeholder="Max $" value="${f.max}" onchange="(function(v){const p=new URLSearchParams(location.hash.split('?')[1]||'');v?p.set('max',v):p.delete('max');go('#/search?'+p)})(this.value)"></div>
    </aside>
    <div>
      ${pills.length ? `<div class="filter-pills">${pills.map(([k, label]) => `<span class="pill">${label}<button onclick="${setF(k, '')}">✕</button></span>`).join('')}<button class="btn-ghost btn btn-sm" onclick="go('#/search')">Clear all</button></div>` : ''}
      <div class="results-head"><span class="count">${list.length ? `<b>${list.length}</b> parts found` : (f.q ? `No exact match for <b>“${esc(f.q)}”</b>` : `<b>0</b> parts found`)}</span>
        <div class="sort">Sort <select onchange="(function(v){const p=new URLSearchParams(location.hash.split('?')[1]||'');p.set('sort',v);go('#/search?'+p)})(this.value)">
          ${[['relevance', 'Relevance'], ['selling', 'Best selling'], ['new', 'Newest'], ['low', 'Price: low → high'], ['high', 'Price: high → low']].map(([v, n]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
      ${list.length ? `<div class="grid grid-products">${list.map(pCard).join('')}</div>`
        : f.q ? `<div class="notice" style="margin-bottom:1.2rem">🔍 <b>No parts exactly match “${esc(f.q)}”.</b> ${similar.length ? 'Here are similar parts other riders buy:' : ''}</div>${similar.length ? `<div class="grid grid-products">${similar.map(pCard).join('')}</div>` : `<div class="empty"><p>Try a different search, or <a href="#/search">browse all parts</a>.</p></div>`}`
        : `<div class="empty"><div class="big">🔍</div><b>No parts match those filters.</b><p>Try clearing the bike or condition filter.</p></div>`}
    </div></div></div>`;
}
function viewBike(seg) {
  const b = bikeById(seg[1]); if (!b) return notFound();
  const p = new URLSearchParams(); p.set('bike', b.id);
  location.hash = '#/search?' + p; return '';
}

/* ---------- product ---------- */
function viewProduct(seg) {
  const p = productById(seg[1]); if (!p) return notFound();
  const s = sellerById(p.sellerId), r = ratingOf(p.sellerId);
  p.views++; DB.recent = [p.id, ...DB.recent.filter(x => x !== p.id)].slice(0, 8); save();
  const suspended = s.status !== 'active';
  const similar = visibleProducts().filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4);
  const wished = me() && me().wishlist.includes(p.id);
  const pReviews = DB.reviews.filter(x => x.productId === p.id && !x.hidden).sort((a, b) => b.ts - a.ts);
  const pAvg = pReviews.length ? pReviews.reduce((t, rv) => t + rv.rating, 0) / pReviews.length : 0;
  return `<div class="wrap">
  <div class="crumb"><a href="#/">Home</a> / <a href="#/search?cat=${p.cat}">${catById(p.cat)?.name}</a> / ${esc(p.title.slice(0, 40))}…</div>
  <div class="pd">
    <div class="reveal in">
      <div class="pd-gallery" id="pd-main">${productArt(p)}</div>
      ${(p.imgs && p.imgs.length > 1) ? `<div class="pd-thumbs">${p.imgs.map((src, i) => `<button class="pd-thumb${i === 0 ? ' on' : ''}" data-src="${esc(src)}" onclick="pdSetImg(this)"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    </div>
    <div class="pd-info">
      <div style="display:flex;gap:.5rem;align-items:center"><span class="badge badge-${p.cond}">${condName(p.cond)}</span>
        ${p.sold > 20 ? '<span class="badge badge-navy">🔥 Best seller</span>' : ''}${p.qty <= 2 ? `<span class="badge badge-warn">Only ${p.qty} left</span>` : ''}</div>
      <h1>${esc(p.title)}</h1>
      <div class="rating-line">${stars(r.avg)} <b>${r.avg ? r.avg.toFixed(1) : '—'}</b> seller rating (${r.count}) · ${p.sold} sold · ${p.views} views</div>
      <div style="margin-top: .9rem"><span class="pd-price">${money(p.price)}</span>
        <div class="pd-ship-line">${p.ship ? `+ ${money(p.ship)} shipping` : '✅ Free shipping'} · ships from ${esc(s.name)}</div></div>
      ${suspended ? `<div class="notice">This seller is currently suspended — item unavailable.</div>` : (p.qty <= 0 ? `
      <div class="pd-buy">
        <button class="btn btn-primary btn-lg" style="flex:1" onclick="notifyMe('${p.id}')">🔔 Notify me when it's back</button>
        <button class="btn btn-outline ${wished ? 'on' : ''}" onclick="toggleWish('${p.id}')" aria-label="Watchlist">${icon('heart')}</button>
      </div><p style="font-size:.82rem;color:var(--ink3);margin-top:.45rem">Out of stock — we'll email you the moment it's restocked.</p>` : `
      <div class="pd-buy">
        <div class="qty"><button onclick="pdQty(-1,${p.qty})">−</button><span id="pdq">1</span><button onclick="pdQty(1,${p.qty})">+</button></div>
        <button class="btn btn-primary btn-lg" style="flex:1" onclick="addToCart('${p.id}', +$('#pdq').textContent)">${icon('cart')} Add to cart</button>
        <button class="btn btn-outline ${wished ? 'on' : ''}" onclick="toggleWish('${p.id}')" aria-label="Watchlist">${icon('heart')}</button>
      </div>`)}
      <div class="seller-box" onclick="go('#/s/${s.slug}')">
        <div class="s-logo" style="background:${sellerLogoBg(s)};width:44px;height:44px;font-size:.9rem">${logoContent(s)}</div>
        <div style="flex:1"><div class="s-name">${esc(s.name)} ${s.verified ? `<span class="badge badge-verified">${icon('check')} Verified</span>` : ''}</div>
          <div class="rating-line">${stars(r.avg)} ${r.count} reviews · ${timeAgo(s.joined).replace(' ago', '')} on IonxSupply</div></div>
        <span class="see-all">Visit shop →</span></div>
      <h3 style="margin:1.1rem 0 .2rem;font-size:1rem">Specs</h3>
      <table class="spec-table">${Object.entries(p.specs).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      <h3 style="margin:1rem 0 .2rem;font-size:1rem">Fits</h3>
      <div class="fit-chips">${p.universal ? '<span class="badge badge-verified">✓ Universal fit</span>' : ''}
        ${p.fits.map(id => { const b = bikeById(id); return b ? `<span class="chip" onclick="go('#/bike/${b.id}')">${b.brand} ${b.model}</span>` : ''; }).join('')}
        ${!p.universal && !p.fits.length ? '<span style="font-size:.85rem;color:var(--ink3)">Fitment not specified — ask the seller.</span>' : ''}</div>
      <p style="margin-top:1rem;color:var(--ink2);font-size:.93rem">${esc(p.desc)}</p>
      ${p.cat === 'batteries' ? `<div class="notice">🔋 Lithium battery: ships ground per DOT rules. Certification: <b>${esc(p.specs['Certification'] || 'not declared')}</b>. <a href="#/legal/prohibited">Battery policy</a></div>` : ''}
      <div class="protect">${icon('shield')}<div><b>IonxSupply Buyer Protection.</b> Payment held by the platform, released to the seller on fulfillment. Not as described? <a href="#/legal/refunds">Open a dispute</a> within 48h of delivery.</div></div>
    </div></div>
  <section class="section" id="reviews">
    <div class="section-head"><div><h2>Reviews (${pReviews.length})</h2></div></div>
    ${pReviews.length ? reviewSummary(pReviews) : ''}
    ${reviewFormHTML(p)}
    <div class="reviews-list">${pReviews.length ? pReviews.map(reviewRow).join('') : '<div class="empty" style="padding:1.4rem 0"><p>No reviews yet — be the first to review this part.</p></div>'}</div>
  </section>
  ${similar.length ? `<section class="section"><div class="section-head"><h2>Similar parts</h2></div><div class="grid grid-products">${similar.map(pCard).join('')}</div></section>` : ''}
  </div>`;
}
function reviewFormHTML(p) {
  if (mySeller() && mySeller().id === p.sellerId) return '<div class="notice" style="margin-bottom:1rem">This is your shop — you can\'t review your own listing.</div>';
  if (!me()) return `<div class="panel" style="margin-bottom:1.3rem"><p style="color:var(--ink2)">Sign in to leave a review on this part.</p><button class="btn btn-primary btn-sm" style="margin-top:.7rem" onclick="openAuth()">Sign in</button></div>`;
  return `<form class="panel review-form" style="margin-bottom:1.4rem" onsubmit="event.preventDefault();submitProductReview(this,'${p.id}','${p.sellerId}')">
    <div style="font-weight:700;margin-bottom:.5rem">Write a review</div>
    <div class="star-input" id="rv-stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-v="${n}" class="on" onclick="setReviewStars(${n})" aria-label="${n} stars">★</button>`).join('')}</div>
    <input type="hidden" name="rating" id="rv-rating" value="5">
    <textarea name="body" required placeholder="How was the part? Fit, quality, shipping…" style="width:100%;margin-top:.6rem"></textarea>
    <input type="file" accept="image/*" multiple id="rv-photofile" onchange="reviewPhotoUpload(this)" hidden>
    <input type="hidden" name="photos" id="rv-photos-val" value="">
    <div class="brand-row" style="margin-top:.6rem"><button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('rv-photofile').click()">📷 Add photos</button><span class="hint">up to 4</span></div>
    <div id="rv-photos" class="rv-photos" style="margin-top:.5rem"></div>
    <button class="btn btn-primary" style="margin-top:.7rem">Post review</button></form>`;
}
function reviewPhotoUpload(input) {
  const files = [...(input.files || [])];
  const hidden = document.getElementById('rv-photos-val');
  let arr = []; try { arr = JSON.parse(hidden.value || '[]'); } catch (e) {}
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 900 / img.width);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        let data; try { data = cv.toDataURL('image/jpeg', 0.8); } catch (err) { data = e.target.result; }
        arr.push(data); arr = arr.slice(0, 4);
        hidden.value = JSON.stringify(arr); renderReviewThumbs();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}
function renderReviewThumbs() {
  const hidden = document.getElementById('rv-photos-val'), box = document.getElementById('rv-photos'); if (!hidden || !box) return;
  let arr = []; try { arr = JSON.parse(hidden.value || '[]'); } catch (e) {}
  box.innerHTML = arr.map((src, i) => `<span class="rv-thumb"><img src="${src}" alt=""><button type="button" onclick="removeReviewPhoto(${i})" aria-label="Remove">×</button></span>`).join('');
}
function removeReviewPhoto(i) {
  const hidden = document.getElementById('rv-photos-val'); let arr = []; try { arr = JSON.parse(hidden.value || '[]'); } catch (e) {}
  arr.splice(i, 1); hidden.value = JSON.stringify(arr); renderReviewThumbs();
}
function reviewSummary(list) {
  const avg = list.reduce((t, r) => t + r.rating, 0) / list.length;
  const dist = [5, 4, 3, 2, 1].map(n => ({ n, c: list.filter(r => r.rating === n).length }));
  return `<div class="review-summary panel"><div class="rs-score"><b>${avg.toFixed(1)}</b>${stars(avg)}<span>${list.length} review${list.length !== 1 ? 's' : ''}</span></div>
    <div class="rs-bars">${dist.map(d => `<div class="rs-bar"><span>${d.n}★</span><div class="rs-track"><i style="width:${list.length ? Math.round(d.c / list.length * 100) : 0}%"></i></div><span>${d.c}</span></div>`).join('')}</div></div>`;
}
function submitProductReview(f, pid, sellerId) {
  if (!requireAuth()) return;
  const rating = Math.max(1, Math.min(5, parseInt(f.rating.value) || 5));
  const body = f.body.value.trim(); if (!body) return;
  let photos = []; try { photos = JSON.parse(f.photos.value || '[]'); } catch (e) {}
  DB.reviews.push({ id: uid('rv'), sellerId, productId: pid, buyerId: me().id, rating, body, photos: photos.slice(0, 4), verified: false, hidden: false, ts: Date.now() });
  save(); render(); toast('<b>Review posted.</b> Thanks for the feedback!');
}
function storeReviewFormHTML(s) {
  if (mySeller() && mySeller().id === s.id) return '';
  if (!me()) return `<div class="panel" style="margin-bottom:1.3rem"><p style="color:var(--ink2)">Sign in to review this seller.</p><button class="btn btn-primary btn-sm" style="margin-top:.7rem" onclick="openAuth()">Sign in</button></div>`;
  return `<form class="panel review-form" style="margin-bottom:1.4rem" onsubmit="event.preventDefault();submitProductReview(this,'','${s.id}')">
    <div style="font-weight:700;margin-bottom:.5rem">Review ${esc(s.name)}</div>
    <div class="star-input" id="rv-stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-v="${n}" class="on" onclick="setReviewStars(${n})" aria-label="${n} stars">★</button>`).join('')}</div>
    <input type="hidden" name="rating" id="rv-rating" value="5">
    <textarea name="body" required placeholder="How was your experience with this seller — shipping, communication, item accuracy?" style="width:100%;margin-top:.6rem"></textarea>
    <input type="file" accept="image/*" multiple id="rv-photofile" onchange="reviewPhotoUpload(this)" hidden>
    <input type="hidden" name="photos" id="rv-photos-val" value="">
    <div class="brand-row" style="margin-top:.6rem"><button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('rv-photofile').click()">📷 Add photos</button><span class="hint">up to 4</span></div>
    <div id="rv-photos" class="rv-photos" style="margin-top:.5rem"></div>
    <button class="btn btn-primary" style="margin-top:.7rem">Post review</button></form>`;
}
function setReviewStars(n) { $('#rv-rating').value = n; $$('#rv-stars button').forEach(b => b.classList.toggle('on', +b.dataset.v <= n)); }
function reviewRow(rv) {
  const u = userById(rv.buyerId);
  return `<div class="review"><div class="review-head"><span class="avatar">${esc((u?.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2))}</span><b style="font-size:.9rem">${esc(u?.name || 'Buyer')}</b> ${stars(rv.rating)} <small>· ${rv.verified === false ? '' : 'verified purchase · '}${timeAgo(rv.ts)}</small></div><p>${esc(rv.body)}</p>${rv.photos && rv.photos.length ? `<div class="rv-photos-row">${rv.photos.map(src => `<a class="rv-photo" href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="review photo" loading="lazy"></a>`).join('')}</div>` : ''}</div>`;
}
function pdQty(d, max) { const el = $('#pdq'); el.textContent = Math.max(1, Math.min(max, +el.textContent + d)); }
function pdSetImg(btn) {
  const g = document.getElementById('pd-main'); if (!g) return;
  const img = g.querySelector('img');
  if (img) img.src = btn.dataset.src; else g.innerHTML = `<img src="${btn.dataset.src}" alt="">`;
  document.querySelectorAll('.pd-thumb').forEach(b => b.classList.remove('on')); btn.classList.add('on');
}

/* ---------- storefront ---------- */
function viewStore(seg, q) {
  const s = DB.sellers.find(x => x.slug === seg[1]); if (!s) return notFound();
  if (s.status !== 'active') return `<div class="wrap"><div class="empty"><div class="big">🚫</div><b>This shop is suspended</b><p>It's temporarily unavailable while our trust team reviews reports. <a href="#/sellers">Browse other sellers</a></p></div></div>`;
  const tab = q.get('tab') || 'items';
  const r = ratingOf(s.id);
  const items = DB.products.filter(p => p.sellerId === s.id && p.qty > 0);
  const best = [...items].sort((a, b) => b.sold - a.sold).slice(0, 4);
  const codes = DB.codes.filter(c => c.sellerId === s.id && c.active && (!c.expires || c.expires > Date.now()) && (c.max == null || c.uses < c.max));
  const reviews = DB.reviews.filter(x => x.sellerId === s.id && !x.hidden).sort((a, b) => b.ts - a.ts);
  return `<div class="wrap store-scope"${s.accent ? ` style="--shop-accent:${s.accent}"` : ''}>
    <div style="padding-top:1.3rem"><div class="store-banner" style="background:${sellerBannerBg(s)}">
      <div class="store-banner-glow"></div></div></div>
    <div class="store-head">
      <div class="store-logo" style="background:${sellerLogoBg(s)}">${logoContent(s)}</div>
      <div class="store-id">
        <h1 class="store-name">${esc(s.name)} ${s.verified ? `<span class="badge badge-verified">${icon('check')} Verified seller</span>` : ''}</h1>
        <div class="rating-line">${stars(r.avg)} <b>${r.avg ? r.avg.toFixed(1) : 'New'}</b> (${r.count} reviews) · ${items.length} items · joined ${timeAgo(s.joined)}</div>
        <div class="store-domain">🌐 ${s.slug}.ionxsupply.example <span style="opacity:.6">(seller subdomains — live in the real build)</span></div>
        ${s.website ? `<div class="store-domain" style="margin-top:.2rem"><a class="store-web" href="${esc(s.website)}" target="_blank" rel="noopener nofollow">🔗 ${esc(s.website.replace(/^https?:\/\//, ''))} <span style="font-size:.85em">↗</span></a></div>` : ''}
      </div>
      <div class="store-actions"><button class="btn btn-danger btn-sm" onclick="openReport('${s.id}')">${icon('flag')} Report seller</button></div></div>
    <div class="tabs">
      <button class="${tab === 'items' ? 'active' : ''}" onclick="go('#/s/${s.slug}?tab=items')">Items (${items.length})</button>
      <button class="${tab === 'reviews' ? 'active' : ''}" onclick="go('#/s/${s.slug}?tab=reviews')">Reviews (${reviews.length})</button>
      <button class="${tab === 'about' ? 'active' : ''}" onclick="go('#/s/${s.slug}?tab=about')">About</button></div>
    ${tab === 'items' ? `
      ${best.length > 1 ? `<div class="section-head"><h2 style="font-size:1.1rem">⭐ Shop best sellers</h2></div><div class="grid grid-products" style="margin-bottom:1.6rem">${best.map(pCard).join('')}</div>` : ''}
      <div class="section-head"><h2 style="font-size:1.1rem">All items</h2></div>
      ${items.length ? `<div class="grid grid-products">${items.map(pCard).join('')}</div>` : '<div class="empty">No items listed right now.</div>'}` : ''}
    ${tab === 'reviews' ? (reviews.length ? reviewSummary(reviews) : '') + storeReviewFormHTML(s) + (reviews.length ? reviews.map(reviewRow).join('') : '<div class="empty" style="padding:1rem 0">No reviews yet — be the first.</div>') : ''}
    ${tab === 'about' ? `<div class="panel" style="max-width:640px"><p style="color:var(--ink2)">${esc(s.bio)}</p><p style="margin-top:.8rem;font-size:.83rem;color:var(--ink3)">All sales run through IonxSupply checkout with buyer protection. Payouts to sellers via Stripe. <a href="#/legal/refunds">How protection works</a></p></div>` : ''}
  </div>`;
}
function openReport(sellerId) {
  if (!requireAuth()) return;
  const s = sellerById(sellerId);
  modal(`${modalHead('Report ' + esc(s.name))}<div class="modal-body"><form class="form" onsubmit="event.preventDefault();submitReport(this,'${sellerId}')">
    <div class="field"><label>What happened?</label><select name="reason" required>
      <option value="">Choose a reason…</option><option value="scam">Scam / attempted fraud</option><option value="counterfeit">Counterfeit or unsafe item</option>
      <option value="not_shipped">Item never shipped</option><option value="fake_listing">Fake or misleading listing</option><option value="other">Something else</option></select></div>
    <div class="field"><label>Details</label><textarea name="details" required placeholder="What happened, which listing, when…"></textarea>
    <div class="hint">Reports go to IonxSupply's trust team. False reports violate our terms.</div></div>
    <button class="btn btn-primary">Submit report</button></form></div>`);
}
function submitReport(f, sellerId) {
  DB.reports.push({ id: uid('rp'), sellerId, reporterId: me().id, reason: f.reason.value, details: f.details.value, status: 'open', ts: Date.now(), resolvedTs: null, resolution: null });
  save(); closeModal(); toast('<b>Report received.</b> Our trust team will review it. Thank you.');
}

/* ---------- sellers directory ---------- */
function viewSellers(seg, q) {
  const t = (q.get('q') || '').toLowerCase();
  const list = DB.sellers.filter(s => s.status === 'active' && (!t || (s.name + s.tagline).toLowerCase().includes(t)))
    .map(s => ({ s, r: ratingOf(s.id) })).sort((a, b) => b.r.avg - a.r.avg || b.r.count - a.r.count);
  return `<div class="wrap"><div class="page-head"><h1>Seller directory</h1><p>Every seller is application-reviewed and identity-verified through Stripe before their first sale.</p></div>
    <form class="hero-search" style="margin:0 0 1.4rem;max-width:440px" onsubmit="event.preventDefault();go('#/sellers?q='+encodeURIComponent(this.q.value))">
      <input name="q" value="${esc(q.get('q') || '')}" placeholder="Search sellers…"><button class="btn btn-primary" type="submit">Search</button></form>
    <div class="grid grid-sellers">${list.map(({ s, r }) => sCard(s, r)).join('')}</div></div>`;
}

/* ---------- sell (the ad + application) ---------- */
function viewSell() {
  const u = me(); const app = u && DB.applications.find(a => a.userId === u.id && a.status === 'pending');
  const rejApp = u && !app && DB.applications.find(a => a.userId === u.id && a.status === 'rejected');
  return `<div class="wrap">
  <div class="hero" style="border:none;background:none"><div class="hero-inner" style="padding:3rem 0 1.6rem">
    <span class="hero-eyebrow"><span class="dot"></span> Now onboarding e-motive sellers</span>
    <h1>Your parts bin is<br><em>a business.</em></h1>
    <p class="sub">Get a verified storefront on your own IonxSupply subdomain, run discount codes, and reach riders searching by their exact bike.</p></div></div>
  <div class="step-cards reveal">
    <div class="step-card"><div class="num">1</div><b>Apply in 2 minutes</b><p>Tell us what you sell. We review every application — that's why buyers trust the marketplace.</p></div>
    <div class="step-card"><div class="num">2</div><b>Verify & connect payouts</b><p>Stripe identity check + bank connection. You're the merchant; we handle checkout and protection.</p></div>
    <div class="step-card"><div class="num">3</div><b>List & sell</b><p>Photos, specs, fitment tags, your own codes. Listing is free — we take 6.7% only when you sell.</p></div></div>
  <section class="section"><div class="browse cols-even">
    <div class="fee-calc reveal"><h3 style="margin-bottom:.3rem">What you'd keep</h3><p style="font-size:.85rem;color:var(--ink3)">Drag your monthly parts sales:</p>
      <input type="range" min="100" max="10000" value="1500" step="100" oninput="feeCalc(this.value)">
      <div class="fee-out"><span>Monthly sales</span><b id="fc-gross">$1,500</b></div>
      <div class="fee-out"><span>IonxSupply fee (6.7%)</span><b id="fc-fee">−$101</b></div>
      <div class="fee-out" style="border-top:1.5px solid var(--line);padding-top:.5rem"><span>You keep</span><b id="fc-net" style="color:var(--aqua-deep)">$1,399</b></div>
      <p style="font-size:.75rem;color:var(--ink3);margin-top:.6rem">Payment processing included. No listing fees, no monthly fees.</p></div>
    <div class="accordion reveal">${[
      ['Who can sell?', 'Individuals and shops, 18+. We review every application for inventory quality and honesty — takeoff parts, used gear and rebuilt components are all welcome if graded honestly.'],
      ['How do payouts work?', 'Through Stripe Connect. Money from each sale (minus the 6.7% fee) transfers to your bank on a rolling schedule after fulfillment.'],
      ['Can I sell batteries?', 'Yes, with rules: UN38.3 documentation, declared certification status, ground shipping. Read the battery policy before applying.'],
      ['What about scam protection?', 'Cuts both ways. Buyers get dispute mediation; sellers with tracking and honest photos win not-as-described claims. Repeat bad actors get suspended.'],
      ['Do I really get my own subdomain?', 'Yes — yourshop.ionxsupply.example (simulated in this demo, real wildcard domains in production). Your storefront, your branding, your codes.'],
    ].map(([q2, a]) => `<div class="acc-item"><button onclick="this.parentElement.classList.toggle('open')">${q2}<span class="chev">⌄</span></button><div class="acc-body"><div>${a}</div></div></div>`).join('')}</div>
  </div></section>
  <section class="section" style="max-width:560px;margin:0 auto;padding-top:.4rem">
    <div class="panel reveal" id="apply">
      <h2 style="margin-bottom:.3rem">Apply to sell</h2>
      ${!u ? `<p style="color:var(--ink3);font-size:.9rem;margin-bottom:1rem">Sign in first — takes one click with a demo account.</p><button class="btn btn-primary" onclick="openAuth()">Sign in to apply</button>`
      : mySeller() ? `<p style="color:var(--ink3);font-size:.9rem">You already run <b>${esc(mySeller().name)}</b>. <a href="#/dashboard">Go to your dashboard →</a></p>`
      : app ? `<div class="verify-flow">
        <div class="vf-head">⏳ Verifying <b>${esc(app.shop)}</b></div>
        <div class="vf-steps">
          <div class="vf-step done"><span class="vf-dot">✓</span><div><b>Application received</b><small>We review inventory quality, honesty &amp; prohibited-item rules</small></div></div>
          <div class="vf-step active"><span class="vf-dot">2</span><div><b>Identity verification</b><small>Government ID + selfie via Stripe Identity — we never see the documents</small></div></div>
          <div class="vf-step"><span class="vf-dot">3</span><div><b>Payout setup</b><small>Bank connection &amp; tax info via Stripe Connect (KYC)</small></div></div>
          <div class="vf-step"><span class="vf-dot">4</span><div><b>Storefront goes live</b><small>Your subdomain, branding and first listing</small></div></div>
        </div>
        <button class="btn btn-aqua" onclick="demoApprove('${app.id}')">⚡ Demo shortcut: approve instantly</button>
        <p style="font-size:.75rem;color:var(--ink3);margin-top:.7rem">In production, steps 2–3 run through Stripe — a scammer can't fake a verified government ID or a real bank account, which is what keeps bad actors out.</p></div>`
      : rejApp ? `<div class="notice" style="background:#fdeaea;border-color:#f0c9c9;color:var(--danger)">⚠️ Your application for <b>${esc(rejApp.shop)}</b> wasn't approved.</div>
        ${rejApp.rejectReason ? `<div class="ship-to" style="margin-top:1rem"><div class="ship-to-h">Why it was rejected</div>${esc(rejApp.rejectReason)}</div>` : ''}
        <p style="font-size:.85rem;color:var(--ink3);margin:1rem 0">Think we got it wrong, or fixed the issue? You can apply again.</p>
        <button class="btn btn-primary" onclick="reapplyAfterReject('${rejApp.id}')">Apply again</button>`
      : `<form class="form" onsubmit="event.preventDefault();applySeller(this)">
        <div class="form-row"><div class="field"><label>Shop name</label><input name="shop" required placeholder="Volt Garage" maxlength="30"></div>
        <div class="field"><label>Shop URL <span style="font-weight:400;color:var(--ink3)">(optional)</span></label><input name="slug" pattern="[a-z0-9](-?[a-z0-9])*" placeholder="volt-garage" maxlength="24"><div class="hint">yourname.ionxsupply.example — auto-made from your shop name if left blank</div></div></div>
        <div class="field"><label>Your website <span style="font-weight:400;color:var(--ink3)">(optional)</span></label><input name="website" placeholder="https://your-shop.com"><div class="hint">Shown as a link next to your shop on every listing.</div></div>
        <div class="field"><label>What do you sell?</label><textarea name="pitch" required placeholder="Inventory, experience, links to past sales…"></textarea></div>
        <label class="check-line"><input type="checkbox" required> I've read the <a href="#/legal/prohibited">Prohibited Items policy</a> (especially batteries) and agree to the <a href="#/legal/tos">Seller Terms</a>.</label>
        <div id="apply-err"></div>
        <button class="btn btn-primary btn-lg">Submit application</button></form>`}
    </div></section></div>`;
}
function feeCalc(v) {
  $('#fc-gross').textContent = '$' + (+v).toLocaleString();
  $('#fc-fee').textContent = '−$' + Math.round(v * .067).toLocaleString();
  $('#fc-net').textContent = '$' + (+v - Math.round(v * .067)).toLocaleString();
}
function slugify(str) { return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24); }
function normWebsite(u) {
  u = (u || '').trim(); if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const p = new URL(u); return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : null; } catch (e) { return null; }
}
function sellerWebLink(s) {
  if (!s || !s.website) return '';
  return ` <a class="seller-web" href="${esc(s.website)}" target="_blank" rel="noopener nofollow" onclick="event.stopPropagation()" title="${esc(s.name)}'s website — ${esc(s.website)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18"/></svg></a>`;
}
function applySeller(f) {
  let slug = slugify(f.slug.value) || slugify(f.shop.value) || ('shop-' + Math.random().toString(36).slice(2, 6));
  if (DB.sellers.some(s => s.slug === slug) || DB.applications.some(a => a.slug === slug && a.status === 'pending') || ['www', 'app', 'api', 'admin', 'shop'].includes(slug)) { $('#apply-err').innerHTML = '<div class="form-err">That shop URL is taken or reserved — try another, or leave it blank to auto-generate.</div>'; return; }
  DB.applications.push({ id: uid('a'), userId: me().id, shop: f.shop.value, slug, website: normWebsite(f.website && f.website.value), pitch: f.pitch.value, status: 'pending', ts: Date.now() });
  save(); render(); toast('<b>Application submitted!</b> Watch for the demo-approve shortcut.');
}
function demoApprove(appId) { approveApplication(appId, true); go('#/dashboard'); }
function approveApplication(appId, self = false) {
  const a = DB.applications.find(x => x.id === appId); if (!a || a.status !== 'pending') return;
  a.status = 'approved'; a.decidedTs = Date.now();
  const u = userById(a.userId);
  const colors = Object.values(SELLER_COLORS);
  const s = { id: uid('s'), userId: u.id, slug: a.slug, name: a.shop, color: colors[Math.floor(Math.random() * colors.length)], tagline: 'New on IonxSupply — say hi!', bio: a.pitch, website: a.website || null, status: 'active', joined: Date.now(), verified: true };
  DB.sellers.push(s); u.role = u.role === 'admin' ? 'admin' : 'seller'; u.sellerId = s.id; save();
  toast(self ? `<b>${esc(a.shop)} is live!</b> Stripe onboarding simulated ✓ — list your first part.` : `Approved <b>${esc(a.shop)}</b>.`);
}

/* ---------- cart & drawer ---------- */
function addToCart(pid, qty = 1) {
  const p = productById(pid); if (!p) return;
  const cart = cartOf();
  const ex = cart.items.find(i => i.pid === pid);
  const cur = ex ? ex.qty : 0;
  if (cur + qty > p.qty) { toast(`Only ${p.qty} in stock.`, 'err'); return; }
  if (ex) ex.qty += qty; else cart.items.push({ pid, qty });
  save(); renderNav(); showCartDrawer();
  toast(`<b>Added:</b> ${esc(p.title.slice(0, 40))}…`);
}
function setCartQty(pid, qty) {
  const cart = cartOf(); const it = cart.items.find(i => i.pid === pid); if (!it) return;
  const p = productById(pid);
  it.qty = Math.max(0, Math.min(p.qty, qty));
  if (!it.qty) cart.items = cart.items.filter(i => i.pid !== pid);
  save(); renderNav();
  if (location.hash.startsWith('#/cart')) render(); else showCartDrawer();
}
function cartGroups() {
  const cart = cartOf(); const groups = {};
  cart.items.forEach(i => {
    const p = productById(i.pid); if (!p || !sellerActive(p.sellerId)) return;
    (groups[p.sellerId] = groups[p.sellerId] || []).push({ ...i, price: p.price, ship: p.ship, title: p.title, p });
  });
  return groups;
}
function showCartDrawer() {
  const groups = cartGroups();
  const all = Object.values(groups).flat();
  const sub = all.reduce((s, i) => s + i.price * i.qty, 0);
  $('#drawer').innerHTML = `<div class="drawer-head"><h3>Your cart (${cartCount()})</h3><button class="modal-x" onclick="closeDrawer()">${icon('x')}</button></div>
  <div class="drawer-body">${all.length ? all.map(i => `<div class="cart-line"><div class="thumb">${productArt(i.p)}</div>
    <div style="flex:1"><b>${esc(i.title)}</b><small>${money(i.price)} · <a href="#/s/${sellerById(i.p.sellerId).slug}" onclick="closeDrawer()">${esc(sellerById(i.p.sellerId).name)}</a></small>
      <div class="qty" style="margin-top:.3rem;height:28px;display:inline-flex"><button onclick="setCartQty('${i.pid}',${i.qty - 1})">−</button><span style="font-size:.8rem">${i.qty}</span><button onclick="setCartQty('${i.pid}',${i.qty + 1})">+</button></div></div>
    <b style="font-size:.88rem">${money(i.price * i.qty)}</b></div>`).join('')
    : '<div class="empty" style="padding:2.5rem 0"><div class="big">🛒</div>Cart\'s empty. Go find that part.</div>'}</div>
  <div class="drawer-foot"><div class="totals"><div class="row"><span>Subtotal</span><b>${money(sub)}</b></div></div>
    <button class="btn btn-primary btn-lg" style="width:100%;margin-top:.6rem" ${all.length ? '' : 'disabled'} onclick="closeDrawer();go('#/cart')">Review cart & codes →</button></div>`;
  openDrawer();
}
function viewCart() {
  const groups = cartGroups(); const cart = cartOf();
  const ids = Object.keys(groups);
  if (!ids.length) return `<div class="wrap"><div class="empty"><div class="big">🛒</div><b>Your cart is empty.</b><p><a href="#/search">Browse parts →</a></p></div></div>`;
  let grand = 0, discTotal = 0;
  const html = ids.map(sid => {
    const s = sellerById(sid), items = groups[sid];
    const applied = validateCode(sid, cart.codes[sid], items.reduce((t, i) => t + i.price * i.qty, 0));
    const pr = priceGroup(items, applied.ok ? applied.code : null);
    grand += pr.total; discTotal += pr.discount;
    return `<div class="cart-group reveal in">
      <div class="cart-group-head"><div class="s-logo" style="background:${sellerLogoBg(s)};width:34px;height:34px;font-size:.75rem;border-radius:9px">${logoContent(s)}</div>
        <b>${esc(s.name)}</b><a class="see-all" style="margin-left:auto" href="#/s/${s.slug}">shop →</a></div>
      ${items.map(i => `<div class="cart-line"><div class="thumb">${productArt(i.p)}</div>
        <div style="flex:1"><b>${esc(i.title)}</b><small>${money(i.price)} each · ${i.ship ? money(i.ship) + ' ship' : 'free ship'}</small>
        <div class="qty" style="margin-top:.3rem;height:28px;display:inline-flex"><button onclick="setCartQty('${i.pid}',${i.qty - 1})">−</button><span style="font-size:.8rem">${i.qty}</span><button onclick="setCartQty('${i.pid}',${i.qty + 1})">+</button></div></div>
        <b>${money(i.price * i.qty)}</b></div>`).join('')}
      ${applied.ok ? `<div class="code-applied">🎟️ ${cart.codes[sid].toUpperCase()} — ${money(pr.discount)} off <button style="color:var(--aqua-deep);text-decoration:underline;font-size:.75rem" onclick="removeCode('${sid}')">remove</button></div>`
      : `<div class="code-input"><input id="code-${sid}" placeholder="Seller discount code" value="${esc(cart.codes[sid] || '')}"><button class="btn btn-outline btn-sm" onclick="applyCode('${sid}')">Apply</button></div>
         ${cart.codes[sid] && !applied.ok && applied.msg ? `<div class="form-err" style="margin-top:.5rem">${applied.msg}</div>` : ''}`}
      <div class="totals" style="margin-top:.7rem"><div class="row"><span>Items</span><span>${money(pr.subtotal)}</span></div>
        ${pr.discount ? `<div class="row disc"><span>Discount</span><span>−${money(pr.discount)}</span></div>` : ''}
        <div class="row"><span>Shipping</span><span>${pr.shipping ? money(pr.shipping) : 'Free'}</span></div>
        <div class="row total"><span>Seller total</span><span>${money(pr.total)}</span></div></div></div>`;
  }).join('');
  return `<div class="wrap"><div class="page-head"><h1>Cart</h1><p>${ids.length > 1 ? 'Multiple sellers — one payment. We split it behind the scenes.' : ''}</p></div>
    <div class="browse cols-cart">
      <div>${html}</div>
      <div class="panel" style="position:sticky;top:84px"><h3 style="margin-bottom:.6rem">Order summary</h3>
        <div class="totals">${discTotal ? `<div class="row disc"><span>You're saving</span><b>${money(discTotal)}</b></div>` : ''}
          <div class="row total"><span>Grand total</span><span>${money(grand)}</span></div></div>
        <button class="btn btn-primary btn-lg" style="width:100%;margin-top:.9rem" onclick="${me() ? "go('#/checkout')" : 'openAuth()'}">${me() ? 'Checkout →' : 'Sign in to checkout'}</button>
        <div class="protect" style="margin-top:.9rem">${icon('shield')}<div>One payment covers all sellers. Buyer protection on every order.</div></div></div>
    </div></div>`;
}
function applyCode(sid) {
  const v = $('#code-' + sid).value; cartOf().codes[sid] = v; save();
  const items = cartGroups()[sid] || [];
  const res = validateCode(sid, v, items.reduce((t, i) => t + i.price * i.qty, 0));
  if (res.ok) toast(`<b>${v.toUpperCase()}</b> applied ✓`); else toast(res.msg || 'Invalid code', 'err');
  render();
}
function removeCode(sid) { delete cartOf().codes[sid]; save(); render(); }

/* ---------- checkout ---------- */
function viewCheckout() {
  if (!me()) { openAuth(); return viewCart(); }
  const groups = cartGroups(); if (!Object.keys(groups).length) return viewCart();
  const cart = cartOf();
  let grand = 0;
  const lines = Object.keys(groups).map(sid => {
    const items = groups[sid];
    const applied = validateCode(sid, cart.codes[sid], items.reduce((t, i) => t + i.price * i.qty, 0));
    const pr = priceGroup(items, applied.ok ? applied.code : null);
    grand += pr.total;
    return `<div class="row"><span>${esc(sellerById(sid).name)} (${items.reduce((s, i) => s + i.qty, 0)} items${pr.discount ? ', code applied' : ''})</span><span>${money(pr.total)}</span></div>`;
  }).join('');
  return `<div class="wrap"><div class="page-head"><h1>Checkout</h1><p>Simulated payment — this is the demo. No card is charged, ever.</p></div>
  <div class="browse cols-cart">
    <form class="form panel" id="pay-form" onsubmit="event.preventDefault();doPay(this)">
      <h3>Shipping address</h3>
      <div class="form-row"><div class="field"><label>Full name</label><input name="name" required value="${esc(me().name)}"></div>
      <div class="field"><label>Street</label><input name="line1" required value="482 Cedar Loop"></div></div>
      <div class="form-row"><div class="field"><label>City</label><input name="city" required value="Austin"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.9rem"><div class="field"><label>State</label><input name="state" required value="TX" maxlength="2"></div>
      <div class="field"><label>ZIP</label><input name="zip" required value="78745"></div></div></div>
      <h3 style="margin-top:.6rem">Payment <span style="font-size:.72rem;color:var(--ink3);font-weight:500">(Stripe Payment Element in production)</span></h3>
      <div class="field"><label>Card number</label><input name="card" required value="4242 4242 4242 4242" inputmode="numeric"></div>
      <div class="form-row"><div class="field"><label>Expiry</label><input name="exp" required value="12/29"></div>
      <div class="field"><label>CVC</label><input name="cvc" required value="424"></div></div>
      <button class="btn btn-primary btn-lg" id="pay-btn" type="submit">${icon('lock')} Pay ${money(grand)}</button>
      <p style="font-size:.75rem;color:var(--ink3)">By paying you agree to the <a href="#/legal/tos">Terms</a> and <a href="#/legal/refunds">Refund Policy</a>. Sold by independent sellers; IonxSupply processes payment.</p>
    </form>
    <div class="panel" style="position:sticky;top:84px;height:fit-content"><h3 style="margin-bottom:.6rem">Order summary</h3>
      <div class="totals">${lines}<div class="row total"><span>Total</span><span>${money(grand)}</span></div></div>
      <div class="protect" style="margin-top:.9rem">${icon('shield')}<div>Funds are held by IonxSupply and released to sellers per-shipment. Disputes within 48h of delivery.</div></div></div>
  </div></div>`;
}
function doPay(f) {
  const btn = $('#pay-btn'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Processing…';
  setTimeout(() => {
    const cart = cartOf(), groups = cartGroups(), groupId = uid('g');
    const address = { name: f.name.value, line1: f.line1.value, city: f.city.value, state: f.state.value, zip: f.zip.value };
    const orderIds = [];
    Object.keys(groups).forEach(sid => {
      const items = groups[sid];
      const applied = validateCode(sid, cart.codes[sid], items.reduce((t, i) => t + i.price * i.qty, 0));
      const code = applied.ok ? applied.code : null;
      const pr = priceGroup(items, code);
      const o = { id: uid('o'), groupId, buyerId: me().id, sellerId: sid,
        items: items.map(i => ({ pid: i.pid, title: i.title, price: i.price, qty: i.qty })),
        subtotal: pr.subtotal, discount: pr.discount, codeId: code ? code.id : null,
        shipping: pr.shipping, total: pr.total, fee: pr.fee, status: 'paid',
        tracking: null, ts: Date.now(), shippedTs: null, deliveredTs: null, address };
      DB.orders.push(o); orderIds.push(o.id);
      items.forEach(i => { const p = productById(i.pid); p.qty -= i.qty; p.sold += i.qty; });
      if (code) code.uses++;
    });
    cart.items = []; cart.codes = {}; save();
    go('#/success/' + groupId);
  }, 1100);
}
function viewSuccess(seg) {
  const orders = DB.orders.filter(o => o.groupId === seg[1] && o.buyerId === (me() || {}).id);
  if (!orders.length) return notFound();
  const total = orders.reduce((s, o) => s + o.total, 0);
  return `<div class="wrap" style="max-width:640px"><div class="empty" style="padding-top:3rem">
    <div class="big">🎉</div><h1 style="color:var(--navy)">Order confirmed!</h1>
    <p style="margin:.4rem 0 1.4rem">${orders.length > 1 ? `One payment of <b>${money(total)}</b>, split across ${orders.length} sellers.` : `<b>${money(total)}</b> paid.`} Confirmation "sent" to ${esc(me().email)} (demo).</p></div>
    ${orders.map(o => `<div class="cart-group"><div class="cart-group-head"><b><a href="#/s/${sellerById(o.sellerId).slug}" style="color:inherit">${esc(sellerById(o.sellerId).name)}</a></b><span class="badge badge-verified" style="margin-left:auto">Paid</span></div>
      ${o.items.map(i => `<div class="cart-line" style="border:none;padding:.35rem 0"><span style="flex:1;font-size:.9rem">${i.qty}× ${esc(i.title)}</span><b>${money(i.price * i.qty)}</b></div>`).join('')}
      <div class="totals">${o.discount ? `<div class="row disc"><span>Discount</span><span>−${money(o.discount)}</span></div>` : ''}<div class="row"><span>Seller receives (after 6.7% fee)</span><span>${money(o.total - o.fee)}</span></div></div></div>`).join('')}
    <div style="display:flex;gap:.7rem;justify-content:center;margin-top:1.2rem"><a class="btn btn-primary" href="#/orders">Track my orders</a><a class="btn btn-outline" href="#/search">Keep shopping</a></div></div>`;
}

/* ---------- orders (buyer) ---------- */
function viewOrders() {
  if (!me()) { openAuth(); return `<div class="wrap"><div class="empty">Sign in to see your orders.</div></div>`; }
  const list = DB.orders.filter(o => o.buyerId === me().id).sort((a, b) => b.ts - a.ts);
  return `<div class="wrap"><div class="page-head"><h1>My orders</h1><p>Every order is protected — not as described? Open a dispute within 48h of delivery.</p></div>
  ${list.length ? list.map(orderCard).join('') : '<div class="empty"><div class="big">📦</div><b>No orders yet.</b><p><a href="#/search">Find your first part →</a></p></div>'}</div>`;
}
function orderCard(o) {
  const s = sellerById(o.sellerId);
  const steps = ['paid', 'shipped', 'delivered'];
  const si = steps.indexOf(o.status);
  const reviewed = DB.reviews.some(r => r.orderId === o.id);
  const disputed = DB.reports.some(r => r.orderId === o.id);
  return `<div class="cart-group reveal in">
    <div class="cart-group-head"><b><a href="#/s/${s.slug}" style="color:inherit" title="Visit shop">${esc(s.name)}</a></b><span style="color:var(--ink3);font-size:.78rem">· ${timeAgo(o.ts)}</span>
      <span class="badge ${o.status === 'delivered' ? 'badge-verified' : o.status === 'refunded' ? 'badge-danger' : 'badge-gray'}" style="margin-left:auto">${o.status}</span></div>
    ${o.items.map(i => `<div class="cart-line" style="padding:.4rem 0"><span style="flex:1;font-size:.9rem">${i.qty}× ${esc(i.title)}</span><b>${money(i.price * i.qty)}</b></div>`).join('')}
    <div class="timeline">${steps.map((st, i2) => `<div class="t-step ${i2 <= si ? 'done' : ''}"><div class="t-dot">${i2 <= si ? icon('check') : ''}</div>${st}</div>`).join('')}</div>
    ${o.tracking ? `<div style="font-size:.8rem;color:var(--ink2)">📦 ${esc(o.tracking)}</div>` : ''}
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.7rem">
      ${o.status === 'shipped' ? `<button class="btn btn-aqua btn-sm" onclick="confirmDelivered('${o.id}')">✓ I received it</button>` : ''}
      ${o.status === 'delivered' && !reviewed ? `<button class="btn btn-primary btn-sm" onclick="openReview('${o.id}')">★ Review ${esc(s.name)}</button>` : ''}
      ${reviewed ? '<span class="badge badge-verified">✓ Reviewed</span>' : ''}
      ${['paid', 'shipped'].includes(o.status) && !disputed ? `<button class="btn btn-danger btn-sm" onclick="openDispute('${o.id}')">Request refund</button>` : ''}
      ${disputed ? '<span class="badge badge-warn">Dispute open</span>' : ''}
      ${o.status === 'paid' ? `<button class="btn btn-ghost btn-sm" onclick="fastForward('${o.id}')">⏩ Demo: fast-forward shipping</button>` : ''}
    </div></div>`;
}
function fastForward(oid) {
  const o = DB.orders.find(x => x.id === oid);
  o.status = 'shipped'; o.shippedTs = Date.now(); o.tracking = 'USPS 9400 DEMO ' + Math.floor(Math.random() * 1e10);
  save(); render(); toast('<b>Shipped!</b> (simulated) Tracking added.');
}
function confirmDelivered(oid) {
  const o = DB.orders.find(x => x.id === oid);
  o.status = 'delivered'; o.deliveredTs = Date.now(); save(); render();
  toast('<b>Delivered ✓</b> You can now review the seller.');
}
function openReview(oid) {
  const o = DB.orders.find(x => x.id === oid); const s = sellerById(o.sellerId);
  modal(`${modalHead('Review ' + esc(s.name))}<div class="modal-body"><form class="form" onsubmit="event.preventDefault();submitReview(this,'${oid}')">
    <div class="field"><label>Rating</label><select name="rating" required><option value="5">★★★★★ Excellent</option><option value="4">★★★★ Good</option><option value="3">★★★ OK</option><option value="2">★★ Poor</option><option value="1">★ Terrible</option></select></div>
    <div class="field"><label>Your review</label><textarea name="body" required placeholder="How was the item? The shipping? The communication?"></textarea>
      <div class="hint">Verified purchase — one review per order. Reviews follow the seller everywhere.</div></div>
    <button class="btn btn-primary">Post review</button></form></div>`);
}
function submitReview(f, oid) {
  const o = DB.orders.find(x => x.id === oid);
  DB.reviews.push({ id: uid('r'), orderId: oid, sellerId: o.sellerId, buyerId: me().id, rating: +f.rating.value, body: f.body.value, ts: Date.now() });
  save(); closeModal(); render(); toast('<b>Review posted.</b> Thanks for keeping the market honest.');
}
function openDispute(oid) {
  const o = DB.orders.find(x => x.id === oid);
  modal(`${modalHead('Request a refund')}<div class="modal-body"><form class="form" onsubmit="event.preventDefault();submitDispute(this,'${oid}')">
    <div class="field"><label>Reason</label><select name="reason" required><option value="not_shipped">Never arrived</option><option value="fake_listing">Not as described</option><option value="other">Other</option></select></div>
    <div class="field"><label>What happened?</label><textarea name="details" required></textarea></div>
    <p style="font-size:.78rem;color:var(--ink3)">IonxSupply mediates within 3 business days. If found in your favor, refund goes to your original payment method.</p>
    <button class="btn btn-primary">Open dispute</button></form></div>`);
}
function submitDispute(f, oid) {
  const o = DB.orders.find(x => x.id === oid);
  DB.reports.push({ id: uid('rp'), sellerId: o.sellerId, reporterId: me().id, orderId: oid, reason: f.reason.value, details: f.details.value, status: 'open', ts: Date.now(), resolvedTs: null, resolution: null });
  save(); closeModal(); render(); toast('<b>Dispute opened.</b> Our trust team is on it.');
}

/* ---------- account ---------- */
function viewAccount() {
  if (!me()) { openAuth(); return `<div class="wrap"><div class="empty">Sign in first.</div></div>`; }
  const u = me();
  const wl = u.wishlist.map(productById).filter(Boolean);
  return `<div class="wrap"><div class="page-head"><h1>My account</h1></div>
  <div class="browse cols-account">
    <div class="panel"><div style="display:flex;align-items:center;gap:.8rem;margin-bottom:1rem"><span class="avatar" style="width:52px;height:52px;font-size:1.1rem">${esc(u.name.split(' ').map(w => w[0]).join('').slice(0, 2))}</span>
      <div><b>${esc(u.name)}</b><div style="font-size:.8rem;color:var(--ink3)">${esc(u.email)}</div><span class="badge badge-gray">${u.role}</span></div></div>
      <form class="form" onsubmit="event.preventDefault();me().name=this.name.value;save();render();toast('Profile updated.')">
        <div class="field"><label>Display name</label><input name="name" value="${esc(u.name)}"></div>
        <button class="btn btn-outline btn-sm">Save</button></form>
      <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:.4rem">
        <a href="#/orders">📦 My orders</a>${u.sellerId ? '<a href="#/dashboard">🏪 Seller dashboard</a>' : '<a href="#/sell">🏪 Become a seller</a>'}</div></div>
    <div><h2 style="font-size:1.15rem;margin-bottom:.9rem">❤️ Watchlist (${wl.length})</h2>
      ${wl.length ? `<div class="grid grid-products">${wl.map(pCard).join('')}</div>` : '<div class="empty">Nothing saved yet — tap the ♡ on any part.</div>'}</div>
  </div></div>`;
}

/* ---------- seller dashboard ---------- */
function viewDashboard(seg, q) {
  const s = mySeller();
  if (!me()) { openAuth(); return `<div class="wrap"><div class="empty">Sign in first.</div></div>`; }
  if (!s) return `<div class="wrap"><div class="empty"><div class="big">🏪</div><b>You're not a seller yet.</b><p><a href="#/sell">Apply in 2 minutes →</a></p></div></div>`;
  const tab = q.get('tab') || 'overview';
  const myP = DB.products.filter(p => p.sellerId === s.id);
  const myO = DB.orders.filter(o => o.sellerId === s.id).sort((a, b) => b.ts - a.ts);
  const myC = DB.codes.filter(c => c.sellerId === s.id);
  const myR = DB.reviews.filter(x => x.sellerId === s.id && !x.hidden).sort((a, b) => b.ts - a.ts);
  const rev = myO.filter(o => ['paid', 'shipped', 'delivered'].includes(o.status)).reduce((t, o) => t + o.total - o.fee, 0);
  const r = ratingOf(s.id);
  const tabs = [['overview', 'Overview'], ['products', `Products (${myP.length})`], ['codes', `Codes (${myC.length})`], ['orders', `Orders (${myO.length})`], ['reviews', `Reviews (${myR.length})`], ['settings', 'Settings']];
  return `<div class="wrap"><div class="page-head" style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
    <div class="s-logo" style="background:${sellerLogoBg(s)};width:54px;height:54px">${logoContent(s)}</div>
    <div style="flex:1"><h1 style="font-size:1.4rem">${esc(s.name)}</h1><p>${s.slug}.ionxsupply.example · <a href="#/s/${s.slug}">view public storefront →</a></p></div>
    ${s.status === 'suspended' ? '<span class="badge badge-danger">SUSPENDED</span>' : '<span class="badge badge-verified">Active · payouts on</span>'}</div>
  <div class="side-tabs">${tabs.map(([v, n]) => `<button class="${tab === v ? 'active' : ''}" onclick="go('#/dashboard?tab=${v}')">${n}</button>`).join('')}</div>
  ${s.status === 'suspended' ? `<div class="notice" style="background:#fdeaea;border-color:#f0c9c9;color:var(--danger)">🚫 <b>Your shop is suspended.</b> ${s.suspendReason ? 'Reason: ' + esc(s.suspendReason) + '. ' : ''}Your storefront and listings are hidden market-wide — reply to the trust team to appeal.</div>` : ''}
  ${tab === 'overview' ? `
    <div class="stat-grid">
      <div class="stat"><b data-count="${Math.round(rev / 100)}" data-prefix="$"></b><span>Net revenue (after 6.7% fee)</span></div>
      <div class="stat"><b data-count="${myO.length}"></b><span>Orders</span></div>
      <div class="stat"><b data-count="${myP.reduce((t, p) => t + p.sold, 0)}"></b><span>Items sold</span></div>
      <div class="stat"><b>${r.avg ? r.avg.toFixed(1) + '★' : '—'}</b><span>${r.count} reviews</span></div>
      <div class="stat"><b data-count="${myP.reduce((t, p) => t + p.views, 0)}"></b><span>Listing views</span></div></div>
    <div class="panel"><h3 style="margin-bottom:.7rem">Latest orders</h3>${myO.length ? sellerOrderRows(myO.slice(0, 5)) : '<p style="color:var(--ink3)">No orders yet — share your storefront link!</p>'}</div>` : ''}
  ${tab === 'products' ? `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem"><h2 style="font-size:1.15rem">Listings</h2><button class="btn btn-primary" onclick="openProductForm()">+ New listing</button></div>
    <div class="tbl-wrap panel"><table class="table"><tr><th>Item</th><th>Price</th><th>Stock</th><th>Sold</th><th>Views</th><th></th></tr>
      ${myP.map(p => `<tr><td style="max-width:280px"><b style="font-size:.85rem">${esc(p.title)}</b><br><span class="badge badge-${p.cond}">${condName(p.cond)}</span></td>
        <td>${money(p.price)}</td><td>${p.qty || '<span class="badge badge-danger">Sold out</span>'}</td><td>${p.sold}</td><td>${p.views}</td>
        <td style="white-space:nowrap"><button class="btn btn-outline btn-sm" onclick="openProductForm('${p.id}')">Edit</button> <button class="btn btn-ghost btn-sm" onclick="delProduct('${p.id}')">🗑</button></td></tr>`).join('')}</table></div>` : ''}
  ${tab === 'codes' ? `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem"><h2 style="font-size:1.15rem">Discount codes</h2><button class="btn btn-primary" onclick="openCodeForm()">+ New code</button></div>
    <div class="tbl-wrap panel"><table class="table"><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Used</th><th>Status</th><th></th></tr>
      ${myC.map(c => { const dead = !c.active || (c.expires && c.expires < Date.now()) || (c.max != null && c.uses >= c.max);
        return `<tr><td><b>${c.code}</b></td><td>${c.type === 'percent' ? c.value + '%' : money(c.value)}</td><td>${c.min ? money(c.min) : '—'}</td>
        <td>${c.uses}${c.max != null ? '/' + c.max : ''}</td><td>${dead ? '<span class="badge badge-gray">inactive</span>' : '<span class="badge badge-verified">live</span>'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="toggleCode('${c.id}')">${c.active ? 'Disable' : 'Enable'}</button></td></tr>`; }).join('') || '<tr><td colspan="6" style="color:var(--ink3)">No codes yet — private promo codes you share yourself.</td></tr>'}</table></div>` : ''}
  ${tab === 'orders' ? `<div class="panel tbl-wrap">${myO.length ? sellerOrderRows(myO) : '<p style="color:var(--ink3)">No orders yet.</p>'}</div>` : ''}
  ${tab === 'reviews' ? `<div class="panel"><div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.8rem"><h2 style="font-size:1.15rem">Customer reviews</h2>${myR.length ? `<span class="rating-line">${stars(r.avg)} <b>${r.avg.toFixed(1)}</b> · ${myR.length} total</span>` : ''}</div>${myR.length ? myR.map(rv => { const prod = rv.productId ? productById(rv.productId) : null; const u = userById(rv.buyerId); return `<div class="review"><div class="review-head"><span class="avatar">${esc((u?.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2))}</span><b style="font-size:.9rem">${esc(u?.name || 'Buyer')}</b> ${stars(rv.rating)} <small>· ${rv.verified === false ? '' : 'verified purchase · '}${timeAgo(rv.ts)}</small></div>${prod ? `<div style="font-size:.78rem;color:var(--ink3);margin:.1rem 0 .35rem">on <a href="#/p/${prod.id}">${esc(prod.title.slice(0, 52))}</a></div>` : ''}<p>${esc(rv.body)}</p></div>`; }).join('') : '<p style="color:var(--ink3)">No reviews yet — they will appear here as buyers leave them.</p>'}</div>` : ''}
  ${tab === 'settings' ? brandEditorHTML(s) + `<div class="panel" style="max-width:560px"><form class="form" onsubmit="event.preventDefault();saveShop(this)">
    <div class="field"><label>Shop name</label><input name="name" value="${esc(s.name)}" required></div>
    <div class="field"><label>Tagline</label><input name="tagline" value="${esc(s.tagline)}" maxlength="80"></div>
    <div class="field"><label>About</label><textarea name="bio">${esc(s.bio)}</textarea></div>
    <div class="field"><label>Your website <span style="font-weight:400;color:var(--ink3)">(optional)</span></label><input name="website" value="${s.website ? esc(s.website) : ''}" placeholder="https://your-shop.com"><div class="hint">Shows as a link on all your listings.</div></div>
    <div class="field"><label>Shop URL</label><input value="${s.slug}.ionxsupply.example" disabled><div class="hint">Subdomain is locked after approval (production: wildcard DNS under our domain).</div></div>
    <button class="btn btn-primary">Save settings</button></form></div>` : ''}
  </div>`;
}
function sellerOrderRows(list) {
  return `<table class="table"><tr><th>Order</th><th>Items</th><th>Buyer pays</th><th>You get</th><th>Status</th><th></th></tr>
  ${list.map(o => `<tr><td style="font-size:.78rem">${o.id.slice(0, 8)}<br><span style="color:var(--ink3)">${timeAgo(o.ts)}</span></td>
    <td style="max-width:240px;font-size:.83rem">${o.items.map(i => `${i.qty}× ${esc(i.title.slice(0, 34))}…`).join('<br>')}</td>
    <td>${money(o.total)}</td><td><b>${money(o.total - o.fee)}</b></td>
    <td><span class="badge ${o.status === 'delivered' ? 'badge-verified' : 'badge-gray'}">${o.status}</span></td>
    <td>${o.status === 'paid' ? `<button class="btn btn-aqua btn-sm" onclick="openShip('${o.id}')">Mark shipped</button>` : (o.tracking ? `<span style="font-size:.72rem;color:var(--ink3)">${esc(o.tracking.slice(0, 18))}…</span>` : '')}</td></tr>`).join('')}</table>`;
}
function openShip(oid) {
  const o = DB.orders.find(x => x.id === oid); if (!o) return;
  const a = o.address;
  modal(`${modalHead('Ship order · ' + oid.slice(0, 8))}<div class="modal-body">
    ${a ? `<div class="ship-to"><div class="ship-to-h">📦 Ship to</div><b>${esc(a.name)}</b><br>${esc(a.line1)}<br>${esc(a.city)}, ${esc(a.state)} ${esc(a.zip)}</div>` : ''}
    <div class="ship-items"><b>Items</b><br>${o.items.map(i => `${i.qty}× ${esc(i.title)}`).join('<br>')}</div>
    <form class="form" onsubmit="event.preventDefault();doShip(this,'${oid}')">
    <div class="form-row"><div class="field"><label>Carrier</label><select name="carrier"><option>USPS</option><option>UPS</option><option>FedEx</option></select></div>
    <div class="field"><label>Tracking number</label><input name="tn" required placeholder="9400 1000 …"></div></div>
    <button class="btn btn-primary">Confirm shipment</button><p style="font-size:.75rem;color:var(--ink3)">Buyer gets emailed the tracking; payout releases on fulfillment.</p></form></div>`);
}
function doShip(f, oid) {
  const o = DB.orders.find(x => x.id === oid);
  o.status = 'shipped'; o.shippedTs = Date.now(); o.tracking = f.carrier.value + ' ' + f.tn.value;
  save(); closeModal(); render(); toast('<b>Shipped ✓</b> Buyer notified (demo).');
}
function joinDropAlerts(f) {
  const email = (f.querySelector('input').value || '').trim(); if (!email) return;
  DB.subscribers = DB.subscribers || []; if (!DB.subscribers.includes(email)) DB.subscribers.push(email); save();
  f.reset(); toast('<b>You\'re on the list.</b> We\'ll email you new drops & restocks (demo).');
}
function notifyMe(pid) {
  if (!requireAuth()) return;
  const u = me(); u.stockAlerts = u.stockAlerts || [];
  if (!u.stockAlerts.includes(pid)) u.stockAlerts.push(pid);
  save(); toast('<b>We\'ll let you know.</b> You\'ll get an email the moment it\'s back in stock (demo).');
}
function saveShop(f) { const s = mySeller(); s.name = f.name.value; s.tagline = f.tagline.value; s.bio = f.bio.value; s.website = normWebsite(f.website && f.website.value); save(); render(); toast('Shop settings saved.'); }

/* ---------- storefront branding editor ---------- */
function brandEditorHTML(s) {
  const initials = esc(s.name.split(' ').map(w => w[0]).join('').slice(0, 2));
  const [c1, c2] = gradColors(s.color);
  const banner = s.banner || '', accent = s.accent || '';
  const isImg = !!banner, isUrlImg = isImg && !banner.startsWith('data:');
  return `<div class="panel brand-editor" style="max-width:680px;margin-bottom:1.2rem">
    <h3 style="margin-bottom:.15rem">🎨 Storefront branding</h3>
    <p class="hint" style="margin-bottom:1rem">Design your banner, logo and shop accent — the preview updates live. This is exactly what buyers see on your public storefront.</p>
    <div class="brand-preview store-scope"${accent ? ` style="--shop-accent:${accent}"` : ''}>
      <div id="bp-banner" class="bp-banner" style="background:${sellerBannerBg(s)}"><div class="store-banner-glow"></div></div>
      <div class="bp-head">
        <div id="bp-logo" class="bp-logo" style="background:${sellerLogoBg(s)}">${s.logo ? `<img class="logo-fill" src="${esc(s.logo)}" alt="">` : initials}</div>
        <div class="bp-id"><div class="bp-name">${esc(s.name)} <span class="badge badge-verified">${icon('check')} Verified seller</span></div>
          <div class="bp-sub">${stars(ratingOf(s.id).avg || 5)} <span class="bp-accent-chip">${esc(s.slug)}.ionxsupply.example</span></div></div>
      </div>
    </div>
    <input type="hidden" id="bp-color" value="${esc(s.color)}">
    <input type="hidden" id="bp-banner-val" value="${esc(banner)}">
    <input type="hidden" id="bp-accent-val" value="${esc(accent)}">
    <input type="hidden" id="bp-logo-val" value="${esc(s.logo || '')}">
    <div class="brand-controls">
      <div class="brand-block">
        <label class="brand-lbl">Banner</label>
        <div class="seg" id="bp-typeseg">
          <button type="button" class="${isImg ? '' : 'on'}" onclick="brandType('gradient')">Gradient</button>
          <button type="button" class="${isImg ? 'on' : ''}" onclick="brandType('image')">Image</button>
        </div>
        <div id="bp-grad-panel"${isImg ? ' style="display:none"' : ''}>
          <div class="swatch-row">${PRESET_GRADIENTS.map(g => `<button type="button" class="swatch" style="background:${g}" title="Use this preset" onclick="brandPreset(\`${g}\`)"></button>`).join('')}</div>
          <div class="brand-row">
            <label class="color-lbl">Start <input type="color" id="bp-c1" value="${c1}" oninput="brandGradient()"></label>
            <label class="color-lbl">End <input type="color" id="bp-c2" value="${c2}" oninput="brandGradient()"></label>
          </div>
        </div>
        <div id="bp-img-panel"${isImg ? '' : ' style="display:none"'}>
          <input type="file" accept="image/*" id="bp-file" onchange="brandUpload(this)" hidden>
          <div class="brand-row">
            <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('bp-file').click()">⬆ Upload image</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="brandRemoveImg()">Remove image</button>
          </div>
          <input class="brand-url" id="bp-url" placeholder="…or paste an image URL" value="${isUrlImg ? esc(banner) : ''}" oninput="brandImageUrl(this.value)">
          <div class="hint">Uploads are auto-resized (~1200px, JPEG) so your storefront stays fast.</div>
        </div>
      </div>
      <div class="brand-block">
        <label class="brand-lbl">Logo <span class="hint">— replaces the initials on your shop (PNG with transparency looks best)</span></label>
        <input type="file" accept="image/*" id="bp-logofile" onchange="brandLogoUpload(this)" hidden>
        <div class="brand-row">
          <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('bp-logofile').click()">⬆ Upload logo</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="brandLogoRemove()">Use initials</button>
        </div>
      </div>
      <div class="brand-block">
        <label class="brand-lbl">Accent color <span class="hint">— your logo + storefront highlights</span></label>
        <div class="brand-row">
          <input type="color" id="bp-accent" value="${accent || '#5b5f66'}" oninput="brandAccent()">
          <span class="hint" id="bp-accent-hex">${accent || 'default (IonxSupply grey)'}</span>
          <button type="button" class="btn btn-ghost btn-sm" onclick="brandAccentReset()">Reset</button>
        </div>
      </div>
      <button type="button" class="btn btn-primary" onclick="saveBranding()">Save branding</button>
    </div>
  </div>`;
}
function brandPreview() {
  const color = $('#bp-color').value, banner = $('#bp-banner-val').value, accent = $('#bp-accent-val').value;
  $('#bp-banner').style.background = banner ? `url('${banner}') center/cover no-repeat` : color;
  const bl = $('#bp-logo'), logo = $('#bp-logo-val').value;
  bl.style.background = accent || color;
  bl.innerHTML = logo ? `<img class="logo-fill" src="${logo}" alt="">` : (mySeller() ? sellerInitials(mySeller()) : '');
  const scope = document.querySelector('.brand-preview');
  if (accent) scope.style.setProperty('--shop-accent', accent); else scope.style.removeProperty('--shop-accent');
  const hex = $('#bp-accent-hex'); if (hex) hex.textContent = accent || 'default (IonxSupply grey)';
}
function brandType(t) {
  const img = t === 'image';
  $('#bp-grad-panel').style.display = img ? 'none' : '';
  $('#bp-img-panel').style.display = img ? '' : 'none';
  const seg = $('#bp-typeseg').children;
  seg[0].classList.toggle('on', !img); seg[1].classList.toggle('on', img);
  if (!img) brandGradient(); else brandPreview();
}
function brandGradient() {
  $('#bp-color').value = `linear-gradient(135deg,${$('#bp-c1').value},${$('#bp-c2').value})`;
  $('#bp-banner-val').value = '';
  brandPreview();
}
function brandPreset(g) { const [c1, c2] = gradColors(g); $('#bp-c1').value = c1; $('#bp-c2').value = c2; brandGradient(); }
function brandUpload(input) {
  const file = input.files && input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / img.width);
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      let data; try { data = cv.toDataURL('image/jpeg', 0.82); } catch (err) { data = e.target.result; }
      $('#bp-banner-val').value = data; $('#bp-url').value = '';
      brandType('image'); brandPreview();
      toast('Banner image set — preview updated.');
    };
    img.onerror = () => toast('Could not read that image.', 'err');
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function brandImageUrl(v) { $('#bp-banner-val').value = v.trim(); brandPreview(); }
function brandRemoveImg() { $('#bp-banner-val').value = ''; $('#bp-url').value = ''; $('#bp-file').value = ''; brandType('gradient'); }
function brandLogoUpload(input) {
  const file = input.files && input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 400 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      let data; try { data = cv.toDataURL('image/png'); } catch (err) { data = e.target.result; }
      $('#bp-logo-val').value = data; brandPreview();
      toast('Logo set — preview updated.');
    };
    img.onerror = () => toast('Could not read that image.', 'err');
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function brandLogoRemove() { $('#bp-logo-val').value = ''; $('#bp-logofile').value = ''; brandPreview(); }
function brandAccent() { $('#bp-accent-val').value = $('#bp-accent').value; brandPreview(); }
function brandAccentReset() { $('#bp-accent-val').value = ''; brandPreview(); }
function saveBranding() {
  const s = mySeller(); if (!s) return;
  s.color = $('#bp-color').value;
  s.banner = $('#bp-banner-val').value || null;
  s.accent = $('#bp-accent-val').value || null;
  s.logo = $('#bp-logo-val').value || null;
  save(); render(); toast('<b>Branding saved ✓</b> Your storefront is updated.');
}

/* product form */
function openProductForm(pid) {
  const p = pid ? productById(pid) : null;
  const specs = p ? Object.entries(p.specs) : [['', ''], ['', ''], ['', '']];
  while (specs.length < 3) specs.push(['', '']);
  modal(`${modalHead(p ? 'Edit listing' : 'New listing')}<div class="modal-body"><form class="form" onsubmit="event.preventDefault();saveProduct(this,'${pid || ''}')">
    <div class="field"><label>Title</label><input name="title" required maxlength="140" value="${p ? esc(p.title) : ''}" placeholder="52V 20Ah battery — Samsung cells…"></div>
    <div class="form-row"><div class="field"><label>Category</label><select name="cat">${CATS.map(c => `<option value="${c.id}" ${p && p.cat === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div>
    <div class="field"><label>Condition</label><select name="cond">${['new', 'like_new', 'used', 'for_parts'].map(c => `<option value="${c}" ${p && p.cond === c ? 'selected' : ''}>${condName(c)}</option>`).join('')}</select></div></div>
    <div class="form-row"><div class="field"><label>Price ($)</label><input name="price" type="number" step="0.01" min="1" required value="${p ? (p.price / 100).toFixed(2) : ''}"></div>
    <div class="field"><label>Shipping ($, 0 = free)</label><input name="ship" type="number" step="0.01" min="0" required value="${p ? (p.ship / 100).toFixed(2) : '0'}"></div></div>
    <div class="form-row"><div class="field"><label>Quantity</label><input name="qty" type="number" min="0" required value="${p ? p.qty : 1}"></div>
    <div class="field"><label>Brand</label><input name="brand" value="${p ? esc(p.brand) : ''}"></div></div>
    <div class="field"><label>Photos <span style="font-weight:400;color:var(--ink3)">(optional — add several; the first is the cover, we generate clean art if empty)</span></label>
      <input type="file" accept="image/*" multiple id="pf-file" onchange="productPhotoUpload(this)" hidden>
      <input type="hidden" name="imgs" id="pf-imgs" value="${p ? esc(JSON.stringify(p.imgs && p.imgs.length ? p.imgs : (p.img ? [p.img] : []))) : '[]'}">
      <div class="brand-row" style="margin-bottom:.5rem"><button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('pf-file').click()">⬆ Upload from computer</button><span class="hint">up to 10 · first = cover</span></div>
      <div id="pf-thumbs" class="pf-thumbs"></div>
      <div class="brand-row" style="margin-top:.5rem"><input class="brand-url" id="pf-url" placeholder="…or paste an image URL" style="flex:1"><button type="button" class="btn btn-ghost btn-sm" onclick="pfAddUrl()">Add</button></div></div>
    <div class="field"><label>Specs (electrical compatibility sells parts)</label>
      ${specs.slice(0, 4).map(([k, v], i) => `<div class="form-row" style="margin-bottom:.4rem"><input name="sk${i}" placeholder="Voltage" value="${esc(k)}"><input name="sv${i}" placeholder="52V" value="${esc(v)}"></div>`).join('')}</div>
    <div class="field"><label>Fits which bikes?</label>
      <label class="check-line" style="margin-bottom:.35rem"><input type="checkbox" name="universal" ${p && p.universal ? 'checked' : ''}> Universal fit</label>
      <div style="max-height:130px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:.5rem .7rem">
      ${BIKES.map(b => `<label class="check-line" style="padding:.12rem 0"><input type="checkbox" name="fit_${b.id}" ${p && p.fits.includes(b.id) ? 'checked' : ''}> ${b.brand} ${b.model}</label>`).join('')}</div></div>
    <div class="field"><label>Description</label><textarea name="desc" required>${p ? esc(p.desc) : ''}</textarea></div>
    <div class="notice" id="bat-note" style="display:none">🔋 Battery listings must declare certification (add a "Certification" spec) and ship ground. <a href="#/legal/prohibited">Policy</a></div>
    <button class="btn btn-primary btn-lg">${p ? 'Save changes' : 'Publish listing'}</button></form></div>`, true);
  const sel = $('#modal-root select[name=cat]');
  const note = () => { $('#bat-note').style.display = sel.value === 'batteries' ? 'block' : 'none'; };
  sel.addEventListener('change', note); note();
  renderProductThumbs();
}
function pfImgs() { try { return JSON.parse(document.getElementById('pf-imgs').value || '[]'); } catch (e) { return []; } }
function pfSetImgs(arr) { document.getElementById('pf-imgs').value = JSON.stringify(arr.slice(0, 10)); renderProductThumbs(); }
function renderProductThumbs() {
  const box = document.getElementById('pf-thumbs'); if (!box) return;
  box.innerHTML = pfImgs().map((src, i) => `<span class="pf-thumb">${i === 0 ? '<span class="pf-cover">Cover</span>' : ''}<img src="${esc(src)}" alt=""><button type="button" onclick="pfRemoveImg(${i})" aria-label="Remove">×</button></span>`).join('');
}
function pfRemoveImg(i) { const a = pfImgs(); a.splice(i, 1); pfSetImgs(a); }
function pfAddUrl() { const el = document.getElementById('pf-url'); const v = (el.value || '').trim(); if (!v) return; pfSetImgs([...pfImgs(), v]); el.value = ''; }
function saveProduct(f, pid) {
  const s = mySeller();
  const specs = {};
  for (let i = 0; i < 4; i++) { const k = f['sk' + i]?.value.trim(), v = f['sv' + i]?.value.trim(); if (k && v) specs[k] = v; }
  const fits = BIKES.filter(b => f['fit_' + b.id]?.checked).map(b => b.id);
  let imgs = []; try { imgs = JSON.parse(f.imgs.value || '[]'); } catch (e) {}
  imgs = imgs.filter(Boolean).slice(0, 10);
  const base = {
    title: f.title.value, cat: f.cat.value, cond: f.cond.value, brand: f.brand.value || '—',
    price: Math.round(parseFloat(f.price.value) * 100), ship: Math.round(parseFloat(f.ship.value) * 100),
    qty: parseInt(f.qty.value), universal: f.universal.checked, fits, specs, desc: f.desc.value,
    img: imgs[0] || null, imgs: imgs.length ? imgs : null,
  };
  if (pid) Object.assign(productById(pid), base);
  else DB.products.push({ id: uid('p'), sellerId: s.id, sold: 0, views: 0, ts: Date.now(), ...base });
  save(); closeModal(); render(); toast(pid ? 'Listing updated.' : '<b>Listing live!</b> It\'s now searchable market-wide.');
}
function delProduct(pid) { if (!confirm('Remove this listing?')) return; DB.products = DB.products.filter(p => p.id !== pid); save(); render(); toast('Listing removed.'); }
function productPhotoUpload(input) {
  const files = [...(input.files || [])];
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1000 / img.width);
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        let data; try { data = cv.toDataURL('image/jpeg', 0.82); } catch (err) { data = e.target.result; }
        pfSetImgs([...pfImgs(), data]);
      };
      img.onerror = () => toast('Could not read that image.', 'err');
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}
function openCodeForm() {
  modal(`${modalHead('New discount code')}<div class="modal-body"><form class="form" onsubmit="event.preventDefault();saveCode(this)">
    <div class="form-row"><div class="field"><label>Code</label><input name="code" required maxlength="16" placeholder="SUMMER10" style="text-transform:uppercase"></div>
    <div class="field"><label>Type</label><select name="type"><option value="percent">% off</option><option value="fixed">$ off</option></select></div></div>
    <div class="form-row"><div class="field"><label>Value</label><input name="value" type="number" min="1" required placeholder="10"></div>
    <div class="field"><label>Min order ($, optional)</label><input name="min" type="number" min="0" value="0"></div></div>
    <div class="field"><label>Max uses (blank = unlimited)</label><input name="max" type="number" min="1"></div>
    <button class="btn btn-primary">Create code</button><p style="font-size:.75rem;color:var(--ink3)">Codes stay private — share them in your own promos. They still work at checkout.</p></form></div>`);
}
function saveCode(f) {
  const s = mySeller(); const type = f.type.value;
  const value = type === 'percent' ? Math.min(100, +f.value.value) : Math.round(parseFloat(f.value.value) * 100);
  DB.codes.push({ id: uid('c'), sellerId: s.id, code: f.code.value.toUpperCase(), type, value, min: Math.round((+f.min.value || 0) * 100), max: f.max.value ? +f.max.value : null, uses: 0, expires: null, active: true });
  save(); closeModal(); render(); toast(`<b>${f.code.value.toUpperCase()}</b> is live — share it in your promos.`);
}
function toggleCode(cid) { const c = DB.codes.find(x => x.id === cid); c.active = !c.active; save(); render(); }

/* ---------- admin ---------- */
function viewAdmin(seg, q) {
  const u = me();
  if (!u || u.role !== 'admin') return `<div class="wrap"><div class="empty"><div class="big">🛡️</div><b>Admins only.</b><p>Use the “Admin demo” shortcut on the sign-in screen.</p><button class="btn btn-primary" onclick="openAuth()">Sign in</button></div></div>`;
  const tab = q.get('tab') || 'reports';
  const apps = DB.applications.filter(a => a.status === 'pending');
  const open = DB.reports.filter(r => r.status === 'open');
  const gmv = DB.orders.reduce((t, o) => t + o.total, 0);
  const fees = DB.orders.reduce((t, o) => t + o.fee, 0);
  const flagged = {}; open.forEach(r => flagged[r.sellerId] = (flagged[r.sellerId] || 0) + 1);
  return `<div class="wrap"><div class="page-head"><h1>Trust & ops</h1><p>Applications, reports and seller enforcement — the human in the loop.</p></div>
  <div class="stat-grid">
    <div class="stat"><b data-count="${Math.round(gmv / 100)}" data-prefix="$"></b><span>GMV (all time)</span></div>
    <div class="stat"><b data-count="${Math.round(fees / 100)}" data-prefix="$"></b><span>Platform fees earned</span></div>
    <div class="stat"><b data-count="${apps.length}"></b><span>Pending applications</span></div>
    <div class="stat"><b data-count="${open.length}"></b><span>Open reports</span></div></div>
  <div class="side-tabs">${[['reports', `Reports (${open.length})`], ['apps', `Applications (${apps.length})`], ['sellers', 'Sellers']].map(([v, n]) => `<button class="${tab === v ? 'active' : ''}" onclick="go('#/admin?tab=${v}')">${n}</button>`).join('')}</div>
  ${tab === 'apps' ? `<div class="panel tbl-wrap"><table class="table"><tr><th>Shop</th><th>Applicant</th><th>Pitch</th><th></th></tr>
    ${apps.map(a => `<tr><td><b>${esc(a.shop)}</b><br><span style="font-size:.75rem;color:var(--ink3)">${a.slug}.ionxsupply.example</span></td>
      <td>${esc(userById(a.userId)?.name)}</td><td style="max-width:320px;font-size:.83rem">${esc(a.pitch)}</td>
      <td style="white-space:nowrap"><button class="btn btn-aqua btn-sm" onclick="approveApplication('${a.id}');render()">Approve</button>
      <button class="btn btn-danger btn-sm" onclick="rejectApp('${a.id}')">Reject</button></td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--ink3)">Queue clear ✨</td></tr>'}</table></div>` : ''}
  ${tab === 'reports' ? `<div class="panel">${DB.reports.sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1) || b.ts - a.ts).map(r => {
    const s = sellerById(r.sellerId);
    return `<div class="review"><div class="review-head"><b>${esc(s?.name)}</b>
      <span class="badge ${r.status === 'open' ? 'badge-danger' : r.status === 'resolved' ? 'badge-verified' : 'badge-gray'}">${r.status}</span>
      <span class="badge badge-warn">${r.reason.replace('_', ' ')}</span>${r.orderId ? '<span class="badge badge-gray">dispute</span>' : ''}
      ${flagged[r.sellerId] >= 2 ? '<span class="badge badge-danger">⚠ multiple open reports</span>' : ''}
      <small style="margin-left:auto">${timeAgo(r.ts)} · by ${esc(userById(r.reporterId)?.name)}</small></div>
      <p>${esc(r.details)}</p>${r.resolution ? `<p style="font-size:.8rem;color:var(--aqua-deep)">↳ ${esc(r.resolution)}</p>` : ''}
      ${r.status === 'open' ? `<div style="display:flex;gap:.5rem;margin-top:.5rem">
        <button class="btn btn-aqua btn-sm" onclick="resolveReport('${r.id}','resolved')">Resolve</button>
        <button class="btn btn-outline btn-sm" onclick="resolveReport('${r.id}','dismissed')">Dismiss</button>
        ${s?.status === 'active' ? `<button class="btn btn-danger btn-sm" onclick="suspendSeller('${s.id}')">Suspend seller</button>` : ''}</div>` : ''}</div>`;
  }).join('') || '<p style="color:var(--ink3)">No reports. Suspiciously peaceful.</p>'}</div>` : ''}
  ${tab === 'sellers' ? `<div class="panel tbl-wrap"><table class="table"><tr><th>Seller</th><th>Rating</th><th>Items</th><th>GMV</th><th>Status</th><th></th></tr>
    ${DB.sellers.map(s => { const r = ratingOf(s.id); const g = DB.orders.filter(o => o.sellerId === s.id).reduce((t, o) => t + o.total, 0);
      return `<tr><td><b>${esc(s.name)}</b><br><span style="font-size:.75rem;color:var(--ink3)">${s.slug}</span></td>
      <td>${r.avg ? r.avg.toFixed(1) + '★ (' + r.count + ')' : '—'}</td><td>${DB.products.filter(p => p.sellerId === s.id).length}</td><td>${money(g)}</td>
      <td><span class="badge ${s.status === 'active' ? 'badge-verified' : 'badge-danger'}">${s.status}</span></td>
      <td>${s.status === 'active' ? `<button class="btn btn-danger btn-sm" onclick="suspendSeller('${s.id}')">Suspend</button>` : `<button class="btn btn-aqua btn-sm" onclick="unsuspendSeller('${s.id}')">Reinstate</button>`}</td></tr>`; }).join('')}</table></div>` : ''}
  </div>`;
}
function rejectApp(id) {
  const a = DB.applications.find(x => x.id === id); if (!a) return;
  modal(`${modalHead('Reject ' + esc(a.shop))}<div class="modal-body"><form class="form" onsubmit="event.preventDefault();doReject('${id}',this)">
    <div class="field"><label>Reason <span style="font-weight:400;color:var(--ink3)">(sent to the applicant)</span></label><textarea name="reason" required placeholder="e.g. We couldn't verify your inventory, prohibited items in your pitch, or an incomplete application…"></textarea></div>
    <button class="btn btn-danger">Reject application</button></form></div>`);
}
function doReject(id, f) {
  const a = DB.applications.find(x => x.id === id); if (!a) return;
  a.status = 'rejected'; a.rejectReason = f.reason.value.trim(); a.decidedTs = Date.now();
  save(); closeModal(); render(); toast('Application rejected — reason sent to the applicant.');
}
function reapplyAfterReject(appId) { DB.applications = DB.applications.filter(a => a.id !== appId); save(); render(); }
function resolveReport(id, status) {
  const r = DB.reports.find(x => x.id === id); r.status = status; r.resolvedTs = Date.now();
  r.resolution = status === 'resolved' ? 'Handled by trust team (demo).' : 'Reviewed — no policy violation found.';
  save(); render(); toast('Report ' + status + '.');
}
function suspendSeller(id) {
  const s = sellerById(id); if (!s) return;
  modal(`${modalHead('Suspend ' + esc(s.name))}<div class="modal-body"><form class="form" onsubmit="event.preventDefault();doSuspend('${id}',this)">
    <div class="notice" style="margin-bottom:1rem">Their storefront and all listings go dark immediately, market-wide.</div>
    <div class="field"><label>Reason <span style="font-weight:400;color:var(--ink3)">(shown to the seller on their dashboard)</span></label><textarea name="reason" required placeholder="e.g. Repeated not-as-described reports, counterfeit items, or unshipped orders…"></textarea></div>
    <button class="btn btn-danger">Suspend seller</button></form></div>`);
}
function doSuspend(id, f) {
  const s = sellerById(id); s.status = 'suspended'; s.suspendReason = f.reason.value.trim(); s.suspendedTs = Date.now();
  save(); closeModal(); render(); toast('<b>Seller suspended.</b> Listings hidden market-wide.', 'err');
}
function unsuspendSeller(id) { const s = sellerById(id); s.status = 'active'; delete s.suspendReason; save(); render(); toast('Seller reinstated.'); }

/* ---------- legal ---------- */
function viewLegal(seg) {
  const page = LEGAL[seg[1]] || LEGAL.tos;
  return `<div class="wrap"><div class="legal-page"><div class="page-head"><h1>${page.title}</h1><p>IonxSupply demo · last updated July 2026</p></div>
    <div class="panel">${page.body}</div>
    <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem">${Object.entries(LEGAL).map(([k, v]) => `<a class="chip" href="#/legal/${k}">${v.title}</a>`).join('')}</div></div></div>`;
}
function notFound() {
  return `<div class="wrap"><div class="empty" style="padding-top:3.5rem"><div class="big">🤷</div><b>That page doesn't exist.</b>
    <p>The link may be broken, or the listing was removed.</p>
    <div style="display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap;margin-top:1.1rem"><a class="btn btn-primary" href="#/">← Back home</a><a class="btn btn-outline" href="#/search">Browse all parts</a></div></div></div>`;
}

/* ================= boot ================= */
render();
