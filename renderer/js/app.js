'use strict';

// ============================================================ navigation model
// Grouped, expandable sidebar navigation (Sale ⌄ → Invoices, Estimates, …)
const NAV = [
  { id: 'home', label: 'Home', icon: 'home', items: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'transactions', label: 'All Transactions' }
  ] },
  { id: 'sale', label: 'Sale', icon: 'invoice', add: 'invoice', items: [
    ...SALES_TYPES.map((t) => ({ id: 'doc:' + t, label: DOC_TYPES[t].plural })),
    { id: 'pos', label: 'Point of Sale' }
  ] },
  { id: 'purchase', label: 'Purchase & Expense', icon: 'cart', add: 'purchase_bill', items: [
    ...PURCHASE_TYPES.map((t) => ({ id: 'doc:' + t, label: DOC_TYPES[t].plural })),
    { id: 'expenses', label: 'Expenses' }
  ] },
  { id: 'cash', label: 'Cash & Bank', icon: 'wallet', add: 'payments-in', items: [
    { id: 'payments-in', label: 'Payments In' },
    { id: 'payments-out', label: 'Payments Out' },
    { id: 'income', label: 'Other Income' },
    { id: 'banking', label: 'Bank & Cash' }
  ] },
  { id: 'items', label: 'Items', icon: 'box', add: 'item', items: [
    { id: 'items', label: 'All Items' },
    { id: 'categories', label: 'Categories' }
  ] },
  { id: 'parties', label: 'Parties', icon: 'users', add: 'party', items: [
    { id: 'parties', label: 'All Parties' }
  ] },
  { id: 'reports', label: 'Reports', icon: 'chart', items: [
    { id: 'reports', label: 'All Reports' },
    ...REPORTS.map((r) => ({ id: 'report:' + r.id, label: r.title }))
  ] },
  { id: 'utilities', label: 'Utilities', icon: 'clipboard', items: [
    { id: 'utilities', label: 'All Utilities' },
    { id: 'barcode-print', label: 'Barcode printing' },
    { id: 'cheques', label: 'Cheques' },
    { id: 'data-tools', label: 'Import & Export' }
  ] },
  { id: 'setup', label: 'Settings', icon: 'settings', items: [
    { id: 'settings', label: 'Business Settings' },
    { id: 'firms', label: 'Firms' },
    { id: 'backup', label: 'Backup & Restore' }
  ] }
];

const openGroups = new Set(['home']);

function groupOf(route) {
  return NAV.find((g) => g.items.some((i) => i.id === route)) || null;
}

// ============================================================ router
window.Views.go = function (route) {
  window.Views.current = route;
  const g = groupOf(route);
  if (g) openGroups.add(g.id);
  render();
};
window.Views.refreshChrome = function () { renderChrome(); };

const ROUTE_TITLES = {
  dashboard: 'Dashboard', transactions: 'All Transactions',
  'payments-in': 'Payments In', 'payments-out': 'Payments Out',
  expenses: 'Expenses', income: 'Other Income', banking: 'Bank & Cash',
  items: 'Items', categories: 'Categories', parties: 'Parties',
  reports: 'Reports', settings: 'Business Settings', firms: 'Firms', backup: 'Backup & Restore',
  utilities: 'Utilities', 'barcode-print': 'Barcode printing', cheques: 'Cheques', 'data-tools': 'Import & Export'
};

function routeTitle(route) {
  if (route.startsWith('doc:')) return DOC_TYPES[route.slice(4)].plural;
  if (route.startsWith('report:')) {
    const r = REPORTS.find((x) => x.id === route.slice(7));
    return r ? r.title : 'Report';
  }
  return ROUTE_TITLES[route] || 'Small Firm';
}

// dashed route ids → camelCase view functions
const ROUTE_VIEWS = {
  'payments-in': 'payments',
  'payments-out': 'payments',
  'barcode-print': 'barcodePrint',
  'data-tools': 'dataTools'
};

