'use strict';
window.Views = window.Views || {};

// ============================================================ Dashboard
window.Views.dashboard = function (view, actions, sub) {
  sub.textContent = 'Your business at a glance';
  let range = 'month';

  function bounds() {
    if (range === 'month') return { from: monthStart(0), to: today() };
    if (range === 'last') return { from: monthStart(-1), to: today() };
    if (range === 'year') return { from: new Date().getFullYear() + '-01-01', to: today() };
    return { from: '', to: '' };
  }

  function draw() {
    const { from, to } = bounds();
    const k = Store.kpis(from, to);
    const cf = Store.cashflow(from, to);
    const low = Store.lowStockItems();

    actions.innerHTML = '';
    actions.appendChild(el('button', { class: 'btn primary', text: '＋ New Invoice', onclick: () => window.Views.newDoc('invoice') }));

    view.innerHTML = '';
    const pills = el('div', { class: 'pill-row', style: 'margin-bottom:16px' });
    [['month', 'This month'], ['last', 'Last month'], ['year', 'This year'], ['all', 'All time']].forEach(([key, label]) => {
      const b = el('button', { class: 'pill' + (range === key ? ' active' : ''), text: label });
      b.onclick = () => { range = key; draw(); };
      pills.appendChild(b);
    });
    view.appendChild(pills);

    const cards = el('div', { class: 'cards' });
    const card = (icon, value, label, cls) => {
      const c = el('div', { class: 'card ' + (cls || '') });
      const g = el('div', { class: 'glyph' });
      g.appendChild(iconEl(icon, 17));
      c.appendChild(g);
      c.appendChild(el('div', { class: 'value', text: value }));
      c.appendChild(el('div', { class: 'label', text: label }));
      return c;
    };
    cards.appendChild(card('coins', money(k.revenue), 'Sales'));
    cards.appendChild(card('cart', money(k.cost), 'Purchases'));
    cards.appendChild(card('wallet', money(k.expenseTotal), 'Expenses'));
    cards.appendChild(card('chart', money(k.profit), 'Profit', k.profit >= 0 ? 'good' : 'bad'));
    cards.appendChild(card('arrowDown', money(Store.totalReceivable()), 'You’ll get'));
    cards.appendChild(card('arrowUp', money(Store.totalPayable()), 'You’ll pay'));
    view.appendChild(cards);

    const grid = el('div', { class: 'grid-2' });

    // Quick actions
    const quick = el('div', { class: 'panel' });
    quick.appendChild(el('div', { class: 'panel-head' }, [el('h2', { text: 'Quick actions' })]));
    const qb = el('div', { class: 'panel-body' });
    const quickBtns = [
      ['invoice', 'New Invoice', () => window.Views.newDoc('invoice')],
      ['invoice', 'New Estimate', () => window.Views.newDoc('estimate')],
      ['cart', 'Purchase Bill', () => window.Views.newDoc('purchase_bill')],
      ['wallet', 'Record Expense', () => window.Views.expenseEditor(null)],
      ['arrowDown', 'Payment In', () => window.Views.paymentEditor(null, 'in')],
      ['users', 'Add Party', () => window.Views.partyEditor(null)],
      ['box', 'Add Item', () => window.Views.itemEditor(null)],
      ['card', 'Bank & Cash', () => window.Views.go('banking')]
    ];
    const qwrap = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' });
    quickBtns.forEach(([ic, label, fn]) => {
      const b = el('button', { class: 'btn', style: 'justify-content:flex-start' });
      b.appendChild(iconEl(ic, 15));
      b.appendChild(el('span', { text: label }));
      b.onclick = fn;
      qwrap.appendChild(b);
    });
    qb.appendChild(qwrap);
    quick.appendChild(qb);
    grid.appendChild(quick);

    // Cashflow + alerts
    const right = el('div', { class: 'panel' });
    right.appendChild(el('div', { class: 'panel-head' }, [el('h2', { text: 'Cash flow & alerts' })]));
    const rb = el('div', { class: 'panel-body' });
    rb.innerHTML = `
      <div class="stat-line"><span>Money in</span><span class="muted">${money(cf.inflow)}</span></div>
      <div class="stat-line"><span>Money out</span><span class="muted">${money(cf.outflow)}</span></div>
      <div class="stat-line"><span><strong>Net</strong></span><span><strong>${money(cf.net)}</strong></span></div>
      <div class="stat-line"><span>GST payable (output−input)</span><span>${money(Math.max(0, k.taxOut - k.taxIn))}</span></div>
      <div class="stat-line"><span>Stock value</span><span>${money(Store.stockValue())}</span></div>`;
    if (low.length) {
      const alert = el('div', { class: 'empty', style: 'margin-top:12px;text-align:left;padding:14px' });
      alert.innerHTML = `<strong>⚠️ ${low.length} item(s) low on stock</strong><div class="muted" style="margin-top:4px">${low.slice(0, 4).map((i) => esc(i.name) + ' (' + qty(Store.stockOf(i.id)) + ')').join(', ')}${low.length > 4 ? '…' : ''}</div>`;
      const b = el('button', { class: 'btn sm', text: 'View items', style: 'margin-top:8px' });
      b.onclick = () => window.Views.go('items');
      alert.appendChild(b);
      rb.appendChild(alert);
    }
    right.appendChild(rb);
    grid.appendChild(right);
    view.appendChild(grid);

    // Recent documents
    const recent = Store.data.docs.slice().sort((a, b) => b.id - a.id).slice(0, 6);
    const panel = el('div', { class: 'panel', style: 'margin-top:16px' });
    panel.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: 'Recent documents' }),
      (() => { const b = el('button', { class: 'btn sm', text: 'View all' }); b.onclick = () => window.Views.go('transactions'); return b; })()
    ]));
    const pb = el('div', { class: 'panel-body' });
    if (!recent.length) pb.appendChild(emptyState('📄', 'No documents yet', 'Create your first invoice or purchase bill.', 'New Invoice', () => window.Views.newDoc('invoice')));
    else {
      const wrap = el('div', { class: 'table-wrap', style: 'box-shadow:none;max-height:none' });
      wrap.innerHTML = `<table class="data"><thead><tr><th>Type</th><th>Number</th><th>Party</th><th>Date</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>
        ${recent.map((d) => `<tr class="doc-row" data-id="${d.id}" style="cursor:pointer">
          <td>${esc(DOC_TYPES[d.type].label)}</td><td>${esc(d.number)}</td><td>${esc(d.partyName)}</td>
          <td>${fmtDate(d.date)}</td><td><span class="badge ${Store.docStatus(d)}">${Store.docStatus(d)}</span></td>
          <td class="num">${money(Store.docTotal(d))}</td></tr>`).join('')}
      </tbody></table>`;
      pb.appendChild(wrap);
      $$('.doc-row', wrap).forEach((r) => (r.onclick = () => window.Views.viewDoc(Number(r.dataset.id))));
    }
    panel.appendChild(pb);
    view.appendChild(panel);
  }

  draw();
};

