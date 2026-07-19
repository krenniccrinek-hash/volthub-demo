/* VoltHub demo — simulated marketplace app. All data in localStorage. */

/* ================= state ================= */
const DBKEY = 'volthub_db_v1';
let DB;
try { DB = JSON.parse(localStorage.getItem(DBKEY)) || null; } catch (e) { DB = null; }
if (!DB || DB.v !== 1) { DB = seedDB(); DB.guestCart = { items: [], codes: {} }; save(); }
if (!DB.guestCart) DB.guestCart = { items: [], codes: {} };

function save() { localStorage.setItem(DBKEY, JSON.stringify(DB)); }
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

/* ================= pricing (same contract as the build plan) ================= */
const FEE_RATE = 0.10, FEE_MIN = 50;
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
function render() {
  const { seg, q } = parseHash();
  const fn = routes[seg[0] || ''] || viewHome;
  renderNav(); renderFooter();
  const v = $('#view');
  v.classList.remove('view-enter'); void v.offsetWidth;
  v.innerHTML = fn(seg, q) || '';
  v.classList.add('view-enter');
  window.scrollTo({ top: 0 });
  revealInit();
  $$('#view [data-count]').forEach(el => countUp(el, +el.dataset.count, el.dataset.prefix || '', el.dataset.suffix || ''));
}
window.addEventListener('hashchange', render);