function resolveView(route) {
  if (route.startsWith('doc:')) return window.Views.docList(route.slice(4));
  if (route.startsWith('report:')) return window.Views.report(route.slice(7));
  if (route === 'payments-in') return window.Views.payments('in');
  if (route === 'payments-out') return window.Views.payments('out');
  const mapped = ROUTE_VIEWS[route];
  if (mapped && window.Views[mapped]) return window.Views[mapped];
  return window.Views[route] || window.Views.dashboard;
}

function render() {
  const route = window.Views.current || 'dashboard';
  renderChrome();
  const view = $('#view');
  $('#view-title').textContent = routeTitle(route);
  view.innerHTML = '';
  $('#view-sub').textContent = '';
  $('#topbar-actions').innerHTML = '';
  resolveView(route)(view, $('#topbar-actions'), $('#view-sub'));
}

// ============================================================ sidebar
function navCount(route) {
  if (!Store.data) return null;
  if (route.startsWith('doc:')) return Store.data.docs.filter((d) => d.type === route.slice(4)).length || null;
  if (route === 'parties') return Store.data.parties.length || null;
  if (route === 'items') return Store.data.items.length || null;
  if (route === 'payments-in') return Store.data.payments.filter((p) => p.dir === 'in').length || null;
  if (route === 'payments-out') return Store.data.payments.filter((p) => p.dir === 'out').length || null;
  if (route === 'expenses') return Store.data.expenses.length || null;
  if (route === 'categories') return Store.data.categories.length || null;
  return null;
}

function quickAdd(kind) {
  if (kind === 'invoice') return window.Views.newDoc('invoice');
  if (kind === 'purchase_bill') return window.Views.newDoc('purchase_bill');
  if (kind === 'payments-in') return window.Views.paymentEditor(null, 'in');
  if (kind === 'item') return window.Views.itemEditor(null);
  if (kind === 'party') return window.Views.partyEditor(null);
  window.Views.newDocMenu();
}

function buildNav() {
  const nav = $('#nav');
  const route = window.Views.current || 'dashboard';
  nav.innerHTML = '';
  NAV.forEach((g) => {
    const isOpen = openGroups.has(g.id);
    const row = el('button', { class: 'nav-group-row' + (isOpen ? ' open' : '') });
    row.appendChild(iconEl(g.icon, 17));
    row.appendChild(el('span', { class: 'label', text: g.label }));
    if (g.add) {
      const add = el('span', { class: 'add', title: 'Add new' });
      add.innerHTML = iconSvg('plus', 12);
      add.addEventListener('click', (e) => { e.stopPropagation(); quickAdd(g.add); });
      row.appendChild(add);
    }
    row.appendChild(el('span', { class: 'chev', text: '›' }));
    row.addEventListener('click', () => {
      if (openGroups.has(g.id)) openGroups.delete(g.id); else openGroups.add(g.id);
      buildNav();
    });
    nav.appendChild(row);

    if (isOpen) {
      const sub = el('div', { class: 'nav-sub' });
      g.items.forEach((it) => {
        const b = el('button', { class: 'nav-sub-item' + (it.id === route ? ' active' : '') });
        b.appendChild(el('span', { text: it.label }));
        const c = navCount(it.id);
        if (c) b.appendChild(el('span', { class: 'count', text: String(c) }));
        b.addEventListener('click', () => window.Views.go(it.id));
        sub.appendChild(b);
      });
      nav.appendChild(sub);
    }
  });
}

function renderChrome() {
  if (!Store.data) return;
  const name = Store.data.profile.name || 'My Business';
  $('#firm-picker-label').textContent = Store.firm ? Store.firm.name : name;
  $('#firm-avatar').textContent = (Store.firm ? Store.firm.name : name).trim().charAt(0).toUpperCase() || 'S';
  buildNav();
  // promo card: quick backup nudge
  $('#promo-title').textContent = Store.data.docs.length + ' documents saved';
  $('#promo-sub').textContent = 'Back up all firms to a file';
}