// ============================================================ Transactions
window.Views.transactions = function (view, actions, sub) {
  sub.textContent = 'Every document, payment and expense in one place';
  let filter = 'all', query = '';

  function rows() {
    const out = [];
    Store.data.docs.forEach((d) => out.push({
      date: d.date, kind: DOC_TYPES[d.type].label, group: DOC_TYPES[d.type].group,
      ref: d.number, party: d.partyName, status: DOC_TYPES[d.type].posting ? Store.docStatus(d) : (d.status || 'open'),
      total: DOC_TYPES[d.type].posting ? Store.docTotal(d) : 0, doc: d
    }));
    Store.data.payments.forEach((p) => out.push({
      date: p.date, kind: p.dir === 'in' ? 'Payment In' : 'Payment Out', group: 'money',
      ref: p.mode || '—', party: p.partyName, status: '', total: Number(p.amount || 0), pay: p
    }));
    Store.data.expenses.forEach((e) => out.push({
      date: e.date, kind: 'Expense', group: 'money', ref: e.category, party: '', status: '', total: -Number(e.amount || 0), exp: e
    }));
    Store.data.otherIncome.forEach((o) => out.push({
      date: o.date, kind: 'Other Income', group: 'money', ref: o.source || '', party: '', status: '', total: Number(o.amount || 0), inc: o
    }));
    return out
      .filter((r) => filter === 'all' || r.group === filter)
      .filter((r) => !query || (r.ref + ' ' + r.party + ' ' + r.kind).toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  function draw() {
    actions.innerHTML = '';
    const addBtn = el('button', { class: 'btn', text: '＋ New Document' });
    addBtn.onclick = () => window.Views.newDocMenu();
    actions.appendChild(addBtn);

    view.innerHTML = '';
    const bar = el('div', { class: 'toolbar' });
    ['all', 'sales', 'purchase', 'money'].forEach((f) => {
      const b = el('button', { class: 'pill' + (filter === f ? ' active' : ''), text: f[0].toUpperCase() + f.slice(1) });
      b.onclick = () => { filter = f; draw(); };
      bar.appendChild(b);
    });
    const inp = el('input', { placeholder: 'Search…', value: query, style: 'max-width:260px' });
    inp.oninput = debounce(() => { query = inp.value; draw(); }, 250);
    bar.appendChild(el('div', { class: 'grow' }));
    bar.appendChild(inp);
    view.appendChild(bar);

    const list = rows();
    if (!list.length) { view.appendChild(emptyState('🗂️', 'Nothing here yet', 'Documents, payments and expenses will appear here.')); return; }
    const wrap = el('div', { class: 'table-wrap' });
    wrap.innerHTML = `<table class="data"><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Party</th><th>Status</th><th class="num">Amount</th></tr></thead>
      <tbody>${list.map((r) => `<tr class="tx-row" data-date="${r.date}">
        <td class="nowrap">${fmtDate(r.date)}</td><td>${esc(r.kind)}</td><td>${esc(r.ref)}</td><td>${esc(r.party || '—')}</td>
        <td>${r.status ? `<span class="badge ${r.status}">${r.status}</span>` : ''}</td>
        <td class="num">${money(r.total)}</td></tr>`).join('')}</tbody></table>`;
    view.appendChild(wrap);

    $$('.tx-row', wrap).forEach((tr, i) => {
      tr.onclick = () => {
        const r = list[i];
        if (r.doc) window.Views.viewDoc(r.doc.id);
        else if (r.pay) window.Views.paymentEditor(r.pay);
        else if (r.exp) window.Views.expenseEditor(r.exp);
        else if (r.inc) window.Views.incomeEditor(r.inc);
      };
      tr.style.cursor = 'pointer';
    });
  }
  draw();
};

// ============================================================ Parties
window.Views.parties = function (view, actions, sub) {
  sub.textContent = 'Customers and suppliers with balances';
  let query = '', tab = 'all';

  function draw() {
    actions.innerHTML = '';
    const b = el('button', { class: 'btn primary', text: '＋ Add Party' });
    b.onclick = () => window.Views.partyEditor(null);
    actions.appendChild(b);

    view.innerHTML = '';
    const bar = el('div', { class: 'toolbar' });
    [['all', 'All'], ['customer', 'Customers'], ['supplier', 'Suppliers']].forEach(([k, label]) => {
      const p = el('button', { class: 'pill' + (tab === k ? ' active' : ''), text: label });
      p.onclick = () => { tab = k; draw(); };
      bar.appendChild(p);
    });
    const inp = el('input', { placeholder: 'Search name / phone / GSTIN…', value: query, style: 'max-width:300px' });
    inp.oninput = debounce(() => { query = inp.value; draw(); }, 250);
    bar.appendChild(el('div', { class: 'grow' }));
    bar.appendChild(inp);
    view.appendChild(bar);

    const list = Store.data.parties
      .filter((p) => tab === 'all' || p.type === tab)
      .filter((p) => !query || (p.name + ' ' + (p.phone || '') + ' ' + (p.gstin || '')).toLowerCase().includes(query.toLowerCase()));

    if (!list.length) {
      view.appendChild(emptyState('👥', 'No parties yet', 'Add customers and suppliers to start invoicing.', 'Add Party', () => window.Views.partyEditor(null)));
      return;
    }
    const wrap = el('div', { class: 'table-wrap' });
    wrap.innerHTML = `<table class="data"><thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>GSTIN</th><th class="num">You’ll get</th><th class="num">You’ll pay</th><th></th></tr></thead><tbody>
      ${list.map((p) => {
        const s = Store.partySummary(p.id);
        const typeBadge = p.type === 'supplier' ? '<span class="badge info">supplier</span>' : '<span class="badge">customer</span>';
        return `<tr>
          <td><span class="link" data-ledger="${p.id}">${esc(p.name)}</span></td>
          <td>${typeBadge}</td><td>${esc(p.phone || '—')}</td><td>${esc(p.gstin || '—')}</td>
          <td class="num">${s.receivable > 0 ? money(s.receivable) : '—'}</td>
          <td class="num">${s.payable > 0 ? money(s.payable) : '—'}</td>
          <td><div class="row-actions">
            <button class="btn sm" data-ledger2="${p.id}">Ledger</button>
            <button class="btn sm" data-edit="${p.id}">Edit</button>
            <button class="btn sm danger" data-del="${p.id}">Delete</button>
          </div></td></tr>`;
      }).join('')}
    </tbody></table>`;
    view.appendChild(wrap);

    $$('[data-ledger],[data-ledger2]', wrap).forEach((n) => (n.onclick = () => window.Views.ledger(Number(n.dataset.ledger || n.dataset.ledger2))));
    $$('[data-edit]', wrap).forEach((n) => (n.onclick = () => window.Views.partyEditor(Store.party(Number(n.dataset.edit)))));
    $$('[data-del]', wrap).forEach((n) => (n.onclick = async () => {
      const p = Store.party(Number(n.dataset.del));
      if (await confirmDialog(`Delete ${p.name}? Their documents will be kept.`)) { await Store.deleteParty(p.id); toast('Party deleted'); draw(); }
    }));
  }
  draw();
};

window.Views.ledger = function (partyId) {
  const p = Store.party(partyId);
  if (!p) return;
  const rows = [];
  if (Number(p.opening || 0)) rows.push({ date: '—', kind: 'Opening balance', ref: '', amount: Number(p.opening), status: '' });
  for (const d of Store.postedDocs()) {
    if (d.partyId !== partyId) continue;
    const posting = DOC_TYPES[d.type].posting;
    const sign = (posting === 'sale' || posting === 'purchase') ? 1 : -1;
    rows.push({ date: d.date, kind: DOC_TYPES[d.type].label, ref: d.number, amount: sign * Store.docTotal(d), status: Store.docStatus(d) });
  }
  for (const pay of Store.data.payments) {
    if (pay.partyId !== partyId) continue;
    rows.push({ date: pay.date, kind: pay.dir === 'in' ? 'Payment In' : 'Payment Out', ref: pay.mode || '', amount: -Number(pay.amount || 0) * (pay.dir === 'in' ? 1 : -1), status: '' });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let running = 0;
  const body = el('div');
  if (!rows.length) body.appendChild(emptyState('📒', 'No transactions', 'Nothing recorded for this party yet.'));
  else {
    const wrap = el('div', { class: 'table-wrap', style: 'box-shadow:none;max-height:48vh' });
    wrap.innerHTML = `<table class="data"><thead><tr><th>Date</th><th>Particulars</th><th>Reference</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead><tbody>
      ${rows.map((r) => { running += r.amount; return `<tr><td class="nowrap">${r.date === '—' ? '—' : fmtDate(r.date)}</td><td>${esc(r.kind)}</td><td>${esc(r.ref)}</td>
        <td class="num">${money(r.amount)}</td><td class="num"><strong>${money(running)}</strong></td></tr>`; }).join('')}
    </tbody></table>`;
    body.appendChild(wrap);
  }
  const s = Store.partySummary(partyId);
  openModal({
    title: p.name,
    sub: `Ledger · ${p.type} · ${s.receivable > 0 ? 'Receivable ' + money(s.receivable) : ''}${s.payable > 0 ? ' Payable ' + money(s.payable) : ''}`,
    width: 'wide',
    body,
    actions: [
      { label: 'Record payment', spacer: true, onClick: (close) => { close(); window.Views.paymentEditor(null, p.type === 'supplier' ? 'out' : 'in', p.id); } },
      { label: 'Statement PDF', icon: 'printer', onClick: () => window.Views.partyStatement(p.id) },
      { label: 'Close', kind: 'primary', onClick: (close) => close() }
    ]
  });
};

// ============================================================ party statement
window.Views.partyStatement = async function (partyId) {
  const p = Store.party(partyId);
  if (!p) return;
  const from = monthStart(-12), to = today();
  const st = Store.statementRows(partyId, from, to);
  const s = Store.data.profile;
  const rows = st.rows.map((r) => `<tr>
      <td>${fmtDate(r.date)}</td><td>${esc(r.kind)}</td><td>${esc(r.ref)}</td>
      <td class="num">${r.debit ? money(r.debit) : ''}</td>
      <td class="num">${r.credit ? money(r.credit) : ''}</td>
      <td class="num">${money(r.balance)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; }
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11.5px;color:#1F2137;margin:0}
    h1{font-size:18px;margin:0} .muted{color:#6B6F8A}
    .top{display:flex;justify-content:space-between;border-bottom:2px solid #DA3742;padding-bottom:9px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th{background:#F7F8FB;color:#6B6F8A;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;text-align:left}
    th,td{padding:6px 7px;border-bottom:1px solid #E8EAF0} td.num,th.num{text-align:right}
    .tot{display:flex;justify-content:space-between;margin-top:12px;font-weight:700}
    .foot{margin-top:22px;border-top:1px solid #E8EAF0;padding-top:8px;color:#6B6F8A;font-size:10px}
  </style></head><body>
    <div class="top">
      <div><h1>${esc(s.name)}</h1><div class="muted">${esc(s.address || '')}</div>
        <div class="muted">${esc(s.phone || '')}${s.gstin ? ' · GSTIN ' + esc(s.gstin) : ''}</div></div>
      <div style="text-align:right"><div style="font-weight:700">STATEMENT OF ACCOUNT</div>
        <div class="muted">${esc(p.name)}</div>
        <div class="muted">${fmtDate(from)} — ${fmtDate(to)}</div></div>
    </div>
    <table><thead><tr><th>Date</th><th>Particulars</th><th>Reference</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead>
      <tbody><tr><td>—</td><td>Opening balance</td><td></td><td class="num"></td><td class="num"></td><td class="num">${money(st.opening)}</td></tr>
      ${rows}</tbody></table>
    <div class="tot"><span>Closing balance</span><span>${money(st.closing)}</span></div>
    <div class="foot">Generated by Small Firm · ${fmtDate(today())}</div>
  </body></html>`;
  try {
    const path = await window.api.exportPdf({ html, filename: 'Statement-' + p.name.replace(/\s+/g, '-') + '-' + today() + '.pdf' });
    toast('Statement saved: ' + path);
  } catch (e) { toast('Could not create statement: ' + e.message, true); }
};

// ============================================================ Items
window.Views.items = function (view, actions, sub) {
  sub.textContent = 'Products and services with live stock';
  let query = '', onlyLow = false, visible = [];

  function draw() {
    actions.innerHTML = '';

    const scanBtn = el('button', { class: 'btn' });
    scanBtn.title = 'Scan a barcode with the camera';
    scanBtn.appendChild(iconEl('camera', 15));
    scanBtn.appendChild(el('span', { text: 'Camera scan' }));
    scanBtn.onclick = () => window.Views.scanCode({ onDetect: handleScannedCode });
    actions.appendChild(scanBtn);

    const labelsBtn = el('button', { class: 'btn' });
    labelsBtn.title = 'Barcode printing utility — pick items, copies and label size';
    labelsBtn.appendChild(iconEl('barcode', 15));
    labelsBtn.appendChild(el('span', { text: 'Print barcodes' }));
    labelsBtn.onclick = () => {
      window.__barcodePreselect = (visible.length ? visible : Store.data.items).map((i) => i.id);
      window.Views.go('barcode-print');
    };
    actions.appendChild(labelsBtn);

    const b = el('button', { class: 'btn primary', text: '＋ Add Item' });
    b.onclick = () => window.Views.itemEditor(null);
    actions.appendChild(b);

    view.innerHTML = '';
    const bar = el('div', { class: 'toolbar' });
    const lowPill = el('button', { class: 'pill' + (onlyLow ? ' active' : ''), text: '⚠️ Low stock only' });
    lowPill.onclick = () => { onlyLow = !onlyLow; draw(); };
    bar.appendChild(lowPill);

    const scanInp = el('input', { placeholder: '⌨️ Scan or type a code, then Enter', style: 'max-width:290px' });
    scanInp.title = 'Works with USB barcode scanners — they type the code and press Enter';
    attachScanField(scanInp, handleScannedCode);
    bar.appendChild(scanInp);
    const inp = el('input', { placeholder: 'Search items…', value: query, style: 'max-width:300px' });
    inp.oninput = debounce(() => { query = inp.value; draw(); }, 250);
    bar.appendChild(el('div', { class: 'grow' }));
    bar.appendChild(inp);
    view.appendChild(bar);

    let list = Store.data.items
      .filter((i) => !query || (i.name + ' ' + (i.hsn || '')).toLowerCase().includes(query.toLowerCase()));
    if (onlyLow) list = list.filter((i) => Number(i.lowStock || 0) > 0 && Store.stockOf(i.id) <= Number(i.lowStock));
    visible = list;

    if (!list.length) {
      view.appendChild(emptyState('📦', onlyLow ? 'Nothing low on stock' : 'No items yet', 'Add products or services you buy and sell.', 'Add Item', () => window.Views.itemEditor(null)));
      return;
    }
    const wrap = el('div', { class: 'table-wrap' });
    wrap.innerHTML = `<table class="data"><thead><tr><th>Item</th><th>Category</th><th>Unit</th><th>HSN</th><th class="num">Sale rate</th><th class="num">Tax</th><th class="num">Stock</th><th></th></tr></thead><tbody>
      ${list.map((i) => {
        const st = Store.stockOf(i.id);
        const low = Number(i.lowStock || 0) > 0 && st <= Number(i.lowStock);
        return `<tr>
          <td>${esc(i.name)}</td><td class="muted">${esc(Store.categoryName(i.categoryId))}</td><td>${esc(i.unit)}</td>
          <td class="muted">${esc(i.hsn || '—')}</td><td class="num">${money(i.saleRate)}</td><td class="num">${pct(i.taxPercent)}</td>
          <td class="num">${low ? `<span class="badge unpaid">${qty(st)}</span>` : qty(st)}</td>
          <td><div class="row-actions">
            <button class="btn sm" data-edit="${i.id}">Edit</button>
            <button class="btn sm danger" data-del="${i.id}">Delete</button></div></td></tr>`;
      }).join('')}
    </tbody></table>`;
    view.appendChild(wrap);
    $$('[data-edit]', wrap).forEach((n) => (n.onclick = () => window.Views.itemEditor(Store.item(Number(n.dataset.edit)))));
    $$('[data-del]', wrap).forEach((n) => (n.onclick = async () => {
      const it = Store.item(Number(n.dataset.del));
      if (await confirmDialog(`Delete ${it.name}?`)) { await Store.deleteItem(it.id); toast('Item deleted'); draw(); }
    }));
  }
  draw();
};

// ============================================================ Categories
window.Views.categories = function (view, actions, sub) {
  sub.textContent = 'Group your items';
  function draw() {
    actions.innerHTML = '';
    const b = el('button', { class: 'btn primary', text: '＋ Add Category' });
    b.onclick = () => window.Views.categoryEditor(null);
    actions.appendChild(b);

    view.innerHTML = '';
    if (!Store.data.categories.length) {
      view.appendChild(emptyState('🏷️', 'No categories', 'Categories help organise your items.', 'Add Category', () => window.Views.categoryEditor(null)));
      return;
    }
    const wrap = el('div', { class: 'table-wrap' });
    wrap.innerHTML = `<table class="data"><thead><tr><th>Category</th><th class="num">Items</th><th></th></tr></thead><tbody>
      ${Store.data.categories.map((c) => `<tr><td>${esc(c.name)}</td>
        <td class="num">${Store.data.items.filter((i) => i.categoryId === c.id).length}</td>
        <td><div class="row-actions"><button class="btn sm" data-e="${c.id}">Rename</button>
        <button class="btn sm danger" data-d="${c.id}">Delete</button></div></td></tr>`).join('')}
    </tbody></table>`;
    view.appendChild(wrap);
    $$('[data-e]', wrap).forEach((n) => (n.onclick = () => window.Views.categoryEditor(Store.data.categories.find((c) => c.id === Number(n.dataset.e)))));
    $$('[data-d]', wrap).forEach((n) => (n.onclick = async () => {
      if (await confirmDialog('Delete this category?')) { await Store.deleteCategory(Number(n.dataset.d)); toast('Category deleted'); draw(); }
    }));
  }
  draw();
};

window.Views.categoryEditor = function (cat) {
  const isNew = !cat;
  const c = cat ? { ...cat } : { id: 0, name: '' };
  const body = el('div');
  body.innerHTML = `<div class="field"><label>Category name</label><input id="c-name" value="${esc(c.name)}" /></div>`;
  openModal({
    title: isNew ? 'New Category' : 'Rename Category', width: 'narrow', body,
    actions: [
      { label: 'Cancel', onClick: (close) => close() },
      { label: 'Save', kind: 'primary', onClick: async (close) => {
        const name = $('#c-name', body).value.trim();
        if (!name) return toast('Name is required', true);
        await Store.upsertCategory({ id: c.id, name });
        close(); toast('Saved'); window.Views.go('categories');
      } }
    ]
  });
};
