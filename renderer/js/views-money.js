'use strict';
window.Views = window.Views || {};

// ============================================================ document lists
window.Views.docList = function (type) {
  return function (view, actions, sub) {
    const meta = DOC_TYPES[type];
    const isSale = meta.group === 'sales';
    sub.textContent = isSale ? 'Money you bill to customers' : 'Bills and orders from suppliers';
    let query = '', statusFilter = 'all';

    function draw() {
      actions.innerHTML = '';
      const b = el('button', { class: 'btn primary', text: '＋ New ' + meta.label });
      b.onclick = () => window.Views.newDoc(type);
      actions.appendChild(b);

      view.innerHTML = '';
      const bar = el('div', { class: 'toolbar' });
      ['all', 'unpaid', 'partial', 'paid'].forEach((s) => {
        if (!meta.posting && s !== 'all') return;
        const p = el('button', { class: 'pill' + (statusFilter === s ? ' active' : ''), text: s[0].toUpperCase() + s.slice(1) });
        p.onclick = () => { statusFilter = s; draw(); };
        bar.appendChild(p);
      });
      const inp = el('input', { placeholder: 'Search number / party…', value: query, style: 'max-width:280px' });
      inp.oninput = debounce(() => { query = inp.value; draw(); }, 250);
      bar.appendChild(el('div', { class: 'grow' }));
      bar.appendChild(inp);
      view.appendChild(bar);

      const list = Store.data.docs
        .filter((d) => d.type === type)
        .filter((d) => statusFilter === 'all' || Store.docStatus(d) === statusFilter)
        .filter((d) => !query || (d.number + ' ' + d.partyName).toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

      if (!list.length) {
        view.appendChild(emptyState(meta.icon, 'No ' + meta.plural.toLowerCase() + ' yet',
          'Create your first ' + meta.label.toLowerCase() + ' and it will show up here.',
          '＋ New ' + meta.label, () => window.Views.newDoc(type)));
        return;
      }

      const total = list.reduce((s, d) => s + Store.docTotal(d), 0);
      const wrap = el('div', { class: 'table-wrap' });
      wrap.innerHTML = `<table class="data"><thead><tr>
        <th>Number</th><th>Party</th><th>Date</th>
        ${meta.posting ? '<th class="num">Balance</th>' : ''}
        <th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody>
        ${list.map((d) => `<tr>
          <td><span class="link" data-view="${d.id}">${esc(d.number)}</span></td>
          <td>${esc(d.partyName || '—')}</td><td class="nowrap">${fmtDate(d.date)}</td>
          ${meta.posting ? `<td class="num">${money(Store.docBalance(d))}</td>` : ''}
          <td class="num"><strong>${money(Store.docTotal(d))}</strong></td>
          <td><span class="badge ${Store.docStatus(d)}">${Store.docStatus(d)}</span></td>
          <td><div class="row-actions">
            <button class="btn sm" data-view="${d.id}">View</button>
            <button class="btn sm" data-edit="${d.id}">Edit</button>
            <button class="btn sm danger" data-del="${d.id}">Delete</button></div></td></tr>`).join('')}
        <tr class="total-row"><td colspan="${meta.posting ? 5 : 4}">Total (${list.length})</td><td class="num">${money(total)}</td><td></td></tr>
      </tbody></table>`;
      view.appendChild(wrap);
      $$('[data-view]', wrap).forEach((n) => (n.onclick = () => window.Views.viewDoc(Number(n.dataset.view))));
      $$('[data-edit]', wrap).forEach((n) => (n.onclick = () => window.Views.docEditor(Store.data.docs.find((d) => d.id === Number(n.dataset.edit)), false)));
      $$('[data-del]', wrap).forEach((n) => (n.onclick = async () => {
        if (await confirmDialog('Delete this document?')) { await Store.deleteDoc(Number(n.dataset.del)); toast('Deleted'); draw(); }
      }));
    }
    draw();
  };
};

window.Views.newDoc = function (type) {
  const meta = DOC_TYPES[type];
  const doc = {
    id: 0, type, number: Store.nextNumber(type), date: today(),
    partyId: Store.data.parties.find((p) => (meta.group === 'purchase' ? p.type === 'supplier' : p.type !== 'supplier'))?.id || 0,
    partyName: '', lines: [], notes: '', paid: 0, status: meta.posting ? 'unpaid' : 'open'
  };
  const party = Store.party(doc.partyId);
  if (party) doc.partyName = party.name;
  window.Views.docEditor(doc, true);
};

// ============================================================ document editor
window.Views.docEditor = function (doc, isNew) {
  const meta = DOC_TYPES[doc.type];
  const draft = JSON.parse(JSON.stringify(doc));
  if (!draft.lines.length) draft.lines = [];

  const body = el('div');
  body.innerHTML = `
    <div class="grid-3 form">
      <div class="field"><label>${meta.label} number</label><input id="d-number" value="${esc(draft.number)}" /></div>
      <div class="field"><label>Date</label><input id="d-date" type="date" value="${esc(draft.date)}" /></div>
      <div class="field"><label>Party ${meta.group === 'purchase' ? '(supplier)' : '(customer)'}</label>
        <div style="display:flex;gap:6px">
          <select id="d-party" style="flex:1"></select>
          <button class="btn sm" id="d-newparty" title="Add new party">＋</button>
        </div>
      </div>
    </div>
    <div class="section-title">Items</div>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <input id="d-scan" placeholder="⌨️ Scan or type a code, then Enter to add the item" style="max-width:430px" />
      <button class="btn sm" id="d-scan-cam" title="Scan with camera">${iconSvg('camera', 14)}</button>
    </div>
    <div class="line-head"><span>Item</span><span>Qty</span><span>Rate</span><span>Disc %</span><span>Tax %</span><span class="right">Amount</span><span></span></div>
    <div id="d-lines"></div>
    <button class="btn sm" id="d-addline">＋ Add line</button>
    <div class="grid-2 form" style="margin-top:14px">
      <div>
        <div class="field"><label>Notes</label><textarea id="d-notes" rows="2">${esc(draft.notes)}</textarea></div>
        <div class="grid-3 form">
          <div class="field"><label>Discount %</label><input id="d-disc" type="number" step="0.01" value="${Number(draft.discountPercent || 0)}" /></div>
          <div class="field"><label>Additional charges</label><input id="d-charges" type="number" step="0.01" value="${Number(draft.additionalCharges || 0)}" /></div>
          <div class="field"><label>Round off</label>
            <label class="checkline"><input type="checkbox" id="d-round" ${draft.roundOff ? 'checked' : ''}/> Round the total</label></div>
        </div>
        <div class="grid-2 form">
          <div class="field"><label>Due date</label><input id="d-due" type="date" value="${esc(draft.dueDate || '')}" /></div>
          <div class="field"><label>Place of supply (state)</label>
            <select id="d-pos">
              <option value="">— same as my state —</option>
              ${Store.states().map((s) => `<option value="${s.code}" ${String(draft.placeOfSupplyCode || '') === s.code ? 'selected' : ''}>${s.code} · ${esc(s.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <label class="checkline"><input type="checkbox" id="d-rcm" ${draft.reverseCharge ? 'checked' : ''}/> Reverse charge applies</label>
        <div id="d-supply" class="muted" style="font-size:12px;margin-top:8px"></div>
        <div id="d-compliance"></div>
      </div>
      <div><div class="totals" id="d-totals"></div></div>
    </div>`;

  const partySel = $('#d-party', body);
  function fillParties(selectId) {
    const pool = Store.data.parties.filter((p) => meta.group === 'purchase' ? p.type === 'supplier' : p.type !== 'supplier');
    partySel.innerHTML = pool.length
      ? pool.map((p) => `<option value="${p.id}" ${p.id === (selectId || draft.partyId) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')
      : '<option value="0">No party yet — click ＋</option>';
  }
  fillParties();

  const linesEl = $('#d-lines', body);
  const totalsEl = $('#d-totals', body);

  function totals() {
    const d = Store.docDiscount(draft), ch = Store.docCharges(draft), ro = Store.docRoundOff(draft);
    const split = Store.gstBreakup(draft);
    const splitRows = split.map((r) => `<div class="row"><span>${draft.interState ? 'IGST' : 'CGST+SGST'} ${qty(r.rate)}%</span><span>${money(r.tax)}</span></div>`).join('');
    totalsEl.innerHTML = `
      <div class="row"><span>Subtotal</span><span>${money(Store.docSubtotal(draft))}</span></div>
      ${d ? `<div class="row"><span>Discount</span><span>− ${money(d)}</span></div>` : ''}
      <div class="row"><span>Taxable value</span><span>${money(Store.docTaxable(draft))}</span></div>
      ${splitRows || `<div class="row"><span>Tax</span><span>${money(Store.docTax(draft))}</span></div>`}
      ${ch ? `<div class="row"><span>Additional charges</span><span>${money(ch)}</span></div>` : ''}
      ${draft.roundOff ? `<div class="row"><span>Round off</span><span>${money(ro)}</span></div>` : ''}
      <div class="row grand"><span>Total</span><span>${money(Store.docTotal(draft))}</span></div>`;
  }
  function redrawLines() {
    linesEl.innerHTML = '';
    if (!draft.lines.length) {
      linesEl.innerHTML = '<p class="muted" style="padding:8px 0">No items yet — click “Add line”.</p>';
    }
    draft.lines.forEach((l, i) => {
      const row = el('div', { class: 'line-row' });
      const itemSel = el('select');
      itemSel.innerHTML = `<option value="0">Custom line…</option>` +
        Store.data.items.map((it) => `<option value="${it.id}" ${Number(l.itemId) === it.id ? 'selected' : ''}>${esc(it.name)}</option>`).join('');
      itemSel.onchange = () => {
        const it = Store.item(Number(itemSel.value));
        if (it) {
          l.itemId = it.id; l.itemName = it.name; l.unit = it.unit; l.hsn = it.hsn;
          l.rate = meta.group === 'purchase' ? it.purchaseRate : it.saleRate;
          l.taxPercent = it.taxPercent;
        }
        redrawLines(); totals();
      };
      const nameIn = el('input', { value: l.itemName || '', placeholder: 'Item name', style: 'margin-top:6px' });
      nameIn.oninput = () => { l.itemName = nameIn.value; };
      const col1 = el('div');
      col1.appendChild(itemSel); col1.appendChild(nameIn);

      const qIn = el('input', { type: 'number', step: '1', value: l.qty });
      qIn.oninput = () => { l.qty = Number(qIn.value); totals(); updateAmt(); };
      const rIn = el('input', { type: 'number', step: '0.01', value: l.rate });
      rIn.oninput = () => { l.rate = Number(rIn.value); totals(); updateAmt(); };
      const dIn = el('input', { type: 'number', step: '0.01', value: Number(l.discountPercent || 0) });
      dIn.oninput = () => { l.discountPercent = Number(dIn.value); totals(); updateAmt(); };
      const tIn = el('input', { type: 'number', step: '0.01', value: l.taxPercent });
      tIn.oninput = () => { l.taxPercent = Number(tIn.value); totals(); updateAmt(); };

      const amt = el('div', { class: 'amt', text: money(Store.lineTotal(l)) });
      function updateAmt() { amt.textContent = money(Store.lineTotal(l)); }

      const del = el('button', { class: 'btn sm danger', text: '✕' });
      del.onclick = () => { draft.lines.splice(i, 1); redrawLines(); totals(); };

      row.appendChild(col1); row.appendChild(qIn); row.appendChild(rIn); row.appendChild(dIn); row.appendChild(tIn); row.appendChild(amt); row.appendChild(del);
      linesEl.appendChild(row);
    });
  }
  redrawLines(); totals();

  const bind = (sel, key, numeric) => {
    const n = $(sel, body);
    if (!n) return;
    const handler = () => { draft[key] = numeric ? Number(n.value) : n.value; totals(); };
    n.addEventListener('input', handler);
    n.addEventListener('change', handler);
  };
  bind('#d-disc', 'discountPercent', true);
  bind('#d-charges', 'additionalCharges', true);
  bind('#d-round', 'roundOff', false);
  bind('#d-due', 'dueDate', false);

  const posSel = $('#d-pos', body);
  const rcmBox = $('#d-rcm', body);
  const supplyEl = $('#d-supply', body);
  const complianceEl = $('#d-compliance', body);

  function refreshCompliance() {
    draft.placeOfSupplyCode = posSel.value || '';
    draft.reverseCharge = rcmBox.checked;
    const inter = Store.isInterState(draft);
    const myState = Store.supplierStateCode();
    supplyEl.innerHTML = `Tax type: <strong>${inter ? 'IGST (inter-state)' : 'CGST + SGST (intra-state)'}</strong>`
      + (myState ? ` · your state: ${esc(Store.stateName(myState))}` : ' · set your GSTIN or state in Business Settings');
    const issues = Store.complianceIssues(draft);
    complianceEl.innerHTML = issues.length
      ? `<div class="compliance"><h4>Compliance checks — ${issues.length} item(s) to look at</h4><ul>${issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`
      : '';
  }
  posSel.onchange = refreshCompliance;
  rcmBox.onchange = refreshCompliance;
  setTimeout(refreshCompliance, 20);

  $('#d-addline', body).onclick = () => {
    draft.lines.push({ itemId: 0, itemName: '', hsn: '', unit: 'PCS', qty: 1, rate: 0, discountPercent: 0, taxPercent: Store.data.tax.defaultTax || 0 });
    redrawLines(); totals();
  };

  function addItemToDraft(item) {
    draft.lines.push({
      itemId: item.id, itemName: item.name, hsn: item.hsn, unit: item.unit, qty: 1,
      rate: meta.group === 'purchase' ? item.purchaseRate : item.saleRate,
      taxPercent: item.taxPercent
    });
    redrawLines(); totals();
    toast('Added ' + item.name);
  }
  function handleCode(code) {
    const it = findItemByCode(code);
    if (it) return addItemToDraft(it);
    toast('No item with code ' + code + ' — add it on the Items screen', true);
  }
  attachScanField($('#d-scan', body), handleCode);
  $('#d-scan-cam', body).onclick = () => window.Views.scanCode({ onDetect: handleCode });
  $('#d-newparty', body).onclick = () => window.Views.partyEditor(null, (created) => { fillParties(created.id); draft.partyId = created.id; draft.partyName = created.name; });

  openModal({
    title: (isNew ? 'New ' : 'Edit ') + meta.label,
    sub: 'Pick a party, add items, and save. Totals and tax are calculated automatically.',
    width: 'wide',
    body,
    actions: [
      { label: 'Delete', kind: 'danger', spacer: true, onClick: async (close) => {
        if (!draft.id) return close();
        if (await confirmDialog('Delete this document?')) { await Store.deleteDoc(draft.id); close(); toast('Deleted'); window.Views.go(window.Views.current); }
      } },
      { label: 'Cancel', onClick: (close) => close() },
      { label: 'Save', kind: 'primary', onClick: async (close) => {
        if (!draft.lines.length) return toast('Add at least one line', true);
        if (!Number($('#d-party', body).value)) return toast('Choose a party', true);
        draft.number = $('#d-number', body).value.trim() || draft.number;
        draft.date = $('#d-date', body).value || today();
        draft.partyId = Number($('#d-party', body).value);
        const p = Store.party(draft.partyId);
        draft.partyName = p ? p.name : '';
        draft.notes = $('#d-notes', body).value;
        draft.discountPercent = Number($('#d-disc', body).value) || 0;
        draft.additionalCharges = Number($('#d-charges', body).value) || 0;
        draft.roundOff = $('#d-round', body).checked;
        draft.dueDate = $('#d-due', body).value;
        draft.placeOfSupplyCode = $('#d-pos', body).value || '';
        draft.reverseCharge = $('#d-rcm', body).checked;

        const issues = Store.complianceIssues(draft);
        if (issues.length) {
          const list = el('div');
          list.innerHTML = `<div class="compliance"><h4>This document has ${issues.length} compliance item(s)</h4>
            <ul>${issues.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>
            <p class="muted">You can fix these first, or save anyway and correct them later.</p>`;
          openModal({
            title: 'Compliance check',
            sub: 'GST-wise this document is not fully compliant yet.',
            width: 'narrow',
            body: list,
            actions: [
              { label: 'Fix first', kind: 'primary', onClick: (c) => c() },
              { label: 'Save anyway', onClick: async (c) => {
                await Store.upsertDoc(draft);
                c(); close(); toast(meta.label + ' saved with warnings'); window.Views.go(window.Views.current);
              } }
            ]
          });
          return;
        }
        await Store.upsertDoc(draft);
        close(); toast(meta.label + ' saved'); window.Views.go(window.Views.current);
      } }
    ]
  });
};

// ============================================================ document viewer
window.Views.viewDoc = function (id) {
  const doc = Store.data.docs.find((d) => d.id === id);
  if (!doc) return;
  const meta = DOC_TYPES[doc.type];
  const party = Store.party(doc.partyId) || {};
  const body = el('div');
  body.innerHTML = `
    <div class="grid-2 form">
      <div><div class="stat-line"><span>Party</span><span><strong>${esc(doc.partyName || '—')}</strong></span></div>
        ${party.phone ? `<div class="stat-line"><span>Phone</span><span>${esc(party.phone)}</span></div>` : ''}
        ${party.gstin ? `<div class="stat-line"><span>GSTIN</span><span>${esc(party.gstin)}</span></div>` : ''}
        <div class="stat-line"><span>Date</span><span>${fmtDate(doc.date)}</span></div></div>
      <div><div class="stat-line"><span>Status</span><span><span class="badge ${Store.docStatus(doc)}">${Store.docStatus(doc)}</span></span></div>
        ${meta.posting ? `<div class="stat-line"><span>Paid</span><span>${money(doc.paid || 0)}</span></div>
        <div class="stat-line"><span>Balance</span><span><strong>${money(Store.docBalance(doc))}</strong></span></div>` : ''}
      </div>
    </div>
    <div class="table-wrap" style="box-shadow:none;margin-top:12px;max-height:40vh">
      <table class="data"><thead><tr><th>Item</th><th>HSN</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Tax%</th><th class="num">Amount</th></tr></thead>
      <tbody>${doc.lines.map((l) => `<tr><td>${esc(l.itemName)}</td><td class="muted">${esc(l.hsn || '—')}</td>
        <td class="num">${qty(l.qty)} ${esc(l.unit || '')}</td><td class="num">${money(l.rate)}</td>
        <td class="num">${pct(l.taxPercent)}</td><td class="num">${money(Store.lineAmount(l) + Store.lineTax(l))}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="5">Subtotal</td><td class="num">${money(Store.docSubtotal(doc))}</td></tr>
      ${Store.docDiscount(doc) ? `<tr class="total-row"><td colspan="5">Discount</td><td class="num">− ${money(Store.docDiscount(doc))}</td></tr>` : ''}
      <tr class="total-row"><td colspan="5">Taxable value</td><td class="num">${money(Store.docTaxable(doc))}</td></tr>
      ${Store.gstBreakup(doc).map((r) => `<tr class="total-row"><td colspan="5">${Store.isInterState(doc) ? 'IGST' : 'CGST+SGST'} ${qty(r.rate)}%</td><td class="num">${money(r.tax)}</td></tr>`).join('')}
      ${Store.docCharges(doc) ? `<tr class="total-row"><td colspan="5">Additional charges</td><td class="num">${money(Store.docCharges(doc))}</td></tr>` : ''}
      ${doc.roundOff ? `<tr class="total-row"><td colspan="5">Round off</td><td class="num">${money(Store.docRoundOff(doc))}</td></tr>` : ''}
      <tr class="total-row"><td colspan="5">Total</td><td class="num">${money(Store.docTotal(doc))}</td></tr>
      </tbody></table>
    <div class="muted" style="margin-top:8px;font-size:12px"><strong>In words:</strong> ${esc(Store.amountInWords(Store.docTotal(doc)))}</div>
    </div>
    ${doc.notes ? `<p class="muted" style="margin-top:10px">${esc(doc.notes)}</p>` : ''}`;

  const actions = [
    { label: 'Close', onClick: (close) => close() },
    { label: 'Duplicate', icon: 'clipboard', onClick: async (close) => { await Store.duplicateDoc(doc.id); close(); toast('Duplicated'); window.Views.go(window.Views.current); } },
    { label: 'Edit', icon: 'edit', onClick: (close) => { close(); window.Views.docEditor(doc, false); } },
    { label: 'Export PDF', icon: 'printer', onClick: async () => { await window.Views.exportDocPdf(doc); } }
  ];
  if (!meta.posting && meta.group === 'sales') {
    actions.unshift({
      label: 'Convert to Invoice', icon: 'invoice', kind: 'primary',
      onClick: async (close) => { const d = await Store.convertDoc(doc.id, 'invoice'); close(); if (d) { toast('Converted to ' + d.number); window.Views.viewDoc(d.id); } }
    });
  }
  if (meta.posting && Store.docBalance(doc) > 0) {
    actions.unshift({
      label: 'Record payment', kind: 'primary', icon: 'arrowDown',
      onClick: (close) => { close(); window.Views.paymentEditor(null, meta.group === 'purchase' ? 'out' : 'in', doc.partyId, doc.id, Store.docBalance(doc)); }
    });
    if (meta.group === 'sales') {
      actions.unshift({ label: 'Remind', icon: 'alert', onClick: () => window.Views.remind(doc) });
    }
  }
  openModal({ title: doc.number + ' · ' + meta.label, sub: 'Document details', width: 'wide', body, actions });
};

// ============================================================ printable doc
window.Views.docHtml = function (doc) {
  const s = Store.data.profile;
  const party = Store.party(doc.partyId) || {};
  const meta = DOC_TYPES[doc.type];
  const disc = Store.docDiscount(doc), ch = Store.docCharges(doc), ro = Store.docRoundOff(doc);
  const split = Store.gstBreakup(doc);
  const inter = Store.isInterState(doc);
  const splitRows = split.map((r) => inter
    ? `<div>IGST ${qty(r.rate)}%: ${money(r.igst)}</div>`
    : `<div>CGST ${qty(r.rate / 2)}%: ${money(r.cgst)}</div><div>SGST ${qty(r.rate / 2)}%: ${money(r.sgst)}</div>`).join('');
  const bank = (Store.data.accounts || []).filter((a) => a.type === 'bank' && (a.accountNumber || a.name));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm; }
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1F2137;font-size:11.5px;margin:0}
    h1{font-size:19px;margin:0 0 2px} .muted{color:#6B6F8A}
    .top{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #DA3742;padding-bottom:10px}
    .badge{display:inline-block;background:#F8D8DC;color:#DA3742;font-weight:700;font-size:10px;
      padding:2px 8px;border-radius:10px;letter-spacing:.06em}
    .parties{display:flex;justify-content:space-between;gap:20px;margin-top:12px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th{background:#F7F8FB;color:#6B6F8A;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;text-align:left}
    th,td{padding:6px 7px;border-bottom:1px solid #E8EAF0}
    td.num,th.num{text-align:right}
    .bottom{display:flex;justify-content:space-between;gap:24px;margin-top:14px}
    .tot{min-width:250px} .tot div{display:flex;justify-content:space-between;padding:3px 0}
    .tot .grand{border-top:1px solid #E8EAF0;margin-top:4px;padding-top:6px;font-weight:700;font-size:14px}
    .words{margin-top:12px;background:#F7F8FB;border-radius:6px;padding:8px 10px;font-size:11px}
    .foot{margin-top:22px;border-top:1px solid #E8EAF0;padding-top:8px;color:#6B6F8A;font-size:10px;
      display:flex;justify-content:space-between}
  </style></head><body>
    <div class="top">
      <div><h1>${esc(s.name)}</h1>
        <div class="muted">${esc(s.address || '')}</div>
        <div class="muted">${esc(s.phone || '')}${s.email ? ' · ' + esc(s.email) : ''}</div>
        ${s.gstin ? `<div class="muted">GSTIN: ${esc(s.gstin)}</div>` : ''}</div>
      <div style="text-align:right">
        <div class="badge">${esc(meta.label.toUpperCase())}</div>
        <div style="font-weight:700;margin-top:6px">${esc(doc.number)}</div>
        <div class="muted">Date: ${fmtDate(doc.date)}</div>
        ${doc.dueDate ? `<div class="muted">Due: ${fmtDate(doc.dueDate)}</div>` : ''}
        ${doc.placeOfSupply ? `<div class="muted">Place of supply: ${esc(doc.placeOfSupply)}</div>` : ''}
      </div>
    </div>
    <div class="parties">
      <div><div class="muted" style="font-size:10px;text-transform:uppercase">${meta.group === 'purchase' ? 'Supplier' : 'Bill to'}</div>
        <div style="font-weight:700">${esc(doc.partyName || '')}</div>
        <div class="muted">${esc(party.address || '')}</div>
        ${party.phone ? `<div class="muted">${esc(party.phone)}</div>` : ''}
        ${party.gstin ? `<div class="muted">GSTIN: ${esc(party.gstin)}</div>` : ''}</div>
    </div>
    <table><thead><tr><th>#</th><th>Item</th><th>HSN</th><th class="num">Qty</th><th class="num">Rate</th>
      <th class="num">Disc%</th><th class="num">Tax%</th><th class="num">Amount</th></tr></thead>
      <tbody>${doc.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.itemName)}</td>
        <td>${esc(l.hsn || '—')}</td><td class="num">${qty(l.qty)} ${esc(l.unit || '')}</td>
        <td class="num">${money(l.rate)}</td><td class="num">${qty(l.discountPercent || 0)}</td>
        <td class="num">${qty(l.taxPercent)}</td><td class="num">${money(Store.lineAmount(l) + Store.lineTax(l))}</td></tr>`).join('')}</tbody></table>
    <div class="bottom">
      <div style="flex:1">
        ${bank.length ? `<div style="font-size:10px;text-transform:uppercase;color:#6B6F8A">Bank details</div>
          ${bank.map((b) => `<div class="muted">${esc(b.name)}${b.accountNumber ? ' · A/c ' + esc(b.accountNumber) : ''}${b.ifsc ? ' · IFSC ' + esc(b.ifsc) : ''}</div>`).join('')}` : ''}
        ${doc.notes ? `<div style="margin-top:8px"><span class="muted">Notes:</span> ${esc(doc.notes)}</div>` : ''}
      </div>
      <div class="tot">
        <div><span>Subtotal</span><span>${money(Store.docSubtotal(doc))}</span></div>
        ${disc ? `<div><span>Discount</span><span>− ${money(disc)}</span></div>` : ''}
        <div><span>Taxable value</span><span>${money(Store.docTaxable(doc))}</span></div>
        ${splitRows || `<div><span>Tax</span><span>${money(Store.docTax(doc))}</span></div>`}
        ${ch ? `<div><span>Additional charges</span><span>${money(ch)}</span></div>` : ''}
        ${doc.roundOff ? `<div><span>Round off</span><span>${money(ro)}</span></div>` : ''}
        <div class="grand"><span>Total</span><span>${money(Store.docTotal(doc))}</span></div>
      </div>
    </div>
    <div class="words"><strong>Amount in words:</strong> ${esc(Store.amountInWords(Store.docTotal(doc)))}</div>
    <div class="foot">
      <div>Generated by Small Firm · ${fmtDate(today())}</div>
      <div>For ${esc(s.name)} — Authorised signatory</div>
    </div>
  </body></html>`;
};

window.Views.exportDocPdf = async function (doc) {
  try {
    const path = await window.api.exportPdf({ html: window.Views.docHtml(doc), filename: doc.number + '.pdf' });
    toast('Saved: ' + path);
  } catch (e) { toast('PDF export failed: ' + e.message, true); }
};

// ============================================================ payments
window.Views.payments = function (dir) {
  return function (view, actions, sub) {
    const isIn = dir === 'in';
    sub.textContent = isIn ? 'Money received from customers' : 'Money paid to suppliers';
    function draw() {
      actions.innerHTML = '';
      const b = el('button', { class: 'btn primary', text: '＋ Record Payment ' + (isIn ? 'In' : 'Out') });
      b.onclick = () => window.Views.paymentEditor(null, dir);
      actions.appendChild(b);

      view.innerHTML = '';
      const list = Store.data.payments.filter((p) => p.dir === dir).sort((a, b) => (a.date < b.date ? 1 : -1));
      if (!list.length) {
        view.appendChild(emptyState(isIn ? '⬇️' : '⬆️', 'No payments recorded', isIn ? 'Record money you receive from customers.' : 'Record money you pay to suppliers.', '＋ Record payment', () => window.Views.paymentEditor(null, dir)));
        return;
      }
      const wrap = el('div', { class: 'table-wrap' });
      wrap.innerHTML = `<table class="data"><thead><tr><th>Date</th><th>Party</th><th>Mode</th><th>Reference</th><th class="num">Amount</th><th></th></tr></thead><tbody>
        ${list.map((p) => `<tr><td class="nowrap">${fmtDate(p.date)}</td><td>${esc(p.partyName)}</td><td>${esc(p.mode || '—')}</td>
          <td class="muted">${esc(p.ref || p.notes || '—')}</td><td class="num"><strong>${money(p.amount)}</strong></td>
          <td><div class="row-actions"><button class="btn sm" data-e="${p.id}">Edit</button>
          <button class="btn sm danger" data-d="${p.id}">Delete</button></div></td></tr>`).join('')}
        <tr class="total-row"><td colspan="4">Total</td><td class="num">${money(list.reduce((s, p) => s + Number(p.amount || 0), 0))}</td><td></td></tr>
      </tbody></table>`;
      view.appendChild(wrap);
      $$('[data-e]', wrap).forEach((n) => (n.onclick = () => window.Views.paymentEditor(Store.data.payments.find((p) => p.id === Number(n.dataset.e)))));
      $$('[data-d]', wrap).forEach((n) => (n.onclick = async () => {
        if (await confirmDialog('Delete this payment?')) { await Store.deletePayment(Number(n.dataset.d)); toast('Deleted'); draw(); }
      }));
    }
    draw();
  };
};

window.Views.paymentEditor = function (payment, dir = 'in', presetPartyId, presetDocId, presetAmount) {
  const isNew = !payment;
  const p = payment ? { ...payment } : {
    id: 0, dir, date: today(), partyId: presetPartyId || 0, partyName: '', amount: presetAmount || 0,
    mode: 'Cash', ref: '', notes: '', accountId: Store.data.accounts[0] ? Store.data.accounts[0].id : 0, docId: presetDocId || 0
  };
  const meta = p.dir === 'in' ? 'Payment In' : 'Payment Out';
  const body = el('div');
  body.innerHTML = `
    <div class="grid-2 form">
      <div class="field"><label>Date</label><input id="p-date" type="date" value="${esc(p.date)}" /></div>
      <div class="field"><label>Amount</label><input id="p-amount" type="number" step="0.01" value="${p.amount}" /></div>
      <div class="field"><label>Party</label><select id="p-party"></select></div>
      <div class="field"><label>Payment mode</label><select id="p-mode">${PAY_METHODS.map((m) => `<option ${m === p.mode ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="field"><label>Deposit to</label><select id="p-account">${Store.data.accounts.map((a) => `<option value="${a.id}" ${a.id === p.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Against document (optional)</label><select id="p-doc"></select></div>
    </div>
    <div class="grid-2 form">
      <div class="field"><label>Reference</label><input id="p-ref" value="${esc(p.ref)}" placeholder="e.g. cheque no. / UPI id" /></div>
      <div class="field"><label>Notes</label><input id="p-notes" value="${esc(p.notes)}" /></div>
    </div>
    <div class="grid-3 form" id="p-cheque-row" style="display:none">
      <div class="field"><label>Cheque no.</label><input id="p-cheque-no" value="${esc(p.chequeNo || '')}" /></div>
      <div class="field"><label>Cheque date</label><input id="p-cheque-date" type="date" value="${esc(p.chequeDate || '')}" /></div>
      <div class="field"><label>Cheque status</label>
        <select id="p-cheque-status">${['Pending', 'Cleared', 'Bounced'].map((s) => `<option ${p.chequeStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    </div>`;

  const partySel = $('#p-party', body);
  const pool = Store.data.parties.filter((x) => p.dir === 'in' ? x.type !== 'supplier' : x.type === 'supplier');
  partySel.innerHTML = pool.length ? pool.map((x) => `<option value="${x.id}" ${x.id === p.partyId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')
    : '<option value="0">No party — add one first</option>';

  const docSel = $('#p-doc', body);
  function fillDocs() {
    const pid = Number(partySel.value);
    const open = Store.data.docs.filter((d) => d.partyId === pid && DOC_TYPES[d.type].posting
      && (d.type === 'invoice' || d.type === 'purchase_bill') && Store.docBalance(d) > 0);
    docSel.innerHTML = `<option value="0">— none —</option>` + open.map((d) => `<option value="${d.id}" ${d.id === p.docId ? 'selected' : ''}>${esc(d.number)} · due ${money(Store.docBalance(d))}</option>`).join('');
  }
  fillDocs();
  partySel.onchange = fillDocs;

  const modeSel = $('#p-mode', body);
  const chequeRow = $('#p-cheque-row', body);
  const syncCheque = () => { chequeRow.style.display = modeSel.value === 'Cheque' ? '' : 'none'; };
  modeSel.onchange = syncCheque;
  syncCheque();

  openModal({
    title: (isNew ? 'Record ' : 'Edit ') + meta,
    sub: 'Link a document to auto-update its paid amount.',
    body,
    width: 'narrow',
    actions: [
      { label: 'Cancel', onClick: (close) => close() },
      { label: 'Save', kind: 'primary', onClick: async (close) => {
        const amount = Number($('#p-amount', body).value);
        if (!amount || amount <= 0) return toast('Enter an amount', true);
        if (!Number(partySel.value)) return toast('Choose a party', true);
        const payload = {
          id: p.id, dir: p.dir,
          date: $('#p-date', body).value || today(),
          amount,
          partyId: Number(partySel.value),
          partyName: (Store.party(Number(partySel.value)) || {}).name || '',
          mode: $('#p-mode', body).value,
          ref: $('#p-ref', body).value,
          notes: $('#p-notes', body).value,
          accountId: Number($('#p-account', body).value),
          docId: Number(docSel.value) || 0,
          chequeNo: $('#p-cheque-no', body).value.trim(),
          chequeDate: $('#p-cheque-date', body).value,
          chequeStatus: $('#p-cheque-status', body).value
        };
        await Store.upsertPayment(payload);
        close(); toast(meta + ' saved'); window.Views.go(window.Views.current);
      } }
    ]
  });
};

// ============================================================ payment reminder
window.Views.remind = function (doc) {
  const party = Store.party(doc.partyId) || {};
  const due = Store.docBalance(doc);
  const s = Store.data.profile;
  const overdue = doc.dueDate && doc.dueDate < today();
  const msg = `Dear ${party.name || doc.partyName},\n\nThis is a gentle reminder that ${money(due)} is outstanding against invoice ${doc.number} dated ${fmtDate(doc.date)}`
    + `${doc.dueDate ? `, due on ${fmtDate(doc.dueDate)}${overdue ? ' (overdue)' : ''}` : ''}.\n\n`
    + `Kindly arrange the payment at your earliest convenience.\n\nThank you,\n${s.name}${s.phone ? '\n' + s.phone : ''}`;

  const body = el('div');
  body.innerHTML = `
    <div class="stat-line"><span>Party</span><span><strong>${esc(doc.partyName)}</strong></span></div>
    <div class="stat-line"><span>Invoice</span><span>${esc(doc.number)} · ${fmtDate(doc.date)}</span></div>
    <div class="stat-line"><span>Outstanding</span><span><strong>${money(due)}</strong></span></div>
    ${doc.dueDate ? `<div class="stat-line"><span>Due date</span><span>${fmtDate(doc.dueDate)}${overdue ? ' · overdue' : ''}</span></div>` : ''}
    <div class="field" style="margin-top:12px"><label>Message</label>
      <textarea id="remind-text" rows="9">${esc(msg)}</textarea></div>`;

  openModal({
    title: 'Payment reminder',
    sub: 'Copy this message or export it as a PDF to send to the party.',
    width: 'narrow',
    body,
    actions: [
      { label: 'Close', onClick: (close) => close() },
      { label: 'Copy message', icon: 'clipboard', onClick: async () => {
        try { await navigator.clipboard.writeText($('#remind-text', body).value); toast('Copied to clipboard'); }
        catch { toast('Copy failed — select the text manually', true); }
      } },
      { label: 'Export PDF', icon: 'printer', kind: 'primary', onClick: async () => {
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;padding:26px;font-size:13px;color:#1F2137;white-space:pre-wrap}</style></head><body>${esc($('#remind-text', body).value)}</body></html>`;
        try { const p = await window.api.exportPdf({ html, filename: 'Reminder-' + doc.number + '.pdf' }); toast('Saved: ' + p); }
        catch (e) { toast('Export failed: ' + e.message, true); }
      } }
    ]
  });
};

// ============================================================ expenses / income
window.Views.expenses = function (view, actions, sub) {
  sub.textContent = 'Track your business spending';
  function draw() {
    actions.innerHTML = '';
    const b = el('button', { class: 'btn primary', text: '＋ Record Expense' });
    b.onclick = () => window.Views.expenseEditor(null);
    actions.appendChild(b);
    view.innerHTML = '';
    const list = Store.data.expenses.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!list.length) {
      view.appendChild(emptyState('💸', 'No expenses yet', 'Record rent, salaries, bills and more.', '＋ Record expense', () => window.Views.expenseEditor(null)));
      return;
    }
    const wrap = el('div', { class: 'table-wrap' });
    wrap.innerHTML = `<table class="data"><thead><tr><th>Date</th><th>Category</th><th>Notes</th><th>Mode</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${list.map((e) => `<tr><td class="nowrap">${fmtDate(e.date)}</td><td>${esc(e.category || '—')}</td><td class="muted">${esc(e.notes || '')}</td>
        <td>${esc(e.mode || '—')}</td><td class="num"><strong>${money(e.amount)}</strong></td>
        <td><div class="row-actions"><button class="btn sm" data-e="${e.id}">Edit</button>
        <button class="btn sm danger" data-d="${e.id}">Delete</button></div></td></tr>`).join('')}
      <tr class="total-row"><td colspan="4">Total</td><td class="num">${money(list.reduce((s, e) => s + Number(e.amount || 0), 0))}</td><td></td></tr>
    </tbody></table>`;
    view.appendChild(wrap);
    $$('[data-e]', wrap).forEach((n) => (n.onclick = () => window.Views.expenseEditor(Store.data.expenses.find((e) => e.id === Number(n.dataset.e)))));
    $$('[data-d]', wrap).forEach((n) => (n.onclick = async () => {
      if (await confirmDialog('Delete this expense?')) { await Store.deleteExpense(Number(n.dataset.d)); toast('Deleted'); draw(); }
    }));
  }
  draw();
};

window.Views.expenseEditor = function (expense) {
  const isNew = !expense;
  const e = expense ? { ...expense } : { id: 0, date: today(), category: EXPENSE_CATEGORIES[0], amount: 0, notes: '', mode: 'Cash', accountId: Store.data.accounts[0] ? Store.data.accounts[0].id : 0 };
  const body = el('div');
  body.innerHTML = `
    <div class="grid-2 form">
      <div class="field"><label>Date</label><input id="e-date" type="date" value="${esc(e.date)}" /></div>
      <div class="field"><label>Amount</label><input id="e-amount" type="number" step="0.01" value="${e.amount}" /></div>
      <div class="field"><label>Category</label><select id="e-cat">${EXPENSE_CATEGORIES.map((c) => `<option ${c === e.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Paid from</label><select id="e-account">${Store.data.accounts.map((a) => `<option value="${a.id}" ${a.id === e.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
    </div>
    <div class="grid-2 form">
      <div class="field"><label>Mode</label><select id="e-mode">${PAY_METHODS.map((m) => `<option ${m === e.mode ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="field"><label>Notes</label><input id="e-notes" value="${esc(e.notes)}" /></div>
    </div>`;
  openModal({
    title: isNew ? 'Record Expense' : 'Edit Expense', body, width: 'narrow',
    actions: [
      { label: 'Cancel', onClick: (close) => close() },
      { label: 'Save', kind: 'primary', onClick: async (close) => {
        const amount = Number($('#e-amount', body).value);
        if (!amount || amount <= 0) return toast('Enter an amount', true);
        await Store.upsertExpense({
          id: e.id, date: $('#e-date', body).value || today(), amount,
          category: $('#e-cat', body).value, mode: $('#e-mode', body).value,
          accountId: Number($('#e-account', body).value), notes: $('#e-notes', body).value
        });
        close(); toast('Expense saved'); window.Views.go(window.Views.current);
      } }
    ]
  });
};

window.Views.income = function (view, actions, sub) {
  sub.textContent = 'Income other than sales';
  function draw() {
    actions.innerHTML = '';
    const b = el('button', { class: 'btn primary', text: '＋ Add Income' });
    b.onclick = () => window.Views.incomeEditor(null);
    actions.appendChild(b);
    view.innerHTML = '';
    const list = Store.data.otherIncome.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!list.length) {
      view.appendChild(emptyState('💰', 'No other income', 'Interest, rent received, and similar.', '＋ Add income', () => window.Views.incomeEditor(null)));
      return;
    }
    const wrap = el('div', { class: 'table-wrap' });
    wrap.innerHTML = `<table class="data"><thead><tr><th>Date</th><th>Source</th><th>Notes</th><th class="num">Amount</th><th></th></tr></thead><tbody>
      ${list.map((o) => `<tr><td class="nowrap">${fmtDate(o.date)}</td><td>${esc(o.source || '—')}</td><td class="muted">${esc(o.notes || '')}</td>
        <td class="num"><strong>${money(o.amount)}</strong></td>
        <td><div class="row-actions"><button class="btn sm" data-e="${o.id}">Edit</button>
        <button class="btn sm danger" data-d="${o.id}">Delete</button></div></td></tr>`).join('')}
    </tbody></table>`;
    view.appendChild(wrap);
    $$('[data-e]', wrap).forEach((n) => (n.onclick = () => window.Views.incomeEditor(Store.data.otherIncome.find((o) => o.id === Number(n.dataset.e)))));
    $$('[data-d]', wrap).forEach((n) => (n.onclick = async () => {
      if (await confirmDialog('Delete this entry?')) { await Store.deleteIncome(Number(n.dataset.d)); toast('Deleted'); draw(); }
    }));
  }
  draw();
};

window.Views.incomeEditor = function (income) {
  const isNew = !income;
  const o = income ? { ...income } : { id: 0, date: today(), source: '', amount: 0, notes: '', accountId: Store.data.accounts[0] ? Store.data.accounts[0].id : 0 };
  const body = el('div');
  body.innerHTML = `
    <div class="grid-2 form">
      <div class="field"><label>Date</label><input id="o-date" type="date" value="${esc(o.date)}" /></div>
      <div class="field"><label>Amount</label><input id="o-amount" type="number" step="0.01" value="${o.amount}" /></div>
      <div class="field"><label>Source</label><input id="o-source" value="${esc(o.source)}" placeholder="e.g. Interest, Rent received" /></div>
      <div class="field"><label>Deposit to</label><select id="o-account">${Store.data.accounts.map((a) => `<option value="${a.id}" ${a.id === o.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Notes</label><input id="o-notes" value="${esc(o.notes)}" /></div>`;
  openModal({
    title: isNew ? 'Add Other Income' : 'Edit Income', body, width: 'narrow',
    actions: [
      { label: 'Cancel', onClick: (close) => close() },
      { label: 'Save', kind: 'primary', onClick: async (close) => {
        const amount = Number($('#o-amount', body).value);
        if (!amount || amount <= 0) return toast('Enter an amount', true);
        await Store.upsertIncome({
          id: o.id, date: $('#o-date', body).value || today(), amount,
          source: $('#o-source', body).value, notes: $('#o-notes', body).value,
          accountId: Number($('#o-account', body).value)
        });
        close(); toast('Saved'); window.Views.go(window.Views.current);
      } }
    ]
  });
};

// ============================================================ banking
window.Views.banking = function (view, actions, sub) {
  sub.textContent = 'Cash and bank accounts';
  function draw() {
    actions.innerHTML = '';
    const b = el('button', { class: 'btn primary', text: '＋ Add Account' });
    b.onclick = () => window.Views.accountEditor(null);
    actions.appendChild(b);

    view.innerHTML = '';
    const cards = el('div', { class: 'cards' });
    Store.data.accounts.forEach((a) => {
      const c = el('div', { class: 'card' });
      c.appendChild(el('div', { class: 'glyph', text: a.type === 'bank' ? '🏦' : '💵' }));
      c.appendChild(el('div', { class: 'value', text: money(Store.accountBalance(a.id)) }));
      c.appendChild(el('div', { class: 'label', text: a.name + (a.accountNumber ? ' · ' + a.accountNumber : '') }));
      const acts = el('div', { style: 'margin-top:10px;display:flex;gap:6px' });
      const e1 = el('button', { class: 'btn sm', text: 'Edit' }); e1.onclick = () => window.Views.accountEditor(a);
      const e2 = el('button', { class: 'btn sm danger', text: 'Delete' }); e2.onclick = async () => {
        if (await confirmDialog('Delete this account?')) { await Store.deleteAccount(a.id); toast('Deleted'); draw(); }
      };
      acts.appendChild(e1); acts.appendChild(e2); c.appendChild(acts);
      cards.appendChild(c);
    });
    view.appendChild(cards);

    const panel = el('div', { class: 'panel' });
    panel.appendChild(el('div', { class: 'panel-head' }, [el('h2', { text: 'Recent money movements' })]));
    const pb = el('div', { class: 'panel-body' });
    const moves = [];
    Store.data.payments.forEach((p) => moves.push({ date: p.date, desc: (p.dir === 'in' ? 'Payment in from ' : 'Payment out to ') + p.partyName, amount: (p.dir === 'in' ? 1 : -1) * Number(p.amount || 0) }));
    Store.data.expenses.forEach((e) => moves.push({ date: e.date, desc: 'Expense · ' + (e.category || ''), amount: -Number(e.amount || 0) }));
    Store.data.otherIncome.forEach((o) => moves.push({ date: o.date, desc: 'Income · ' + (o.source || ''), amount: Number(o.amount || 0) }));
    moves.sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!moves.length) pb.appendChild(emptyState('💳', 'No movements yet', 'Payments and expenses will appear here.'));
    else {
      const wrap = el('div', { class: 'table-wrap', style: 'box-shadow:none;max-height:40vh' });
      wrap.innerHTML = `<table class="data"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th></tr></thead><tbody>
        ${moves.slice(0, 40).map((m) => `<tr><td class="nowrap">${fmtDate(m.date)}</td><td>${esc(m.desc)}</td>
          <td class="num">${money(m.amount)}</td></tr>`).join('')}</tbody></table>`;
      pb.appendChild(wrap);
    }
    panel.appendChild(pb);
    view.appendChild(panel);
  }
  draw();
};

window.Views.accountEditor = function (account) {
  const isNew = !account;
  const a = account ? { ...account } : { id: 0, name: '', type: 'bank', opening: 0, accountNumber: '', ifsc: '' };
  const body = el('div');
  body.innerHTML = `
    <div class="field"><label>Account name</label><input id="a-name" value="${esc(a.name)}" placeholder="e.g. HDFC Current" /></div>
    <div class="grid-2 form">
      <div class="field"><label>Type</label><select id="a-type">
        <option value="bank" ${a.type === 'bank' ? 'selected' : ''}>Bank</option>
        <option value="cash" ${a.type === 'cash' ? 'selected' : ''}>Cash</option></select></div>
      <div class="field"><label>Opening balance</label><input id="a-opening" type="number" step="0.01" value="${a.opening}" /></div>
    </div>
    <div class="grid-2 form">
      <div class="field"><label>Account number</label><input id="a-num" value="${esc(a.accountNumber || '')}" /></div>
      <div class="field"><label>IFSC</label><input id="a-ifsc" value="${esc(a.ifsc || '')}" /></div>
    </div>`;
  openModal({
    title: isNew ? 'Add Account' : 'Edit Account', body, width: 'narrow',
    actions: [
      { label: 'Cancel', onClick: (close) => close() },
      { label: 'Save', kind: 'primary', onClick: async (close) => {
        const name = $('#a-name', body).value.trim();
        if (!name) return toast('Name is required', true);
        await Store.upsertAccount({
          id: a.id, name, type: $('#a-type', body).value,
          opening: Number($('#a-opening', body).value) || 0,
          accountNumber: $('#a-num', body).value.trim(), ifsc: $('#a-ifsc', body).value.trim()
        });
        close(); toast('Saved'); window.Views.go('banking');
      } }
    ]
  });
};