// ============================================================ firm picker
function openFirmPicker() {
  const body = el('div');
  Store.firms.forEach((f) => {
    const row = el('button', { class: 'btn block', style: 'justify-content:space-between;margin-bottom:6px' });
    row.appendChild(el('span', { text: f.name }));
    row.appendChild(el('span', { class: 'badge' + (Store.firm && f.id === Store.firm.id ? ' info' : ''), text: Store.firm && f.id === Store.firm.id ? 'current' : 'switch' }));
    row.onclick = async () => {
      if (!Store.firm || f.id !== Store.firm.id) { await Store.switchFirm(f.id); toast('Switched to ' + f.name); }
      m.close(); renderChrome(); window.Views.go('dashboard');
    };
    body.appendChild(row);
  });
  const manage = el('button', { class: 'btn ghost block', text: 'Manage firms…' });
  manage.onclick = () => { m.close(); window.Views.go('firms'); };
  body.appendChild(manage);
  const m = openModal({ title: 'Switch firm', width: 'narrow', body, actions: [{ label: 'Close', onClick: (c) => c() }] });
}

// ============================================================ new menu
window.Views.newDocMenu = function () {
  const body = el('div');
  const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' });
  const entries = [
    ...SALES_TYPES.map((t) => [DOC_TYPES[t].icon, 'New ' + DOC_TYPES[t].label, () => window.Views.newDoc(t)]),
    ...PURCHASE_TYPES.map((t) => [DOC_TYPES[t].icon, 'New ' + DOC_TYPES[t].label, () => window.Views.newDoc(t)]),
    ['⬇️', 'Payment In', () => window.Views.paymentEditor(null, 'in')],
    ['⬆️', 'Payment Out', () => window.Views.paymentEditor(null, 'out')],
    ['💸', 'Expense', () => window.Views.expenseEditor(null)],
    ['💰', 'Other Income', () => window.Views.incomeEditor(null)],
    ['👥', 'New Party', () => window.Views.partyEditor(null)],
    ['📦', 'New Item', () => window.Views.itemEditor(null)]
  ];
  entries.forEach(([ic, label, fn]) => {
    const b = el('button', { class: 'btn', style: 'justify-content:flex-start' });
    b.appendChild(el('span', { text: ic }));
    b.appendChild(el('span', { text: label }));
    b.onclick = () => { m.close(); setTimeout(fn, 10); };
    grid.appendChild(b);
  });
  body.appendChild(grid);
  const m = openModal({ title: 'Create new', sub: 'What would you like to add?', width: 'narrow', body });
};

// ============================================================ command palette
function openPalette() {
  const wrap = el('div', { class: 'palette-backdrop' });
  const box = el('div', { class: 'palette' });
  const input = el('input', { placeholder: 'Search parties, items, documents, payments — or jump to a page…' });
  const results = el('div', { class: 'palette-results' });
  box.appendChild(input); box.appendChild(results);
  wrap.appendChild(box);
  $('#palette-root').appendChild(wrap);

  function close() { wrap.remove(); document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  document.addEventListener('keydown', onKey);

  function items(q) {
    const out = [];
    const query = (q || '').toLowerCase();
    NAV.forEach((g) => g.items.forEach((it) => out.push({ group: 'Go to', label: it.label, meta: g.label, run: () => window.Views.go(it.id) })));
    Store.data.parties.forEach((p) => out.push({ group: 'Parties', label: p.name, meta: p.phone || p.type, run: () => window.Views.ledger(p.id) }));
    Store.data.items.forEach((i) => out.push({ group: 'Items', label: i.name, meta: 'stock ' + qty(Store.stockOf(i.id)), run: () => window.Views.itemEditor(i) }));
    Store.data.docs.forEach((d) => out.push({ group: 'Documents', label: d.number + ' · ' + (d.partyName || ''), meta: DOC_TYPES[d.type].label, run: () => window.Views.viewDoc(d.id) }));
    Store.data.payments.forEach((p) => out.push({ group: 'Payments', label: (p.dir === 'in' ? 'In from ' : 'Out to ') + p.partyName, meta: money(p.amount), run: () => window.Views.paymentEditor(p) }));
    return out.filter((x) => !query || (x.label + ' ' + x.meta).toLowerCase().includes(query)).slice(0, 40);
  }

  let sel = 0, list = [];
  function draw() {
    list = items(input.value);
    sel = Math.min(sel, Math.max(0, list.length - 1));
    results.innerHTML = '';
    let last = null;
    list.forEach((it, idx) => {
      if (it.group !== last) { results.appendChild(el('div', { class: 'palette-group', text: it.group })); last = it.group; }
      const row = el('div', { class: 'palette-item' + (idx === sel ? ' sel' : '') });
      row.appendChild(el('span', { text: it.label }));
      row.appendChild(el('span', { class: 'meta', text: it.meta || '' }));
      row.onclick = () => { close(); setTimeout(it.run, 10); };
      results.appendChild(row);
    });
  }
  input.oninput = () => { sel = 0; draw(); };
  input.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, list.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { const it = list[sel]; if (it) { close(); setTimeout(it.run, 10); } }
  };
  draw();
  setTimeout(() => input.focus(), 30);
}

