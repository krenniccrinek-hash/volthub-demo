/* VoltHub demo — UI helpers: icons, part art, toasts, modals, motion */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const timeAgo = (ts) => {
  const d = Math.floor((Date.now() - ts) / 864e5);
  if (d < 1) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return d + ' days ago';
  if (d < 365) return Math.floor(d / 30) + ' mo ago';
  return Math.floor(d / 365) + ' yr ago';
};
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);

/* ---------- icons (stroke, 24 viewBox) ---------- */
const IC = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  cart: '<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.4 11.2A1.6 1.6 0 0 0 9 16.5h8.2a1.6 1.6 0 0 0 1.57-1.28L20.6 8H6"/>',
  heart: '<path d="M12 20.3 4.7 13a4.6 4.6 0 1 1 6.5-6.5l.8.8.8-.8A4.6 4.6 0 0 1 19.3 13Z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  shield: '<path d="M12 3 5 6v5c0 4.6 3 8.4 7 10 4-1.6 7-5.4 7-10V6Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  bolt: '<path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H13L13 3Z"/>',
  truck: '<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9Z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  battery: '<rect x="3" y="8" width="15" height="9" rx="2"/><path d="M21 11v3"/><path d="m11.2 9.5-2 3h2.6l-2 3"/>',
  motor: '<circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.3"/><path d="M12 3.5v2.4M12 18.1v2.4M3.5 12h2.4M18.1 12h2.4M6 6l1.7 1.7M16.3 16.3 18 18M18 6l-1.7 1.7M7.7 16.3 6 18"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="1.6"/><rect x="10.2" y="10.2" width="3.6" height="3.6"/><path d="M9.5 4v3M14.5 4v3M9.5 17v3M14.5 17v3M4 9.5h3M4 14.5h3M17 9.5h3M17 14.5h3"/>',
  display: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M12 16v3M8.5 19h7"/>',
  brake: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="6.4" r=".9"/><circle cx="17.6" cy="12" r=".9"/><circle cx="12" cy="17.6" r=".9"/><circle cx="6.4" cy="12" r=".9"/>',
  gear: '<circle cx="12" cy="12" r="3.4"/><path d="M12 3.8v2.4M12 17.8v2.4M3.8 12h2.4M17.8 12h2.4M6.2 6.2l1.7 1.7M16.1 16.1l1.7 1.7M17.8 6.2l-1.7 1.7M7.9 16.1l-1.7 1.7"/>',
  wheel: '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="1.8"/><path d="M12 3.8v6.4M12 13.8v6.4M4.9 8l5.5 3.1M13.6 12.9l5.5 3.1M19.1 8l-5.5 3.1M10.4 12.9 4.9 16"/>',
  fork: '<path d="M8 21V9M16 21V9"/><path d="M8 9a4 4 0 0 1 8 0"/><path d="M12 5V3"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  plug: '<rect x="7" y="9" width="10" height="8" rx="2"/><path d="M10 9V5M14 9V5M12 17v2.5a2 2 0 0 1-2 2"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/><circle cx="12" cy="15.5" r="1.3"/>',
  wrench: '<path d="M14.5 6.5a4.2 4.2 0 0 0-5.7 5L4 16.3 7.7 20l4.8-4.8a4.2 4.2 0 0 0 5-5.7L14.8 12 12 9.2Z"/>',
};
const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;

/* ---------- product art (SVG tiles; unique gradient ids per instance) ---------- */
const CAT_TINT = {
  batteries: ['#d9f7ef', '#bfe9f0', '#0ea48a'], motors: ['#dcebfa', '#c3dcf5', '#2f7ed8'],
  controllers: ['#e3f0fa', '#cfe0f2', '#123a6b'], displays: ['#e0f2f8', '#c8e6f2', '#155e75'],
  brakes: ['#e8eef4', '#d2dde8', '#42566d'], drivetrain: ['#dff4ee', '#c5e8dd', '#0ea48a'],
  wheels: ['#e4eefa', '#cddff2', '#2f7ed8'], suspension: ['#e6f0f6', '#cfe2ee', '#155e75'],
  lights: ['#fdf6e3', '#f4e6c0', '#a8700f'], chargers: ['#def5f0', '#c2e9e0', '#0ea48a'],
  security: ['#e9edf2', '#d4dce6', '#2a3441'], accessories: ['#e3f2f0', '#cbe7e3', '#0d2b4e'],
};
let _artN = 0;
function partArt(cat) {
  const c = CATS.find(x => x.id === cat) || CATS[11];
  const [t1, t2, ink] = CAT_TINT[c.id] || CAT_TINT.accessories;
  const g = 'g' + (++_artN) + '_' + c.id;
  const ic = IC[c.icon] || IC.wrench;
  return `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(c.name)}">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t1}"/><stop offset="1" stop-color="${t2}"/></linearGradient></defs>
    <rect width="400" height="300" fill="url(#${g})"/>
    <circle cx="330" cy="40" r="130" fill="#ffffff" opacity=".28"/>
    <g transform="translate(255,150) scale(9)" stroke="${ink}" opacity=".1" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ic}</g>
    <g transform="translate(155,105)"><rect width="90" height="90" rx="24" fill="#ffffff" opacity=".92"/>
      <g transform="translate(21,21) scale(2)" stroke="${ink}" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ic}</g></g>
    <text x="20" y="278" font-family="Sora,Inter,sans-serif" font-size="13" font-weight="700" fill="${ink}" opacity=".45">VoltHub · ${esc(c.name)}</text>
  </svg>`;
}
function productArt(p) {
  if (p.img) return `<img src="${esc(p.img)}" alt="${esc(p.title)}" loading="lazy" onerror="this.outerHTML=partArt('${p.cat}')">`;
  return partArt(p.cat);
}

/* ---------- stars ---------- */
function stars(r) {
  const f = Math.round(r);
  return `<span class="stars" aria-label="${r} out of 5">${'★'.repeat(f)}${'☆'.repeat(5 - f)}</span>`;
}

/* ---------- toasts ---------- */
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .4s, transform .4s'; t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; }, 3200);
  setTimeout(() => t.remove(), 3700);
}

/* ---------- modal ---------- */
function modal(html, lg = false) {
  $('#modal-root').innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)closeModal()"><div class="modal${lg ? ' modal-lg' : ''}">${html}</div></div>`;
  document.body.style.overflow = 'hidden';
}
function closeModal() { $('#modal-root').innerHTML = ''; document.body.style.overflow = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDrawer(); } });
const modalHead = (title) => `<div class="modal-head"><h3>${title}</h3><button class="modal-x" onclick="closeModal()">${icon('x')}</button></div>`;

/* ---------- drawer ---------- */
function openDrawer() { $('#drawer').classList.add('open'); $('#drawer-overlay').classList.add('open'); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer-overlay').classList.remove('open'); }

/* ---------- motion ---------- */
let _obs;
function revealInit() {
  if (!_obs) _obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); _obs.unobserve(e.target); } }), { threshold: .08 });
  $$('.reveal').forEach(el => _obs.observe(el));
}
function countUp(el, target, prefix = '', suffix = '') {
  const dur = 900, t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), v = Math.round(target * (1 - Math.pow(1 - k, 3)));
    el.textContent = prefix + v.toLocaleString() + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* nav scroll shadow */
window.addEventListener('scroll', () => { const n = $('.nav'); if (n) n.classList.toggle('scrolled', scrollY > 8); }, { passive: true });
