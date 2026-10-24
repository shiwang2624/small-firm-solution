'use strict';

// ---------------- DOM helpers ----------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------- formatting ----------------
function money(v, symbol) {
  const s = symbol || (Store.data && Store.data.profile.currency) || '₹';
  const n = Number(v || 0);
  return s + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function qty(v) {
  const n = Number(v || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
function pct(v) { return qty(v) + '%'; }
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function today() { return new Date().toISOString().slice(0, 10); }
function monthStart(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return d.toISOString().slice(0, 10);
}
function inRange(iso, from, to) {
  return (!from || iso >= from) && (!to || iso <= to);
}

// ---------------- ids ----------------
function nextId(list) { return (list || []).reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1; }

// ---------------- toast ----------------
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', !!isError);
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2800);
}

// ---------------- modal ----------------
// openModal({ title, sub, body, width, actions:[{label,kind,onClick}], onMount })
function openModal(opts) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const box = el('div', { class: 'modal' + (opts.width ? ' ' + opts.width : '') });
  if (opts.title) box.appendChild(el('h2', { text: opts.title }));
  if (opts.sub) box.appendChild(el('p', { class: 'modal-sub', text: opts.sub }));

  const bodyWrap = el('div', { class: 'modal-body' });
  if (typeof opts.body === 'string') bodyWrap.innerHTML = opts.body;
  else if (opts.body) bodyWrap.appendChild(opts.body);
  box.appendChild(bodyWrap);

  if (opts.actions && opts.actions.length) {
    const bar = el('div', { class: 'modal-actions' });
    opts.actions.forEach((a) => {
      const b = el('button', { class: 'btn ' + (a.kind || '') });
      if (a.icon && typeof iconSvg === 'function') {
        const ic = document.createElement('span');
        ic.innerHTML = iconSvg(a.icon, 15);
        b.appendChild(ic.firstChild);
      }
      b.appendChild(document.createTextNode(a.label));
      if (a.spacer) b.classList.add('spacer');
      b.addEventListener('click', () => a.onClick && a.onClick(close));
      bar.appendChild(b);
    });
    box.appendChild(bar);
  }

  backdrop.appendChild(box);
  $('#modal-root').appendChild(backdrop);

  function close() { backdrop.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  document.addEventListener('keydown', onKey);

  const first = box.querySelector('input, select, textarea, button');
  if (first) setTimeout(() => first.focus(), 30);

  if (opts.onMount) opts.onMount(box, close);
  return { close, box };
}

function confirmDialog(message, confirmLabel = 'Delete') {
  return new Promise((resolve) => {
    openModal({
      title: 'Please confirm',
      sub: message,
      width: 'narrow',
      actions: [
        { label: 'Cancel', onClick: (close) => { close(); resolve(false); } },
        { label: confirmLabel, kind: 'danger', onClick: (close) => { close(); resolve(true); } }
      ]
    });
  });
}

// ---------------- misc ----------------
function debounce(fn, ms = 300) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function emptyState(icon, title, text, ctaLabel, ctaFn) {
  const box = el('div', { class: 'empty' });
  const big = el('div', { class: 'big' });
  if (typeof hasIcon === 'function' && hasIcon(icon)) big.innerHTML = iconSvg(icon, 34);
  else big.textContent = icon;
  box.appendChild(big);
  box.appendChild(el('h3', { text: title }));
  box.appendChild(el('p', { text: text }));
  if (ctaLabel) {
    const b = el('button', { class: 'btn primary', text: ctaLabel });
    b.addEventListener('click', ctaFn);
    box.appendChild(b);
  }
  return box;
}

// ---------------- popup menu (anchored dropdown) ----------------
function openMenu(anchor, entries) {
  const menu = el('div', { class: 'popmenu' });
  entries.forEach((e) => {
    if (e.sep) { menu.appendChild(el('div', { class: 'popmenu-sep' })); return; }
    const b = el('button', { class: 'popmenu-item' });
    if (e.icon && typeof iconEl === 'function') b.appendChild(iconEl(e.icon, 14));
    b.appendChild(el('span', { text: e.label }));
    b.onclick = () => { close(); setTimeout(e.run, 10); };
    menu.appendChild(b);
  });
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.min(window.innerHeight - 12 - menu.offsetHeight, r.bottom + 6) + 'px';
  menu.style.left = Math.max(8, Math.min(window.innerWidth - 12 - menu.offsetWidth, r.right - menu.offsetWidth)) + 'px';
  function close() {
    menu.remove();
    document.removeEventListener('mousedown', onDoc);
    document.removeEventListener('keydown', onKey);
  }
  function onDoc(ev) { if (!menu.contains(ev.target)) close(); }
  function onKey(ev) { if (ev.key === 'Escape') close(); }
  setTimeout(() => { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); }, 0);
  return { close };
}