// ============================================================ keyboard
const NAV_ORDER = NAV.flatMap((g) => g.items.map((i) => i.id));
function bindKeys() {
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'k' || k === 'f') { e.preventDefault(); openPalette(); }
    else if (k === 'n') { e.preventDefault(); window.Views.newDocMenu(); }
    else if (k === 'p') {
      const open = Store.data.docs.slice().sort((a, b) => b.id - a.id)[0];
      if (open) { e.preventDefault(); window.Views.exportDocPdf(open); }
    } else if (/^[1-9]$/.test(e.key)) {
      const idx = Number(e.key) - 1;
      if (NAV_ORDER[idx]) { e.preventDefault(); window.Views.go(NAV_ORDER[idx]); }
    }
  });
}

// ============================================================ boot
async function boot() {
  await Store.boot();
  DOC_TYPES.invoice.prefix = Store.data.profile.invoicePrefix || 'INV';
  DOC_TYPES.purchase_bill.prefix = Store.data.profile.purchasePrefix || 'PUR';
  DOC_TYPES.estimate.prefix = Store.data.profile.estimatePrefix || 'EST';

  window.Views.current = 'dashboard';
  buildNav();
  bindKeys();

  const fillIcon = (sel, name, size) => { const n = $(sel); if (n) n.innerHTML = iconSvg(name, size); };
  fillIcon('#sb-search-ico', 'search', 14);
  fillIcon('#tb-search-ico', 'search', 15);
  fillIcon('#tb-more', 'more', 16);
  $('#tb-sale').innerHTML = iconSvg('plus', 15) + '<span>Add Sale</span>';
  $('#tb-purchase').innerHTML = iconSvg('plus', 15) + '<span>Add Purchase</span>';
  $('#tb-plus').innerHTML = iconSvg('plus', 15);

  $('#sb-search').addEventListener('focus', (e) => { e.target.blur(); openPalette(); });
  $('#tb-search').addEventListener('focus', (e) => { e.target.blur(); openPalette(); });
  $('#strip-search').onclick = openPalette;
  $('#help-link').onclick = () => window.Views.help();
  const openLegal = (p) => { try { window.open(p, '_blank', 'noopener'); } catch (e) { location.href = p; } };
  const lt = $('#legal-terms'); if (lt) lt.onclick = () => openLegal('legal/terms.html');
  const lp = $('#legal-privacy'); if (lp) lp.onclick = () => openLegal('legal/privacy.html');
  $('#tb-sale').onclick = () => window.Views.newDoc('invoice');
  $('#tb-purchase').onclick = () => window.Views.newDoc('purchase_bill');
  $('#tb-plus').onclick = () => window.Views.newDocMenu();
  $('#tb-more').onclick = () => window.Views.newDocMenu();
  $('#firm-picker').onclick = openFirmPicker;
  $('#promo-btn').onclick = async () => {
    try { const p = await window.api.backupExport(); if (p) toast('Backup saved: ' + p); }
    catch (e) { toast('Backup failed: ' + e.message, true); }
  };

  render();
}

window.addEventListener('DOMContentLoaded', boot);
