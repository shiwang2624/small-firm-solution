'use strict';

// ---------- state ----------
let state = { settings: {}, parties: [], items: [], invoices: [] };
let currentView = 'dashboard';
let dirty = false;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------- helpers ----------
const cur = () => state.settings.currency || '₹';

function money(v) {
  const n = Number(v || 0);
  const s = n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur() + s;
}
function qty(v) {
  const n = Number(v || 0);
  return Number.isInteger(n) ? String(n) : String(n.toFixed(2));
}
function uid(list) {
  return list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
}
function lineAmount(l) { return Number(l.quantity || 0) * Number(l.rate || 0); }
function lineTax(l) { return lineAmount(l) * Number(l.taxPercent || 0) / 100; }
function invoiceSubtotal(inv) { return (inv.lines || []).reduce((s, l) => s + lineAmount(l), 0); }
function invoiceTax(inv) { return (inv.lines || []).reduce((s, l) => s + lineTax(l), 0); }
function invoiceTotal(inv) { return invoiceSubtotal(inv) + invoiceTax(inv); }

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 2600);
}

async function persist() {
  await window.api.save(state);
  dirty = false;
}

// ---------- navigation ----------
function setActiveNav() {
  $$('#nav .nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === currentView));
  const titles = { dashboard: 'Dashboard', invoices: 'Invoices', items: 'Items', parties: 'Parties', settings: 'Settings' };
  $('#view-title').textContent = titles[currentView];
  $('#brand-business').textContent = state.settings.name || 'My Business';
}

function render() {
  setActiveNav();
  const actions = $('#topbar-actions');
  actions.innerHTML = '';
  const view = $('#view');

  if (currentView === 'dashboard') renderDashboard(view);
  else if (currentView === 'invoices') renderInvoices(view, actions);
  else if (currentView === 'items') renderItems(view, actions);
  else if (currentView === 'parties') renderParties(view, actions);
  else if (currentView === 'settings') renderSettings(view);
}

// ---------- dashboard ----------
function renderDashboard(view) {
  const sales = state.invoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const tax = state.invoices.reduce((s, i) => s + invoiceTax(i), 0);
  view.innerHTML = `
    <div class="cards">
      <div class="card"><div class="glyph">💰</div><div class="value">${money(sales)}</div><div class="label">Total Sales</div></div>
      <div class="card"><div class="glyph">％</div><div class="value">${money(tax)}</div><div class="label">Tax Collected</div></div>
      <div class="card"><div class="glyph">🧾</div><div class="value">${state.invoices.length}</div><div class="label">Invoices</div></div>
      <div class="card"><div class="glyph">👥</div><div class="value">${state.parties.length}</div><div class="label">Parties</div></div>
    </div>
    <div class="section-head"><h2>Recent Invoices</h2></div>
    ${state.invoices.length ? `
    <table>
      <thead><tr><th>Number</th><th>Party</th><th>Date</th><th class="num">Total</th></tr></thead>
      <tbody>
        ${state.invoices.slice().sort((a, b) => b.id - a.id).slice(0, 8).map((inv) => `
          <tr><td>${esc(inv.number)}</td><td>${esc(inv.partyName)}</td><td>${esc(inv.date)}</td>
          <td class="num">${money(invoiceTotal(inv))}</td></tr>`).join('')}
      </tbody>
    </table>` : `<div class="empty">No invoices yet — create your first one.</div>`}
  `;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- invoices ----------
function renderInvoices(view, actions) {
  actions.innerHTML = `<button class="btn primary" id="btn-new-invoice-2">New Invoice</button>`;
  $('#btn-new-invoice-2').onclick = newInvoice;
  const sorted = state.invoices.slice().sort((a, b) => b.id - a.id);
  view.innerHTML = sorted.length ? `
    <table>
      <thead><tr><th>Number</th><th>Party</th><th>Date</th><th class="num">Subtotal</th><th class="num">Tax</th><th class="num">Total</th><th></th></tr></thead>
      <tbody>
        ${sorted.map((inv) => `
          <tr>
            <td>${esc(inv.number)}</td>
            <td>${esc(inv.partyName)}</td>
            <td>${esc(inv.date)}</td>
            <td class="num">${money(invoiceSubtotal(inv))}</td>
            <td class="num">${money(invoiceTax(inv))}</td>
            <td class="num"><strong>${money(invoiceTotal(inv))}</strong></td>
            <td>
              <div class="row-actions">
                <button class="btn subtle" data-view-inv="${inv.id}">View</button>
                <button class="btn subtle" data-edit-inv="${inv.id}">Edit</button>
                <button class="btn subtle danger" data-del-inv="${inv.id}">Delete</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>` : `<div class="empty">No invoices yet.</div>`;

  $$('[data-view-inv]', view).forEach((b) => (b.onclick = () => viewInvoice(Number(b.dataset.viewInv))));
  $$('[data-edit-inv]', view).forEach((b) => (b.onclick = () => editInvoice(Number(b.dataset.editInv))));
  $$('[data-del-inv]', view).forEach((b) => (b.onclick = async () => {
    const id = Number(b.dataset.delInv);
    if (!confirm('Delete this invoice?')) return;
    state.invoices = state.invoices.filter((i) => i.id !== id);
    await persist(); render(); toast('Invoice deleted');
  }));
}

function newInvoice() {
  const nextNum = 'INV-' + String(state.invoices.length + 1).padStart(4, '0');
  const inv = {
    id: 0,
    number: nextNum,
    date: new Date().toISOString().slice(0, 10),
    partyId: state.parties[0] ? state.parties[0].id : 0,
    partyName: state.parties[0] ? state.parties[0].name : '',
    notes: '',
    lines: []
  };
  openInvoiceEditor(inv, true);
}

function editInvoice(id) {
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv) return;
  openInvoiceEditor(JSON.parse(JSON.stringify(inv)), false);
}

function openInvoiceEditor(inv, isNew) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal">
      <h2>${isNew ? 'New Invoice' : 'Edit ' + esc(inv.number)}</h2>
      <div class="grid3">
        <div class="field"><label>Number</label><input id="f-number" value="${esc(inv.number)}" /></div>
        <div class="field"><label>Date</label><input id="f-date" type="date" value="${esc(inv.date)}" /></div>
        <div class="field"><label>Party</label>
          <select id="f-party">
            ${state.parties.map((p) => `<option value="${p.id}" ${p.id === inv.partyId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="section-head" style="margin-top:8px"><h2 style="font-size:14px">Line Items</h2>
        <div>
          <select id="add-item" style="width:auto">
            <option value="">Add item…</option>
            ${state.items.map((it) => `<option value="${it.id}">${esc(it.name)} — ${money(it.rate)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="lines"></div>
      <div class="field" style="margin-top:10px"><label>Notes</label><textarea id="f-notes" rows="2">${esc(inv.notes)}</textarea></div>
      <div class="totals" id="totals"></div>
      <div class="modal-actions">
        <button class="btn" id="m-cancel">Cancel</button>
        <button class="btn primary" id="m-save" style="width:auto">Save Invoice</button>
      </div>
    </div>`;
  $('#modal-root').appendChild(modal);

  const linesEl = $('#lines', modal);
  const totalsEl = $('#totals', modal);

  function redrawLines() {
    linesEl.innerHTML = inv.lines.length ? inv.lines.map((l, i) => `
      <div class="line-row">
        <input value="${esc(l.itemName)}" data-li="${i}" data-k="itemName" />
        <input type="number" step="1" value="${l.quantity}" data-li="${i}" data-k="quantity" />
        <input type="number" step="0.01" value="${l.rate}" data-li="${i}" data-k="rate" />
        <input type="number" step="0.01" value="${l.taxPercent}" data-li="${i}" data-k="taxPercent" />
        <div class="amt">${money(lineAmount(l) + lineTax(l))} <button class="btn subtle danger" data-rm="${i}">✕</button></div>
      </div>`).join('')
      : `<div class="empty" style="padding:14px">No line items — pick an item above.</div>`;
    $$('[data-li]', linesEl).forEach((inp) => {
      inp.oninput = () => {
        const i = Number(inp.dataset.li);
        const k = inp.dataset.k;
        inv.lines[i][k] = (k === 'itemName') ? inp.value : Number(inp.value);
      };
      inp.onchange = () => redrawLines();
    });
    $$('[data-rm]', linesEl).forEach((b) => (b.onclick = () => {
      inv.lines.splice(Number(b.dataset.rm), 1);
      redrawLines();
    }));
    totalsEl.innerHTML = `
      <div class="row"><span>Subtotal</span><span>${money(invoiceSubtotal(inv))}</span></div>
      <div class="row"><span>Tax</span><span>${money(invoiceTax(inv))}</span></div>
      <div class="row total"><span>Total</span><span>${money(invoiceTotal(inv))}</span></div>`;
  }
  redrawLines();

  $('#add-item', modal).onchange = (e) => {
    const it = state.items.find((x) => x.id === Number(e.target.value));
    if (!it) return;
    inv.lines.push({
      itemId: it.id, itemName: it.name, unit: it.unit,
      quantity: 1,
      rate: it.rate,
      taxPercent: it.taxPercent != null ? it.taxPercent : (state.settings.defaultTax || 0)
    });
    e.target.value = '';
    redrawLines();
  };

  const close = () => modal.remove();
  $('#m-cancel', modal).onclick = close;
  $('#m-save', modal).onclick = async () => {
    if (!inv.lines.length) return toast('Add at least one line item');
    inv.number = $('#f-number', modal).value.trim() || inv.number;
    inv.date = $('#f-date', modal).value;
    inv.partyId = Number($('#f-party', modal).value);
    const p = state.parties.find((x) => x.id === inv.partyId);
    inv.partyName = p ? p.name : '';
    inv.notes = $('#f-notes', modal).value;
    if (!isNew) state.invoices = state.invoices.filter((i) => i.id !== inv.id);
    inv.id = isNew ? uid(state.invoices) : inv.id;
    state.invoices.push(inv);
    await persist();
    close(); render(); toast('Invoice saved');
  };
}

function viewInvoice(id) {
  const inv = state.invoices.find((i) => i.id === id);
  if (!inv) return;
  const party = state.parties.find((p) => p.id === inv.partyId) || {};
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal">
      <h2>${esc(inv.number)}</h2>
      <p class="muted">${esc(inv.partyName)} · ${esc(inv.date)}</p>
      <table>
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Tax%</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${inv.lines.map((l) => `<tr><td>${esc(l.itemName)}</td><td class="num">${qty(l.quantity)}</td>
            <td class="num">${money(l.rate)}</td><td class="num">${qty(l.taxPercent)}%</td>
            <td class="num">${money(lineAmount(l) + lineTax(l))}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>${money(invoiceSubtotal(inv))}</span></div>
        <div class="row"><span>Tax</span><span>${money(invoiceTax(inv))}</span></div>
        <div class="row total"><span>Total</span><span>${money(invoiceTotal(inv))}</span></div>
      </div>
      ${inv.notes ? `<p class="muted" style="margin-top:12px">${esc(inv.notes)}</p>` : ''}
      <div class="modal-actions">
        <button class="btn" id="v-close">Close</button>
        <button class="btn" id="v-pdf">Export PDF</button>
      </div>
    </div>`;
  $('#modal-root').appendChild(modal);
  $('#v-close', modal).onclick = () => modal.remove();
  $('#v-pdf', modal).onclick = async () => {
    const html = invoiceHtml(inv, party);
    try {
      const path = await window.api.exportPdf({ html, filename: inv.number + '.pdf' });
      toast('Saved to ' + path);
    } catch (e) {
      toast('PDF export failed: ' + e.message);
    }
  };
}

function invoiceHtml(inv, party) {
  const s = state.settings;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;padding:10px}
    h1{font-size:20px;margin:0}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #ddd;padding-bottom:10px}
    table{width:100%;border-collapse:collapse;margin-top:14px}
    th,td{padding:7px 8px;border-bottom:1px solid #eee;text-align:left;font-size:12px}
    td.num,th.num{text-align:right}
    .tot{margin-top:12px;text-align:right}
    .tot div{margin:3px 0}
    .tot .grand{font-weight:700;font-size:15px}
  </style></head><body>
    <div class="top">
      <div><h1>${esc(s.name)}</h1>
        <div>${esc(s.address || '')}</div><div>${esc(s.phone || '')}</div>
        <div>${s.gstin ? 'GSTIN: ' + esc(s.gstin) : ''}</div></div>
      <div style="text-align:right"><h1>INVOICE</h1><div>${esc(inv.number)}</div><div>${esc(inv.date)}</div></div>
    </div>
    <div style="margin-top:12px"><strong>Bill To:</strong> ${esc(inv.partyName)}<br>${esc(party.address || '')}</div>
    <table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Tax%</th><th class="num">Amount</th></tr></thead>
    <tbody>${inv.lines.map((l) => `<tr><td>${esc(l.itemName)}</td><td class="num">${qty(l.quantity)}</td>
      <td class="num">${money(l.rate)}</td><td class="num">${qty(l.taxPercent)}%</td>
      <td class="num">${money(lineAmount(l) + lineTax(l))}</td></tr>`).join('')}</tbody></table>
    <div class="tot">
      <div>Subtotal: ${money(invoiceSubtotal(inv))}</div>
      <div>Tax: ${money(invoiceTax(inv))}</div>
      <div class="grand">Total: ${money(invoiceTotal(inv))}</div>
    </div>
    ${inv.notes ? `<p style="margin-top:16px;color:#666">${esc(inv.notes)}</p>` : ''}
  </body></html>`;
}

// ---------- items ----------
function renderItems(view, actions) {
  actions.innerHTML = `<button class="btn" id="btn-add-item">Add Item</button>`;
  $('#btn-add-item').onclick = () => itemEditor(null);
  view.innerHTML = state.items.length ? `
    <table>
      <thead><tr><th>Name</th><th>Unit</th><th class="num">Rate</th><th class="num">Tax %</th><th class="num">Stock</th><th></th></tr></thead>
      <tbody>
        ${state.items.map((it) => `<tr>
          <td>${esc(it.name)}</td><td>${esc(it.unit)}</td>
          <td class="num">${money(it.rate)}</td><td class="num">${qty(it.taxPercent)}</td><td class="num">${qty(it.stock)}</td>
          <td><div class="row-actions">
            <button class="btn subtle" data-edit-item="${it.id}">Edit</button>
            <button class="btn subtle danger" data-del-item="${it.id}">Delete</button>
          </div></td></tr>`).join('')}
      </tbody>
    </table>` : `<div class="empty">No items yet.</div>`;

  $$('[data-edit-item]', view).forEach((b) => (b.onclick = () => itemEditor(state.items.find((x) => x.id === Number(b.dataset.editItem)))));
  $$('[data-del-item]', view).forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this item?')) return;
    state.items = state.items.filter((x) => x.id !== Number(b.dataset.delItem));
    await persist(); render(); toast('Item deleted');
  }));
}

function itemEditor(item) {
  const isNew = !item;
  const it = item ? { ...item } : { id: 0, name: '', unit: 'PCS', rate: 0, taxPercent: state.settings.defaultTax || 0, stock: 0 };
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal narrow">
      <h2>${isNew ? 'New Item' : 'Edit Item'}</h2>
      <div class="field"><label>Name</label><input id="i-name" value="${esc(it.name)}" /></div>
      <div class="grid2">
        <div class="field"><label>Unit</label><input id="i-unit" value="${esc(it.unit)}" /></div>
        <div class="field"><label>Rate</label><input id="i-rate" type="number" step="0.01" value="${it.rate}" /></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Tax %</label><input id="i-tax" type="number" step="0.01" value="${it.taxPercent}" /></div>
        <div class="field"><label>Stock</label><input id="i-stock" type="number" step="1" value="${it.stock}" /></div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="i-cancel">Cancel</button>
        <button class="btn primary" id="i-save" style="width:auto">Save</button>
      </div>
    </div>`;
  $('#modal-root').appendChild(modal);
  $('#i-cancel', modal).onclick = () => modal.remove();
  $('#i-save', modal).onclick = async () => {
    const name = $('#i-name', modal).value.trim();
    if (!name) return toast('Name is required');
    it.name = name;
    it.unit = $('#i-unit', modal).value.trim() || 'PCS';
    it.rate = Number($('#i-rate', modal).value) || 0;
    it.taxPercent = Number($('#i-tax', modal).value) || 0;
    it.stock = Number($('#i-stock', modal).value) || 0;
    if (isNew) { it.id = uid(state.items); state.items.push(it); }
    else { state.items = state.items.map((x) => (x.id === it.id ? it : x)); }
    await persist(); modal.remove(); render(); toast('Item saved');
  };
}

// ---------- parties ----------
function renderParties(view, actions) {
  actions.innerHTML = `<button class="btn" id="btn-add-party">Add Party</button>`;
  $('#btn-add-party').onclick = () => partyEditor(null);
  view.innerHTML = state.parties.length ? `
    <table>
      <thead><tr><th>Name</th><th>Phone</th><th>GSTIN</th><th>Address</th><th></th></tr></thead>
      <tbody>
        ${state.parties.map((p) => `<tr>
          <td>${esc(p.name)}</td><td>${esc(p.phone)}</td><td>${esc(p.gstin)}</td><td class="muted">${esc(p.address)}</td>
          <td><div class="row-actions">
            <button class="btn subtle" data-edit-party="${p.id}">Edit</button>
            <button class="btn subtle danger" data-del-party="${p.id}">Delete</button>
          </div></td></tr>`).join('')}
      </tbody>
    </table>` : `<div class="empty">No parties yet.</div>`;

  $$('[data-edit-party]', view).forEach((b) => (b.onclick = () => partyEditor(state.parties.find((x) => x.id === Number(b.dataset.editParty)))));
  $$('[data-del-party]', view).forEach((b) => (b.onclick = async () => {
    if (!confirm('Delete this party?')) return;
    state.parties = state.parties.filter((x) => x.id !== Number(b.dataset.delParty));
    await persist(); render(); toast('Party deleted');
  }));
}

function partyEditor(party) {
  const isNew = !party;
  const p = party ? { ...party } : { id: 0, name: '', phone: '', email: '', gstin: '', address: '' };
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal narrow">
      <h2>${isNew ? 'New Party' : 'Edit Party'}</h2>
      <div class="field"><label>Name</label><input id="p-name" value="${esc(p.name)}" /></div>
      <div class="grid2">
        <div class="field"><label>Phone</label><input id="p-phone" value="${esc(p.phone)}" /></div>
        <div class="field"><label>Email</label><input id="p-email" value="${esc(p.email)}" /></div>
      </div>
      <div class="field"><label>GSTIN</label><input id="p-gstin" value="${esc(p.gstin)}" /></div>
      <div class="field"><label>Address</label><textarea id="p-address" rows="2">${esc(p.address)}</textarea></div>
      <div class="modal-actions">
        <button class="btn" id="p-cancel">Cancel</button>
        <button class="btn primary" id="p-save" style="width:auto">Save</button>
      </div>
    </div>`;
  $('#modal-root').appendChild(modal);
  $('#p-cancel', modal).onclick = () => modal.remove();
  $('#p-save', modal).onclick = async () => {
    const name = $('#p-name', modal).value.trim();
    if (!name) return toast('Name is required');
    p.name = name;
    p.phone = $('#p-phone', modal).value.trim();
    p.email = $('#p-email', modal).value.trim();
    p.gstin = $('#p-gstin', modal).value.trim();
    p.address = $('#p-address', modal).value.trim();
    if (isNew) { p.id = uid(state.parties); state.parties.push(p); }
    else { state.parties = state.parties.map((x) => (x.id === p.id ? p : x)); }
    await persist(); modal.remove(); render(); toast('Party saved');
  };
}

// ---------- settings ----------
function renderSettings(view) {
  const s = state.settings;
  view.innerHTML = `
    <div class="section-head"><h2>Business</h2></div>
    <div class="field"><label>Business Name</label><input id="s-name" value="${esc(s.name)}" /></div>
    <div class="grid2">
      <div class="field"><label>GSTIN</label><input id="s-gstin" value="${esc(s.gstin)}" /></div>
      <div class="field"><label>Phone</label><input id="s-phone" value="${esc(s.phone)}" /></div>
    </div>
    <div class="field"><label>Address</label><textarea id="s-address" rows="2">${esc(s.address)}</textarea></div>
    <div class="section-head" style="margin-top:16px"><h2>Preferences</h2></div>
    <div class="grid2">
      <div class="field"><label>Currency symbol</label><input id="s-currency" value="${esc(s.currency)}" /></div>
      <div class="field"><label>Default tax %</label><input id="s-tax" type="number" step="0.01" value="${s.defaultTax}" /></div>
    </div>
    <div style="margin-top:14px"><button class="btn primary" id="s-save" style="width:auto">Save Settings</button></div>
    <p class="muted" style="margin-top:18px">Data file: <span id="s-path">…</span></p>`;
  window.api.dataPath().then((p) => { const el = $('#s-path'); if (el) el.textContent = p; });
  $('#s-save').onclick = async () => {
    state.settings = {
      name: $('#s-name').value.trim() || 'My Business',
      gstin: $('#s-gstin').value.trim(),
      phone: $('#s-phone').value.trim(),
      address: $('#s-address').value.trim(),
      currency: $('#s-currency').value.trim() || '₹',
      defaultTax: Number($('#s-tax').value) || 0
    };
    await persist(); render(); toast('Settings saved');
  };
}

// ---------- boot ----------
async function boot() {
  state = await window.api.load();
  if (!state.settings) state.settings = { name: 'My Business', currency: '₹', defaultTax: 18 };
  state.parties = state.parties || [];
  state.items = state.items || [];
  state.invoices = state.invoices || [];

  $$('#nav .nav-item').forEach((b) => (b.onclick = () => { currentView = b.dataset.view; render(); }));
  $('#btn-new-invoice').onclick = newInvoice;

  render();
}

window.addEventListener('DOMContentLoaded', boot);