/* ================= nav & footer ================= */
function cartCount() { return cartOf().items.reduce((s, i) => s + i.qty, 0); }
function renderNav() {
  const u = me(), s = mySeller();
  $('#nav').innerHTML = `<div class="nav"><div class="nav-inner">
    <a class="logo" href="#/"><span class="logo-badge"><svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0d2b4e"/><path d="M36 8 L18 38 h11 L27 56 L46 26 h-11 Z" fill="#2ad3b5"/></svg></span>VoltHub</a>
    <nav class="nav-links">
      <a href="#/search">Shop parts</a><a href="#/sellers">Sellers</a><a href="#/sell">Sell on VoltHub</a>
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
    <a href="#/sell" onclick="closeModal()">Sell on VoltHub</a>
    ${s ? '<a href="#/dashboard" onclick="closeModal()">Seller dashboard</a>' : ''}
    ${u && u.role === 'admin' ? '<a href="#/admin" onclick="closeModal()">Admin</a>' : ''}
    <a href="#/orders" onclick="closeModal()">My orders</a><a href="#/account" onclick="closeModal()">My account</a>
    ${u ? '<button onclick="closeModal();logout()">Sign out</button>' : '<button onclick="closeModal();openAuth()">Sign in</button>'}
  </div></div>`);
}
function renderFooter() {
  $('#footer').innerHTML = `<div class="footer"><div class="footer-inner">
    <div><div class="logo" style="color:#fff"><span class="logo-badge"><svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2ad3b5"/><path d="M36 8 L18 38 h11 L27 56 L46 26 h-11 Z" fill="#0d2b4e"/></svg></span>VoltHub</div>
      <p style="font-size:.84rem;margin-top:.6rem;max-width:270px">The parts market that knows your bike. Verified sellers, fitment-first search, buyer protection.</p>
      <form class="news-input" onsubmit="event.preventDefault();toast('<b>Subscribed!</b> (demo — no emails sent)');this.reset()">
        <input placeholder="Email for drop alerts" type="email" required><button class="btn btn-aqua btn-sm" type="submit">Join</button></form></div>
    <div><h5>Marketplace</h5><a href="#/search">All parts</a><a href="#/search?cat=batteries">Batteries</a><a href="#/search?cat=motors">Motors</a><a href="#/search?cond=used">Used parts</a><a href="#/sellers">Seller directory</a></div>
    <div><h5>Sell</h5><a href="#/sell">Become a seller</a><a href="#/legal/prohibited">Prohibited items</a><a href="#/dashboard">Seller dashboard</a></div>
    <div><h5>Trust & legal</h5><a href="#/legal/refunds">Buyer protection</a><a href="#/legal/tos">Terms of Service</a><a href="#/legal/privacy">Privacy</a><a href="#/legal/prohibited">Battery shipping rules</a></div>
    <div class="fine"><span>© 2026 VoltHub — demo build. Simulated data; no real payments, sellers or inventory.</span><span>Sold by independent sellers · VoltHub is a marketplace venue</span></div>
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
  toast(fresh ? `<b>Welcome to VoltHub,</b> ${esc(u.name.split(' ')[0])}!` : `<b>Signed in</b> as ${esc(u.name)}`);
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
      <div class="p-meta">${esc(s.name)} · ${stars(r.avg)} <span>(${r.count})</span></div>
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
function viewHome() {
  const pop = [...visibleProducts()].sort((a, b) => b.sold - a.sold).slice(0, 8);
  const fresh = [...visibleProducts()].sort((a, b) => b.ts - a.ts).slice(0, 4);
  const tops = [...DB.sellers].filter(s => s.status === 'active').map(s => ({ s, r: ratingOf(s.id) })).sort((a, b) => b.r.avg - a.r.avg || b.r.count - a.r.count).slice(0, 4);
  const recent = DB.recent.map(productById).filter(p => p && p.qty > 0 && sellerActive(p.sellerId)).slice(0, 4);
  return `
  <div class="hero"><div class="hero-blob b1"></div><div class="hero-blob b2"></div>
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
      <div class="grid grid-cats">${CATS.map(c => `<div class="cat-tile reveal" onclick="go('#/search?cat=${c.id}')"><div class="ic">${icon(c.icon)}</div><b>${c.name}</b><small>${c.blurb}</small></div>`).join('')}</div></section>
    <section class="section"><div class="section-head reveal"><div><h2>Shop by bike</h2><p>Parts filtered to what actually fits</p></div></div>
      <div class="hero-chips" style="justify-content:flex-start">${BIKES.map(b => `<button class="chip reveal" onclick="go('#/bike/${b.id}')">${b.brand} ${b.model}</button>`).join('')}</div></section>
    <section class="section"><div class="band reveal"><h2>Turn your parts bin into a storefront.</h2>
      <p>Your own shop at <b>yourname.volthub.example</b>, discount codes, dashboards and payouts — we take 10% only when you sell.</p>
      <div class="stats"><div><b data-count="${DB.products.reduce((s, p) => s + p.sold, 0)}"></b><span>parts sold</span></div><div><b data-count="${DB.reviews.length}"></b><span>verified reviews</span></div><div><b>10%</b><span>flat fee, listing is free</span></div></div>
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
    <div class="s-head"><div class="s-logo" style="background:${s.color}">${esc(s.name.split(' ').map(w => w[0]).join('').slice(0, 2))}</div>
      <div><div class="s-name">${esc(s.name)} ${s.verified ? `<span class="badge badge-verified">${icon('check')} Verified</span>` : ''}</div>
      <div class="rating-line">${stars(r.avg)} ${r.avg ? r.avg.toFixed(1) : '—'} · ${r.count} reviews</div></div></div>
    <div class="s-tag">${esc(s.tagline)}</div>
    <div style="font-size:.75rem;color:var(--ink3)">${DB.products.filter(p => p.sellerId === s.id && p.qty > 0).length} items · joined ${timeAgo(s.joined)}</div></div>`;
}

/* ---------- search ---------- */
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
  const setF = (k, v) => { const p = new URLSearchParams(); Object.entries({ ...f, [k]: v }).forEach(([a, b]) => b && p.set(a, b)); return `go('#/search?${p.toString().replace(/'/g, '')}')`; };
  const pills = [];
  if (f.q) pills.push(['q', `“${esc(f.q)}”`]); if (f.cat) pills.push(['cat', catById(f.cat)?.name]);
  if (f.cond) pills.push(['cond', condName(f.cond)]); if (f.bike) { const b = bikeById(f.bike); pills.push(['bike', b ? b.brand + ' ' + b.model : '']); }
  if (f.seller) { const s = sellerById(f.seller); if (s) pills.push(['seller', s.name]); }
  return `<div class="wrap"><div class="page-head"><h1>Shop parts</h1><p>Fitment-checked listings from verified sellers.</p></div>
  <div class="browse">
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
      <div class="results-head"><span class="count"><b>${list.length}</b> parts found</span>
        <div class="sort">Sort <select onchange="(function(v){const p=new URLSearchParams(location.hash.split('?')[1]||'');p.set('sort',v);go('#/search?'+p)})(this.value)">
          ${[['relevance', 'Relevance'], ['selling', 'Best selling'], ['new', 'Newest'], ['low', 'Price: low → high'], ['high', 'Price: high → low']].map(([v, n]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
      ${list.length ? `<div class="grid grid-products">${list.map(pCard).join('')}</div>` : `<div class="empty"><div class="big">🔍</div><b>No parts match those filters.</b><p>Try clearing the bike or condition filter.</p></div>`}
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
  return `<div class="wrap">
  <div class="crumb"><a href="#/">Home</a> / <a href="#/search?cat=${p.cat}">${catById(p.cat)?.name}</a> / ${esc(p.title.slice(0, 40))}…</div>
  <div class="pd">
    <div class="pd-gallery reveal in">${productArt(p)}</div>
    <div class="pd-info">
      <div style="display:flex;gap:.5rem;align-items:center"><span class="badge badge-${p.cond}">${condName(p.cond)}</span>
        ${p.sold > 20 ? '<span class="badge badge-navy">🔥 Best seller</span>' : ''}${p.qty <= 2 ? `<span class="badge badge-warn">Only ${p.qty} left</span>` : ''}</div>
      <h1>${esc(p.title)}</h1>
      <div class="rating-line">${stars(r.avg)} <b>${r.avg ? r.avg.toFixed(1) : '—'}</b> seller rating (${r.count}) · ${p.sold} sold · ${p.views} views</div>
      <div style="margin-top: .9rem"><span class="pd-price">${money(p.price)}</span>
        <div class="pd-ship-line">${p.ship ? `+ ${money(p.ship)} shipping` : '✅ Free shipping'} · ships from ${esc(s.name)}</div></div>
      ${suspended ? `<div class="notice">This seller is currently suspended — item unavailable.</div>` : `
      <div class="pd-buy">
        <div class="qty"><button onclick="pdQty(-1,${p.qty})">−</button><span id="pdq">1</span><button onclick="pdQty(1,${p.qty})">+</button></div>
        <button class="btn btn-primary btn-lg" style="flex:1" onclick="addToCart('${p.id}', +$('#pdq').textContent)">${icon('cart')} Add to cart</button>
        <button class="btn btn-outline ${wished ? 'on' : ''}" onclick="toggleWish('${p.id}')" aria-label="Watchlist">${icon('heart')}</button>
      </div>`}
      <div class="seller-box" onclick="go('#/s/${s.slug}')">
        <div class="s-logo" style="background:${s.color};width:44px;height:44px;font-size:.9rem">${esc(s.name.split(' ').map(w => w[0]).join('').slice(0, 2))}</div>
        <div style="flex:1"><div class="s-name">${esc(s.name)} ${s.verified ? `<span class="badge badge-verified">${icon('check')} Verified</span>` : ''}</div>
          <div class="rating-line">${stars(r.avg)} ${r.count} reviews · ${timeAgo(s.joined).replace(' ago', '')} on VoltHub</div></div>
        <span class="see-all">Visit shop →</span></div>
      <h3 style="margin:1.1rem 0 .2rem;font-size:1rem">Specs</h3>
      <table class="spec-table">${Object.entries(p.specs).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      <h3 style="margin:1rem 0 .2rem;font-size:1rem">Fits</h3>
      <div class="fit-chips">${p.universal ? '<span class="badge badge-verified">✓ Universal fit</span>' : ''}
        ${p.fits.map(id => { const b = bikeById(id); return b ? `<span class="chip" onclick="go('#/bike/${b.id}')">${b.brand} ${b.model}</span>` : ''; }).join('')}
        ${!p.universal && !p.fits.length ? '<span style="font-size:.85rem;color:var(--ink3)">Fitment not specified — ask the seller.</span>' : ''}</div>
      <p style="margin-top:1rem;color:var(--ink2);font-size:.93rem">${esc(p.desc)}</p>
      ${p.cat === 'batteries' ? `<div class="notice">🔋 Lithium battery: ships ground per DOT rules. Certification: <b>${esc(p.specs['Certification'] || 'not declared')}</b>. <a href="#/legal/prohibited">Battery policy</a></div>` : ''}
      <div class="protect">${icon('shield')}<div><b>VoltHub Buyer Protection.</b> Payment held by the platform, released to the seller on fulfillment. Not as described? <a href="#/legal/refunds">Open a dispute</a> within 48h of delivery.</div></div>
    </div></div>
  ${similar.length ? `<section class="section"><div class="section-head"><h2>Similar parts</h2></div><div class="grid grid-products">${similar.map(pCard).join('')}</div></section>` : ''}
  </div>`;
}
function pdQty(d, max) { const el = $('#pdq'); el.textContent = Math.max(1, Math.min(max, +el.textContent + d)); }

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
  return `<div class="wrap">
    <div style="padding-top:1.3rem"><div class="store-banner" style="background:${s.color}">
      <div style="position:absolute;inset:0;background:radial-gradient(circle at 80% 20%,rgba(255,255,255,.25),transparent 55%)"></div></div></div>
    <div class="store-head">
      <div class="store-logo" style="background:${s.color}">${esc(s.name.split(' ').map(w => w[0]).join('').slice(0, 2))}</div>
      <div style="flex:1;padding-bottom:.4rem"><h1 style="font-size:1.5rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">${esc(s.name)} ${s.verified ? `<span class="badge badge-verified">${icon('check')} Verified seller</span>` : ''}</h1>
        <div class="rating-line">${stars(r.avg)} <b>${r.avg ? r.avg.toFixed(1) : 'New'}</b> (${r.count} reviews) · ${items.length} items · joined ${timeAgo(s.joined)}</div>
        <div style="font-size:.82rem;color:var(--ink3);margin-top:.15rem">🌐 ${s.slug}.volthub.example <span style="opacity:.6">(seller subdomains — live in the real build)</span></div></div>
      <div style="padding-bottom:.4rem"><button class="btn btn-danger btn-sm" onclick="openReport('${s.id}')">${icon('flag')} Report seller</button></div></div>
    ${codes.length ? `<div class="code-banner">🎟️ <b>Shop codes:</b> ${codes.map(c => `<button class="code-tag" onclick="navigator.clipboard&&navigator.clipboard.writeText('${c.code}');toast('<b>${c.code}</b> copied — paste it at checkout.')">${c.code}</button> <span style="color:var(--ink3)">${c.type === 'percent' ? c.value + '% off' : money(c.value) + ' off'}${c.min ? ' over ' + money(c.min) : ''}</span>`).join(' · ')}</div>` : ''}
    <div class="tabs">
      <button class="${tab === 'items' ? 'active' : ''}" onclick="go('#/s/${s.slug}?tab=items')">Items (${items.length})</button>
      <button class="${tab === 'reviews' ? 'active' : ''}" onclick="go('#/s/${s.slug}?tab=reviews')">Reviews (${reviews.length})</button>
      <button class="${tab === 'about' ? 'active' : ''}" onclick="go('#/s/${s.slug}?tab=about')">About</button></div>
    ${tab === 'items' ? `
      ${best.length > 1 ? `<div class="section-head"><h2 style="font-size:1.1rem">⭐ Shop best sellers</h2></div><div class="grid grid-products" style="margin-bottom:1.6rem">${best.map(pCard).join('')}</div>` : ''}
      <div class="section-head"><h2 style="font-size:1.1rem">All items</h2></div>
      ${items.length ? `<div class="grid grid-products">${items.map(pCard).join('')}</div>` : '<div class="empty">No items listed right now.</div>'}` : ''}
    ${tab === 'reviews' ? (reviews.length ? reviews.map(rv => { const u = userById(rv.buyerId); return `<div class="review"><div class="review-head"><span class="avatar">${esc((u?.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2))}</span><b style="font-size:.9rem">${esc(u?.name || 'Buyer')}</b> ${stars(rv.rating)} <small>· verified purchase · ${timeAgo(rv.ts)}</small></div><p>${esc(rv.body)}</p></div>`; }).join('') : '<div class="empty">No reviews yet.</div>') : ''}
    ${tab === 'about' ? `<div class="panel" style="max-width:640px"><p style="color:var(--ink2)">${esc(s.bio)}</p><p style="margin-top:.8rem;font-size:.83rem;color:var(--ink3)">All sales run through VoltHub checkout with buyer protection. Payouts to sellers via Stripe. <a href="#/legal/refunds">How protection works</a></p></div>` : ''}
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
    <div class="hint">Reports go to VoltHub's trust team. False reports violate our terms.</div></div>
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
  return `<div class="wrap">
  <div class="hero" style="border:none;background:none"><div class="hero-inner" style="padding:3rem 0 1.6rem">
    <span class="hero-eyebrow"><span class="dot"></span> Now onboarding e-motive sellers</span>
    <h1>Your parts bin is<br><em>a business.</em></h1>
    <p class="sub">Get a verified storefront on your own VoltHub subdomain, run discount codes, and reach riders searching by their exact bike.</p></div></div>
  <div class="step-cards reveal">
    <div class="step-card"><div class="num">1</div><b>Apply in 2 minutes</b><p>Tell us what you sell. We review every application — that's why buyers trust the marketplace.</p></div>
    <div class="step-card"><div class="num">2</div><b>Verify & connect payouts</b><p>Stripe identity check + bank connection. You're the merchant; we handle checkout and protection.</p></div>
    <div class="step-card"><div class="num">3</div><b>List & sell</b><p>Photos, specs, fitment tags, your own codes. Listing is free — we take 10% only when you sell.</p></div></div>
  <section class="section"><div class="browse" style="grid-template-columns:1fr 1fr;align-items:stretch">
    <div class="fee-calc reveal"><h3 style="margin-bottom:.3rem">What you'd keep</h3><p style="font-size:.85rem;color:var(--ink3)">Drag your monthly parts sales:</p>
      <input type="range" min="100" max="10000" value="1500" step="100" oninput="feeCalc(this.value)">
      <div class="fee-out"><span>Monthly sales</span><b id="fc-gross">$1,500</b></div>
      <div class="fee-out"><span>VoltHub fee (10%)</span><b id="fc-fee">−$150</b></div>
      <div class="fee-out" style="border-top:1.5px solid var(--line);padding-top:.5rem"><span>You keep</span><b id="fc-net" style="color:var(--aqua-deep)">$1,350</b></div>
      <p style="font-size:.75rem;color:var(--ink3);margin-top:.6rem">Payment processing included. No listing fees, no monthly fees.</p></div>
    <div class="accordion reveal">${[
      ['Who can sell?', 'Individuals and shops, 18+. We review every application for inventory quality and honesty — takeoff parts, used gear and rebuilt components are all welcome if graded honestly.'],
      ['How do payouts work?', 'Through Stripe Connect. Money from each sale (minus the 10% fee) transfers to your bank on a rolling schedule after fulfillment.'],
      ['Can I sell batteries?', 'Yes, with rules: UN38.3 documentation, declared certification status, ground shipping. Read the battery policy before applying.'],
      ['What about scam protection?', 'Cuts both ways. Buyers get dispute mediation; sellers with tracking and honest photos win not-as-described claims. Repeat bad actors get suspended.'],
      ['Do I really get my own subdomain?', 'Yes — yourshop.volthub.example (simulated in this demo, real wildcard domains in production). Your storefront, your branding, your codes.'],
    ].map(([q2, a]) => `<div class="acc-item"><button onclick="this.parentElement.classList.toggle('open')">${q2}<span class="chev">⌄</span></button><div class="acc-body"><div>${a}</div></div></div>`).join('')}</div>
  </div></section>
  <section class="section" style="max-width:560px;margin:0 auto">
    <div class="panel reveal" id="apply">
      <h2 style="margin-bottom:.3rem">Apply to sell</h2>
      ${!u ? `<p style="color:var(--ink3);font-size:.9rem;margin-bottom:1rem">Sign in first — takes one click with a demo account.</p><button class="btn btn-primary" onclick="openAuth()">Sign in to apply</button>`
      : mySeller() ? `<p style="color:var(--ink3);font-size:.9rem">You already run <b>${esc(mySeller().name)}</b>. <a href="#/dashboard">Go to your dashboard →</a></p>`
      : app ? `<div class="notice">⏳ Your application for <b>${esc(app.shop)}</b> is under review.</div>
        <button class="btn btn-aqua" onclick="demoApprove('${app.id}')">⚡ Demo shortcut: approve it instantly</button>
        <p style="font-size:.75rem;color:var(--ink3);margin-top:.5rem">In production this is an admin review + Stripe identity/payout onboarding.</p>`
      : `<form class="form" onsubmit="event.preventDefault();applySeller(this)">
        <div class="form-row"><div class="field"><label>Shop name</label><input name="shop" required placeholder="Volt Garage" maxlength="30"></div>
        <div class="field"><label>Shop URL</label><input name="slug" required pattern="[a-z0-9](-?[a-z0-9])*" placeholder="volt-garage" maxlength="24"><div class="hint">yourname.volthub.example</div></div></div>
        <div class="field"><label>What do you sell?</label><textarea name="pitch" required placeholder="Inventory, experience, links to past sales…"></textarea></div>
        <label class="check-line"><input type="checkbox" required> I've read the <a href="#/legal/prohibited">Prohibited Items policy</a> (especially batteries) and agree to the <a href="#/legal/tos">Seller Terms</a>.</label>
        <div id="apply-err"></div>
        <button class="btn btn-primary btn-lg">Submit application</button></form>`}
    </div></section></div>`;
}
function feeCalc(v) {
  $('#fc-gross').textContent = '$' + (+v).toLocaleString();
  $('#fc-fee').textContent = '−$' + Math.round(v * .10).toLocaleString();
  $('#fc-net').textContent = '$' + Math.round(v * .90).toLocaleString();
}
function applySeller(f) {
  const slug = f.slug.value.toLowerCase();
  if (DB.sellers.some(s => s.slug === slug) || ['www', 'app', 'api', 'admin', 'shop'].includes(slug)) { $('#apply-err').innerHTML = '<div class="form-err">That shop URL is taken or reserved.</div>'; return; }
  DB.applications.push({ id: uid('a'), userId: me().id, shop: f.shop.value, slug, pitch: f.pitch.value, status: 'pending', ts: Date.now() });
  save(); render(); toast('<b>Application submitted!</b> Watch for the demo-approve shortcut.');
}
function demoApprove(appId) { approveApplication(appId, true); go('#/dashboard'); }
function approveApplication(appId, self = false) {
  const a = DB.applications.find(x => x.id === appId); if (!a || a.status !== 'pending') return;
  a.status = 'approved'; a.decidedTs = Date.now();
  const u = userById(a.userId);
  const colors = Object.values(SELLER_COLORS);
  const s = { id: uid('s'), userId: u.id, slug: a.slug, name: a.shop, color: colors[Math.floor(Math.random() * colors.length)], tagline: 'New on VoltHub — say hi!', bio: a.pitch, status: 'active', joined: Date.now(), verified: true };
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
    <div style="flex:1"><b>${esc(i.title)}</b><small>${money(i.price)} · ${esc(sellerById(i.p.sellerId).name)}</small>
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
      <div class="cart-group-head"><div class="s-logo" style="background:${s.color};width:34px;height:34px;font-size:.75rem;border-radius:9px">${esc(s.name.split(' ').map(w => w[0]).join('').slice(0, 2))}</div>
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
    <div class="browse" style="grid-template-columns:1fr 340px">
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
  <div class="browse" style="grid-template-columns:1fr 380px">
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
      <p style="font-size:.75rem;color:var(--ink3)">By paying you agree to the <a href="#/legal/tos">Terms</a> and <a href="#/legal/refunds">Refund Policy</a>. Sold by independent sellers; VoltHub processes payment.</p>
    </form>
    <div class="panel" style="position:sticky;top:84px;height:fit-content"><h3 style="margin-bottom:.6rem">Order summary</h3>
      <div class="totals">${lines}<div class="row total"><span>Total</span><span>${money(grand)}</span></div></div>
      <div class="protect" style="margin-top:.9rem">${icon('shield')}<div>Funds are held by VoltHub and released to sellers per-shipment. Disputes within 48h of delivery.</div></div></div>
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
    ${orders.map(o => `<div class="cart-group"><div class="cart-group-head"><b>${esc(sellerById(o.sellerId).name)}</b><span class="badge badge-verified" style="margin-left:auto">Paid</span></div>
      ${o.items.map(i => `<div class="cart-line" style="border:none;padding:.35rem 0"><span style="flex:1;font-size:.9rem">${i.qty}× ${esc(i.title)}</span><b>${money(i.price * i.qty)}</b></div>`).join('')}
      <div class="totals">${o.discount ? `<div class="row disc"><span>Discount</span><span>−${money(o.discount)}</span></div>` : ''}<div class="row"><span>Seller receives (after 10% fee)</span><span>${money(o.total - o.fee)}</span></div></div></div>`).join('')}
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
    <div class="cart-group-head"><b>${esc(s.name)}</b><span style="color:var(--ink3);font-size:.78rem">· ${timeAgo(o.ts)}</span>
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
    <p style="font-size:.78rem;color:var(--ink3)">VoltHub mediates within 3 business days. If found in your favor, refund goes to your original payment method.</p>
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
  <div class="browse" style="grid-template-columns:320px 1fr">
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
  const rev = myO.filter(o => ['paid', 'shipped', 'delivered'].includes(o.status)).reduce((t, o) => t + o.total - o.fee, 0);
  const r = ratingOf(s.id);
  const tabs = [['overview', 'Overview'], ['products', `Products (${myP.length})`], ['codes', `Codes (${myC.length})`], ['orders', `Orders (${myO.length})`], ['settings', 'Settings']];
  return `<div class="wrap"><div class="page-head" style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
    <div class="s-logo" style="background:${s.color};width:54px;height:54px">${esc(s.name.split(' ').map(w => w[0]).join('').slice(0, 2))}</div>
    <div style="flex:1"><h1 style="font-size:1.4rem">${esc(s.name)}</h1><p>${s.slug}.volthub.example · <a href="#/s/${s.slug}">view public storefront →</a></p></div>
    ${s.status === 'suspended' ? '<span class="badge badge-danger">SUSPENDED</span>' : '<span class="badge badge-verified">Active · payouts on</span>'}</div>
  <div class="side-tabs">${tabs.map(([v, n]) => `<button class="${tab === v ? 'active' : ''}" onclick="go('#/dashboard?tab=${v}')">${n}</button>`).join('')}</div>
  ${tab === 'overview' ? `
    <div class="stat-grid">
      <div class="stat"><b data-count="${Math.round(rev / 100)}" data-prefix="$"></b><span>Net revenue (after 10% fee)</span></div>
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
        <td><button class="btn btn-ghost btn-sm" onclick="toggleCode('${c.id}')">${c.active ? 'Disable' : 'Enable'}</button></td></tr>`; }).join('') || '<tr><td colspan="6" style="color:var(--ink3)">No codes yet — codes show on your storefront banner.</td></tr>'}</table></div>` : ''}
  ${tab === 'orders' ? `<div class="panel tbl-wrap">${myO.length ? sellerOrderRows(myO) : '<p style="color:var(--ink3)">No orders yet.</p>'}</div>` : ''}
  ${tab === 'settings' ? `<div class="panel" style="max-width:560px"><form class="form" onsubmit="event.preventDefault();saveShop(this)">
    <div class="field"><label>Shop name</label><input name="name" value="${esc(s.name)}" required></div>
    <div class="field"><label>Tagline</label><input name="tagline" value="${esc(s.tagline)}" maxlength="80"></div>
    <div class="field"><label>About</label><textarea name="bio">${esc(s.bio)}</textarea></div>
    <div class="field"><label>Shop URL</label><input value="${s.slug}.volthub.example" disabled><div class="hint">Subdomain is locked after approval (production: wildcard DNS under our domain).</div></div>
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
  modal(`${modalHead('Mark shipped')}<div class="modal-body"><form class="form" onsubmit="event.preventDefault();doShip(this,'${oid}')">
    <div class="form-row"><div class="field"><label>Carrier</label><select name="carrier"><option>USPS</option><option>UPS</option><option>FedEx</option></select></div>
    <div class="field"><label>Tracking number</label><input name="tn" required placeholder="9400 1000 …"></div></div>
    <button class="btn btn-primary">Confirm shipment</button><p style="font-size:.75rem;color:var(--ink3)">Buyer gets notified; payout releases on fulfillment.</p></form></div>`);
}
function doShip(f, oid) {
  const o = DB.orders.find(x => x.id === oid);
  o.status = 'shipped'; o.shippedTs = Date.now(); o.tracking = f.carrier.value + ' ' + f.tn.value;
  save(); closeModal(); render(); toast('<b>Shipped ✓</b> Buyer notified (demo).');
}
function saveShop(f) { const s = mySeller(); s.name = f.name.value; s.tagline = f.tagline.value; s.bio = f.bio.value; save(); render(); toast('Shop settings saved.'); }

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
    <div class="field"><label>Photo URL <span style="font-weight:400;color:var(--ink3)">(optional — we generate clean part art if empty)</span></label><input name="img" value="${p && p.img ? esc(p.img) : ''}" placeholder="https://…jpg"></div>
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
}
function saveProduct(f, pid) {
  const s = mySeller();
  const specs = {};
  for (let i = 0; i < 4; i++) { const k = f['sk' + i]?.value.trim(), v = f['sv' + i]?.value.trim(); if (k && v) specs[k] = v; }
  const fits = BIKES.filter(b => f['fit_' + b.id]?.checked).map(b => b.id);
  const base = {
    title: f.title.value, cat: f.cat.value, cond: f.cond.value, brand: f.brand.value || '—',
    price: Math.round(parseFloat(f.price.value) * 100), ship: Math.round(parseFloat(f.ship.value) * 100),
    qty: parseInt(f.qty.value), universal: f.universal.checked, fits, specs, desc: f.desc.value, img: f.img.value.trim() || null,
  };
  if (pid) Object.assign(productById(pid), base);
  else DB.products.push({ id: uid('p'), sellerId: s.id, sold: 0, views: 0, ts: Date.now(), ...base });
  save(); closeModal(); render(); toast(pid ? 'Listing updated.' : '<b>Listing live!</b> It\'s now searchable market-wide.');
}
function delProduct(pid) { if (!confirm('Remove this listing?')) return; DB.products = DB.products.filter(p => p.id !== pid); save(); render(); toast('Listing removed.'); }
function openCodeForm() {
  modal(`${modalHead('New discount code')}<div class="modal-body"><form class="form" onsubmit="event.preventDefault();saveCode(this)">
    <div class="form-row"><div class="field"><label>Code</label><input name="code" required maxlength="16" placeholder="SUMMER10" style="text-transform:uppercase"></div>
    <div class="field"><label>Type</label><select name="type"><option value="percent">% off</option><option value="fixed">$ off</option></select></div></div>
    <div class="form-row"><div class="field"><label>Value</label><input name="value" type="number" min="1" required placeholder="10"></div>
    <div class="field"><label>Min order ($, optional)</label><input name="min" type="number" min="0" value="0"></div></div>
    <div class="field"><label>Max uses (blank = unlimited)</label><input name="max" type="number" min="1"></div>
    <button class="btn btn-primary">Create code</button><p style="font-size:.75rem;color:var(--ink3)">Live codes show on your storefront banner automatically.</p></form></div>`);
}
function saveCode(f) {
  const s = mySeller(); const type = f.type.value;
  const value = type === 'percent' ? Math.min(100, +f.value.value) : Math.round(parseFloat(f.value.value) * 100);
  DB.codes.push({ id: uid('c'), sellerId: s.id, code: f.code.value.toUpperCase(), type, value, min: Math.round((+f.min.value || 0) * 100), max: f.max.value ? +f.max.value : null, uses: 0, expires: null, active: true });
  save(); closeModal(); render(); toast(`<b>${f.code.value.toUpperCase()}</b> is live on your storefront.`);
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
    ${apps.map(a => `<tr><td><b>${esc(a.shop)}</b><br><span style="font-size:.75rem;color:var(--ink3)">${a.slug}.volthub.example</span></td>
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
function rejectApp(id) { const a = DB.applications.find(x => x.id === id); a.status = 'rejected'; save(); render(); toast('Application rejected.'); }
function resolveReport(id, status) {
  const r = DB.reports.find(x => x.id === id); r.status = status; r.resolvedTs = Date.now();
  r.resolution = status === 'resolved' ? 'Handled by trust team (demo).' : 'Reviewed — no policy violation found.';
  save(); render(); toast('Report ' + status + '.');
}
function suspendSeller(id) {
  if (!confirm('Suspend this seller? Their storefront and all listings go dark immediately.')) return;
  sellerById(id).status = 'suspended'; save(); render(); toast('<b>Seller suspended.</b> Listings hidden market-wide.', 'err');
}
function unsuspendSeller(id) { sellerById(id).status = 'active'; save(); render(); toast('Seller reinstated.'); }

/* ---------- legal ---------- */
function viewLegal(seg) {
  const page = LEGAL[seg[1]] || LEGAL.tos;
  return `<div class="wrap"><div class="legal-page"><div class="page-head"><h1>${page.title}</h1><p>VoltHub demo · last updated July 2026</p></div>
    <div class="panel">${page.body}</div>
    <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem">${Object.entries(LEGAL).map(([k, v]) => `<a class="chip" href="#/legal/${k}">${v.title}</a>`).join('')}</div></div></div>`;
}
function notFound() { return `<div class="wrap"><div class="empty"><div class="big">🤷</div><b>That page doesn't exist.</b><p><a href="#/">Back home →</a></p></div></div>`; }

/* ================= boot ================= */
render();
