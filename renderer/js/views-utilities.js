'use strict';
window.Views = window.Views || {};

// ============================================================ Utilities hub
const UTILITIES = [
  { id: 'barcode-print', icon: 'barcode', title: 'Barcode printing', desc: 'Print barcode labels for one or many items' },
  { id: 'cheques', icon: 'card', title: 'Cheques', desc: 'Cheque register — pending, cleared and bounced' },
  { id: 'data-tools', icon: 'clipboard', title: 'Import & export', desc: 'Export items, parties, sales to CSV; backup and restore' },
  { id: 'backup', icon: 'shield', title: 'Backup & restore', desc: 'Save or load all firms as one file' }
];

window.Views.utilities = function (view, actions, sub) {
  sub.textContent = 'Handy tools for day-to-day shop work';
  actions.innerHTML = '';
  view.innerHTML = '';
  const grid = el('div', { class: 'grid-3' });
  UTILITIES.forEach((u) => {
    const c = el('div', { class: 'panel', style: 'cursor:pointer' });
    const b = el('div', { class: 'panel-body' });
    b.appendChild(iconEl(u.icon, 22));
    b.appendChild(el('div', { style: 'font-weight:700;margin-top:8px', text: u.title }));
    b.appendChild(el('div', { class: 'muted', style: 'font-size:12.5px;margin-top:2px', text: u.desc }));
    c.appendChild(b);
    c.onclick = () => window.Views.go(u.id);
    grid.appendChild(c);
  });
  view.appendChild(grid);
};

// ============================================================ barcode printing
const LABEL_SIZES = {
  small: { label: 'Small · 38 × 25 mm', cols: 4, width: 1.1, height: 22, fontSize: 8 },
  medium: { label: 'Medium · 50 × 30 mm', cols: 3, width: 1.4, height: 30, fontSize: 10 },
  large: { label: 'Large · 70 × 40 mm', cols: 2, width: 1.8, height: 40, fontSize: 12 }
};

window.Views.barcodePrint = function (view, actions, sub) {
  sub.textContent = 'Pick items, set copies, print barcode labels';
  let query = '';
  let selected = new Set(window.__barcodePreselect || []);
  let copies = 1;
  let size = 'medium';
  let show = { name: true, price: true, code: true, company: true };
  window.__barcodePreselect = null;

  function items() {
    const q = query.toLowerCase();
    return Store.data.items.filter((i) => !q || (i.name + ' ' + (i.barcode || '')).toLowerCase().includes(q));
  }

  function draw() {
    actions.innerHTML = '';
    const printBtn = el('button', { class: 'btn primary' });
    printBtn.appendChild(iconEl('printer', 15));
    printBtn.appendChild(el('span', { text: 'Print labels' }));
    printBtn.onclick = doPrint;
    actions.appendChild(printBtn);

    view.innerHTML = '';
    const bar = el('div', { class: 'toolbar' });
    const q = el('input', { placeholder: 'Search items…', value: query, style: 'max-width:260px' });
    q.oninput = debounce(() => { query = q.value; draw(); }, 200);
    const allBtn = el('button', { class: 'pill', text: 'Select all' });
    allBtn.onclick = () => { items().forEach((i) => selected.add(i.id)); draw(); };
    const noneBtn = el('button', { class: 'pill', text: 'Clear' });
    noneBtn.onclick = () => { selected.clear(); draw(); };
    bar.appendChild(q); bar.appendChild(allBtn); bar.appendChild(noneBtn);
    bar.appendChild(el('div', { class: 'grow' }));
    view.appendChild(bar);

    const opts = el('div', { class: 'panel', style: 'margin-bottom:14px' });
    const ob = el('div', { class: 'panel-body' });
    const optRow = el('div', { class: 'grid-3 form' });
    const copiesField = el('div', { class: 'field' }, [el('label', { text: 'Copies per item' })]);
    const copiesIn = el('input', { type: 'number', step: '1', min: '1', value: copies });
    copiesIn.oninput = () => { copies = Math.max(1, Number(copiesIn.value) || 1); summary(); };
    copiesField.appendChild(copiesIn);
    const sizeField = el('div', { class: 'field' }, [el('label', { text: 'Label size' })]);
    const sizeSel = el('select');
    sizeSel.innerHTML = Object.entries(LABEL_SIZES).map(([k, v]) => `<option value="${k}" ${k === size ? 'selected' : ''}>${v.label}</option>`).join('');
    sizeSel.onchange = () => { size = sizeSel.value; };
    sizeField.appendChild(sizeSel);
    optRow.appendChild(copiesField); optRow.appendChild(sizeField);
    ob.appendChild(optRow);

    const toggles = el('div', { class: 'pill-row' });
    [['name', 'Item name'], ['price', 'Price'], ['code', 'Code text'], ['company', 'Shop name']].forEach(([k, label]) => {
      const p = el('button', { class: 'pill' + (show[k] ? ' active' : ''), text: label });
      p.onclick = () => { show[k] = !show[k]; draw(); };
      toggles.appendChild(p);
    });
    ob.appendChild(toggles);
    const sum = el('div', { class: 'muted', style: 'margin-top:10px;font-size:12.5px' });
    ob.appendChild(sum);
    function summary() {
      const total = selected.size * copies;
      sum.textContent = `${selected.size} item(s) × ${copies} = ${total} label(s)`;
    }
    summary();
    opts.appendChild(ob);
    view.appendChild(opts);

    const list = items();
    if (!list.length) { view.appendChild(emptyState('box', 'No items', 'Add items first.')); return; }
    const wrap = el('div', { class: 'table-wrap', style: 'max-height:46vh' });
    wrap.innerHTML = `<table class="data"><thead><tr><th style="width:40px"></th><th>Item</th><th>Barcode code</th><th class="num">Price</th><th class="num">Stock</th></tr></thead>
      <tbody>${list.map((i) => `<tr data-id="${i.id}" style="cursor:pointer">
        <td><input type="checkbox" data-check="${i.id}" ${selected.has(i.id) ? 'checked' : ''} /></td>
        <td>${esc(i.name)}</td>
        <td class="muted">${esc(itemCode(i))}</td>
        <td class="num">${money(i.saleRate)}</td>
        <td class="num">${qty(Store.stockOf(i.id))}</td></tr>`).join('')}</tbody></table>`;
    view.appendChild(wrap);
    $$('tr[data-id]', wrap).forEach((tr) => {
      tr.onclick = (e) => {
        const id = Number(tr.dataset.id);
        if (e.target && e.target.tagName === 'INPUT') { if (e.target.checked) selected.add(id); else selected.delete(id); }
        else { if (selected.has(id)) selected.delete(id); else selected.add(id); }
        draw();
      };
    });
  }

  async function doPrint() {
    const list = Store.data.items.filter((i) => selected.has(i.id));
    if (!list.length) return toast('Select at least one item', true);
    const cfg = LABEL_SIZES[size];
    const s = Store.data.profile;
    const label = (it) => {
      const code = itemCode(it);
      return `<div class="label">
        <div class="bar">${barcodeSvg(code, { format: barcodeFormatFor(code), width: cfg.width, height: cfg.height, fontSize: cfg.fontSize, margin: 2, displayValue: !!show.code })}</div>
        ${show.name ? `<div class="name">${esc(it.name)}</div>` : ''}
        ${show.price ? `<div class="meta">${money(it.saleRate)}</div>` : ''}
        ${show.company ? `<div class="shop">${esc(s.name)}</div>` : ''}
      </div>`;
    };
    const labels = [];
    list.forEach((it) => { for (let c = 0; c < copies; c++) labels.push(label(it)); });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page { size: A4; margin: 6mm; }
      body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:0;color:#111}
      .grid{display:grid;grid-template-columns:repeat(${cfg.cols},1fr);gap:2mm}
      .label{border:1px dashed #ccc;border-radius:2mm;padding:1.6mm;text-align:center;page-break-inside:avoid}
      .bar svg{max-width:100%;height:auto}
      .name{font-size:8px;font-weight:700;line-height:1.15;height:5mm;overflow:hidden;margin-top:0.5mm}
      .meta{font-size:8px;color:#333}
      .shop{font-size:7px;color:#777}
    </style></head><body><div class="grid">${labels.join('')}</div></body></html>`;
    try {
      const path = await window.api.exportPdf({ html, filename: 'Barcodes-' + today() + '.pdf' });
      toast('Barcode labels saved: ' + path);
    } catch (e) { toast('Could not create labels: ' + e.message, true); }
  }

  draw();
};

// ============================================================ cheque register
window.Views.cheques = function (view, actions, sub) {
  sub.textContent = 'Cheques received and issued';
  let filter = 'all';

  function cheques() {
    return Store.data.payments.filter((p) => p.mode === 'Cheque' || p.chequeNo);
  }

  function draw() {
    actions.innerHTML = '';
    const addBtn = el('button', { class: 'btn primary' });
    addBtn.appendChild(iconEl('plus', 15));
    addBtn.appendChild(el('span', { text: 'Record cheque' }));
    addBtn.onclick = () => window.Views.paymentEditor(null, 'in');
    actions.appendChild(addBtn);

    view.innerHTML = '';
    const bar = el('div', { class: 'toolbar' });
    ['all', 'Pending', 'Cleared', 'Bounced'].forEach((f) => {
      const p = el('button', { class: 'pill' + (filter === f ? ' active' : ''), text: f === 'all' ? 'All' : f });
      p.onclick = () => { filter = f; draw(); };
      bar.appendChild(p);
    });
    view.appendChild(bar);

    const all = cheques();
    const list = all.filter((p) => filter === 'all' || (p.chequeStatus || 'Pending') === filter);
    if (!list.length) {
      view.appendChild(emptyState('card', 'No cheques', 'Record a payment with mode “Cheque” and it will appear here.', 'Record payment', () => window.Views.paymentEditor(null, 'in')));
      return;
    }
    const pending = all.filter((p) => (p.chequeStatus || 'Pending') === 'Pending').reduce((s, p) => s + Number(p.amount || 0), 0);
    const wrap = el('div', { class: 'table-wrap' });
    wrap.innerHTML = `<table class="data"><thead><tr><th>Cheque date</th><th>Party</th><th>Type</th><th>Cheque no.</th>
      <th class="num">Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map((p) => `<tr>
        <td class="nowrap">${p.chequeDate ? fmtDate(p.chequeDate) : fmtDate(p.date)}</td>
        <td>${esc(p.partyName)}</td>
        <td>${p.dir === 'in' ? 'Received' : 'Issued'}</td>
        <td>${esc(p.chequeNo || '—')}</td>
        <td class="num">${money(p.amount)}</td>
        <td><span class="badge ${(p.chequeStatus || 'Pending') === 'Cleared' ? 'paid' : (p.chequeStatus === 'Bounced' ? 'unpaid' : 'partial')}">${p.chequeStatus || 'Pending'}</span></td>
        <td><div class="row-actions">
          <button class="btn sm" data-set="${p.id}" data-v="Cleared">Cleared</button>
          <button class="btn sm danger" data-set="${p.id}" data-v="Bounced">Bounced</button>
          <button class="btn sm" data-set="${p.id}" data-v="Pending">Pending</button></div></td></tr>`).join('')}
      <tr class="total-row"><td colspan="4">Pending amount</td><td class="num">${money(pending)}</td><td colspan="2"></td></tr>
      </tbody></table>`;
    view.appendChild(wrap);
    $$('[data-set]', wrap).forEach((b) => (b.onclick = async () => {
      await Store.updatePayment(Number(b.dataset.set), { chequeStatus: b.dataset.v });
      toast('Marked ' + b.dataset.v);
      draw();
    }));
  }
  draw();
};

// ============================================================ import / export
function toCsv(rows) {
  return rows.map((r) => r.map((c) => {
    const v = c === null || c === undefined ? '' : String(c);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }).join(',')).join('\n');
}

window.Views.dataTools = function (view, actions, sub) {
  sub.textContent = 'Export your data, or bring items in';
  actions.innerHTML = '';
  view.innerHTML = '';

  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('div', { class: 'panel-head' }, [el('h2', { text: 'Export to CSV' })]));
  const b = el('div', { class: 'panel-body' });
  b.appendChild(el('p', { class: 'muted', text: 'Open in Excel, Numbers or Google Sheets.' }));
  const row = el('div', { class: 'toolbar' });
  const mk = (label, icon, fn) => { const btn = el('button', { class: 'btn' }); btn.appendChild(iconEl(icon, 15)); btn.appendChild(el('span', { text: label })); btn.onclick = fn; return btn; };
  row.appendChild(mk('Items', 'box', async () => {
    const rows = [['Name', 'Category', 'Unit', 'HSN', 'SaleRate', 'PurchaseRate', 'TaxPercent', 'Stock', 'Barcode', 'Batch', 'Expiry', 'Godown']];
    Store.data.items.forEach((i) => rows.push([i.name, Store.categoryName(i.categoryId), i.unit, i.hsn, i.saleRate, i.purchaseRate, i.taxPercent, Store.stockOf(i.id), itemCode(i), i.batch || '', i.expiry || '', i.godown || '']));
    await saveCsv('items.csv', rows);
  }));
  row.appendChild(mk('Parties', 'users', async () => {
    const rows = [['Name', 'Type', 'Phone', 'Email', 'GSTIN', 'Address', 'Receivable', 'Payable']];
    Store.data.parties.forEach((p) => { const s = Store.partySummary(p.id); rows.push([p.name, p.type, p.phone, p.email, p.gstin, p.address, s.receivable.toFixed(2), s.payable.toFixed(2)]); });
    await saveCsv('parties.csv', rows);
  }));
  row.appendChild(mk('Sales & purchases', 'invoice', async () => {
    const rows = [['Type', 'Number', 'Date', 'Party', 'Status', 'Taxable', 'Tax', 'Total']];
    Store.data.docs.forEach((d) => rows.push([DOC_TYPES[d.type].label, d.number, d.date, d.partyName, Store.docStatus(d), Store.docTaxable(d).toFixed(2), Store.docTax(d).toFixed(2), Store.docTotal(d).toFixed(2)]));
    await saveCsv('documents.csv', rows);
  }));
  b.appendChild(row);
  panel.appendChild(b);
  view.appendChild(panel);

  async function saveCsv(filename, rows) {
    try {
      const path = await window.api.saveText({ filename, content: toCsv(rows), filters: [{ name: 'CSV', extensions: ['csv'] }] });
      if (path) toast('Saved: ' + path);
    } catch (e) { toast('Export failed: ' + e.message, true); }
  }

  const ipanel = el('div', { class: 'panel', style: 'margin-top:16px' });
  ipanel.appendChild(el('div', { class: 'panel-head' }, [el('h2', { text: 'Import items from CSV' })]));
  const ib = el('div', { class: 'panel-body' });
  ib.appendChild(el('p', { class: 'muted', text: 'Paste rows as: Name, Unit, SaleRate, TaxPercent (one item per line). A header row is optional.' }));
  const ta = el('textarea', { rows: '6', placeholder: 'Name,Unit,SaleRate,TaxPercent\nParle-G 100g,PCS,10,18' });
  ib.appendChild(ta);
  const impBtn = el('button', { class: 'btn primary', text: 'Import items', style: 'margin-top:10px' });
  impBtn.onclick = async () => {
    const lines = ta.value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return toast('Nothing to import', true);
    let added = 0;
    for (const line of lines) {
      const parts = line.split(',').map((s) => s.trim());
      if (/^name$/i.test(parts[0])) continue;
      const name = parts[0];
      if (!name) continue;
      await Store.upsertItem({
        id: 0, name, categoryId: 0, unit: parts[1] || 'PCS', hsn: '',
        saleRate: Number(parts[2]) || 0, purchaseRate: 0,
        taxPercent: parts[3] !== undefined ? Number(parts[3]) || 0 : (Store.data.tax.defaultTax || 0),
        openingStock: 0, lowStock: 0, barcode: '', sku: ''
      });
      added++;
    }
    ta.value = '';
    toast('Imported ' + added + ' item(s)');
    window.Views.go('items');
  };
  ib.appendChild(impBtn);
  ipanel.appendChild(ib);
  view.appendChild(ipanel);
};
