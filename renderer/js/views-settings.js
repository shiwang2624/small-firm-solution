'use strict';
window.Views = window.Views || {};

// ============================================================ business settings
window.Views.settings = function (view, actions, sub) {
  sub.textContent = 'Your business details and preferences';
  actions.innerHTML = '';
  const p = Store.data.profile;

  function draw() {
    view.innerHTML = '';
    const panel = el('div', { class: 'panel' });
    panel.appendChild(el('div', { class: 'panel-head' }, [el('h2', { text: 'Business profile' })]));
    const body = el('div', { class: 'panel-body' });
    body.innerHTML = `
      <div class="grid-2 form">
        <div class="field"><label>Business name</label><input id="s-name" value="${esc(p.name)}" /></div>
        <div class="field"><label>GSTIN</label><input id="s-gstin" value="${esc(p.gstin || '')}" placeholder="15-character GSTIN" />
          <span class="hint" id="s-gstin-hint"></span></div>
        <div class="field"><label>Phone</label><input id="s-phone" value="${esc(p.phone || '')}" /></div>
        <div class="field"><label>Email</label><input id="s-email" value="${esc(p.email || '')}" /></div>
        <div class="field"><label>State (for GST)</label>
          <select id="s-state">
            <option value="">— select —</option>
            ${Store.states().map((s) => `<option value="${s.code}" ${String(p.stateCode || '') === s.code ? 'selected' : ''}>${s.code} · ${esc(s.name)}</option>`).join('')}
          </select>
          <span class="hint">Used to decide IGST vs CGST/SGST on invoices</span></div>
      </div>
      <div class="field"><label>Address</label><textarea id="s-address" rows="2">${esc(p.address || '')}</textarea></div>
      <div class="grid-3 form">
        <div class="field"><label>Currency symbol</label><input id="s-currency" value="${esc(p.currency || '₹')}" /></div>
        <div class="field"><label>Default tax %</label><input id="s-tax" type="number" step="0.01" value="${Store.data.tax.defaultTax}" /></div>
        <div class="field"><label>Financial year starts (MM-DD)</label><input id="s-fy" value="${esc(p.fyStart || '04-01')}" /></div>
      </div>
      <div class="grid-3 form">
        <div class="field"><label>Invoice prefix</label><input id="s-inv" value="${esc(p.invoicePrefix || 'INV')}" /></div>
        <div class="field"><label>Purchase prefix</label><input id="s-pur" value="${esc(p.purchasePrefix || 'PUR')}" /></div>
        <div class="field"><label>Estimate prefix</label><input id="s-est" value="${esc(p.estimatePrefix || 'EST')}" /></div>
      </div>
      <button class="btn primary" id="s-save" style="margin-top:6px">Save settings</button>`;
    const gstinIn = body.querySelector('#s-gstin');
    const gstinHint = body.querySelector('#s-gstin-hint');
    function checkGstin() {
      const v = gstinIn.value.trim().toUpperCase();
      if (!v) { gstinHint.textContent = 'Leave blank if you are not GST-registered.'; gstinIn.classList.remove('invalid'); return true; }
      const ok = Store.isValidGstin(v);
      gstinIn.classList.toggle('invalid', !ok);
      gstinHint.textContent = ok ? 'Valid GSTIN · ' + Store.stateName(Store.gstinStateCode(v)) : 'Not a valid GSTIN (format or check digit).';
      if (ok) {
        const code = Store.gstinStateCode(v);
        const sel = body.querySelector('#s-state');
        if (code && sel) sel.value = code;
      }
      return ok;
    }
    gstinIn.addEventListener('input', checkGstin);
    checkGstin();

    body.querySelector('#s-save').onclick = async () => {
      Store.data.profile = {
        ...p,
        name: $('#s-name', body).value.trim() || 'My Business',
        gstin: $('#s-gstin', body).value.trim().toUpperCase(),
        stateCode: $('#s-state', body).value,
        phone: $('#s-phone', body).value.trim(),
        email: $('#s-email', body).value.trim(),
        address: $('#s-address', body).value.trim(),
        currency: $('#s-currency', body).value.trim() || '₹',
        fyStart: $('#s-fy', body).value.trim() || '04-01',
        invoicePrefix: $('#s-inv', body).value.trim() || 'INV',
        purchasePrefix: $('#s-pur', body).value.trim() || 'PUR',
        estimatePrefix: $('#s-est', body).value.trim() || 'EST'
      };
      DOC_TYPES.invoice.prefix = Store.data.profile.invoicePrefix;
      DOC_TYPES.purchase_bill.prefix = Store.data.profile.purchasePrefix;
      DOC_TYPES.estimate.prefix = Store.data.profile.estimatePrefix;
      Store.data.tax.defaultTax = Number($('#s-tax', body).value) || 0;
      await Store.saveNow();
      toast('Settings saved');
      window.Views.refreshChrome();
    };
    panel.appendChild(body);
    view.appendChild(panel);

    // units
    const upanel = el('div', { class: 'panel', style: 'margin-top:16px' });
    upanel.appendChild(el('div', { class: 'panel-head' }, [el('h2', { text: 'Units of measurement' })]));
    const ub = el('div', { class: 'panel-body' });
    ub.innerHTML = `<div class="pill-row">${Store.data.units.map((u) => `<span class="pill">${esc(u)}</span>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:12px;max-width:420px">
        <input id="u-new" placeholder="Add a unit, e.g. DOZEN" />
        <button class="btn" id="u-add">Add</button></div>`;
    ub.querySelector('#u-add').onclick = async () => {
      const v = $('#u-new', ub).value.trim().toUpperCase();
      if (!v) return;
      if (!Store.data.units.includes(v)) Store.data.units.push(v);
      await Store.saveNow(); toast('Unit added'); draw();
    };
    upanel.appendChild(ub);
    view.appendChild(upanel);

    const dpath = el('p', { class: 'muted', style: 'margin-top:16px' });
    view.appendChild(dpath);
    window.api.dataPath().then((f) => { dpath.textContent = 'Data file: ' + f; });
  }
  draw();
};

// ============================================================ firms
window.Views.firms = function (view, actions, sub) {
  sub.textContent = 'Keep separate books for separate businesses';
  function draw() {
    actions.innerHTML = '';
    const b = el('button', { class: 'btn primary', text: '＋ New Firm' });
    b.onclick = () => firmEditor(null);
    actions.appendChild(b);

    view.innerHTML = '';
    const wrap = el('div', { class: 'table-wrap' });
    wrap.innerHTML = `<table class="data"><thead><tr><th>Firm</th><th>Created</th><th>Documents</th><th></th></tr></thead><tbody>
      ${Store.firms.map((f) => {
        const active = Store.firm && f.id === Store.firm.id;
        return `<tr>
          <td>${esc(f.name)} ${active ? '<span class="badge info">current</span>' : ''}</td>
          <td class="muted">${f.createdAt ? fmtDate(f.createdAt.slice(0, 10)) : '—'}</td>
          <td class="muted">${active ? Store.data.docs.length : ''}</td>
          <td><div class="row-actions">
            ${active ? '' : `<button class="btn sm" data-sw="${f.id}">Switch</button>`}
            <button class="btn sm" data-rn="${f.id}">Rename</button>
            <button class="btn sm danger" data-del="${f.id}">Delete</button></div></td></tr>`;
      }).join('')}
    </tbody></table>`;
    view.appendChild(wrap);

    $$('[data-sw]', wrap).forEach((n) => (n.onclick = async () => {
      await Store.switchFirm(n.dataset.sw); toast('Switched firm'); window.Views.refreshChrome(); window.Views.go('dashboard');
    }));
    $$('[data-rn]', wrap).forEach((n) => (n.onclick = () => {
      const f = Store.firms.find((x) => x.id === n.dataset.rn);
      firmEditor(f);
    }));
    $$('[data-del]', wrap).forEach((n) => (n.onclick = async () => {
      if (Store.firms.length <= 1) return toast('You need at least one firm', true);
      const f = Store.firms.find((x) => x.id === n.dataset.del);
      if (await confirmDialog(`Delete “${f.name}” and all its data? This cannot be undone.`)) {
        await Store.deleteFirm(f.id); toast('Firm deleted'); window.Views.refreshChrome(); draw();
      }
    }));
  }
  draw();
};

function firmEditor(firm) {
  const isNew = !firm;
  const f = firm ? { ...firm } : { id: '', name: '' };
  const body = el('div');
  body.innerHTML = `<div class="field"><label>Firm / business name</label><input id="f-name" value="${esc(f.name)}" placeholder="e.g. Sharma Traders" />
    <span class="hint">Each firm keeps its own parties, items, documents and books.</span></div>`;
  openModal({
    title: isNew ? 'New Firm' : 'Rename Firm', width: 'narrow', body,
    actions: [
      { label: 'Cancel', onClick: (close) => close() },
      { label: isNew ? 'Create' : 'Save', kind: 'primary', onClick: async (close) => {
        const name = $('#f-name', body).value.trim();
        if (!name) return toast('Name is required', true);
        if (isNew) { await Store.createFirm(name); toast('Firm created'); }
        else { await Store.renameFirm(f.id, name); toast('Renamed'); }
        close(); window.Views.refreshChrome(); window.Views.go('firms');
      } }
    ]
  });
}

// ============================================================ backup
window.Views.backup = function (view, actions, sub) {
  sub.textContent = 'Keep a copy of your books, or restore from one';
  actions.innerHTML = '';
  view.innerHTML = '';

  const exportPanel = el('div', { class: 'panel' });
  exportPanel.appendChild(el('div', { class: 'panel-head' }, [el('h2', { text: 'Backup' })]));
  const eb = el('div', { class: 'panel-body' });
  eb.appendChild(el('p', { class: 'muted', text: 'Export every firm and all its data into a single JSON file you can keep safe.' }));
  const ebBtn = el('button', { class: 'btn primary', text: '⬇️ Export backup…' });
  ebBtn.onclick = async () => {
    try { const path = await window.api.backupExport(); if (path) toast('Backup saved: ' + path); }
    catch (e) { toast('Export failed: ' + e.message, true); }
  };
  eb.appendChild(ebBtn);
  exportPanel.appendChild(eb);
  view.appendChild(exportPanel);

  const importPanel = el('div', { class: 'panel', style: 'margin-top:16px' });
  importPanel.appendChild(el('div', { class: 'panel-head' }, [el('h2', { text: 'Restore' })]));
  const ib = el('div', { class: 'panel-body' });
  ib.appendChild(el('p', { class: 'muted', text: 'Import a previously exported backup. Firms are added alongside your existing ones.' }));
  const ibBtn = el('button', { class: 'btn', text: '⬆️ Restore from backup…' });
  ibBtn.onclick = async () => {
    try {
      const res = await window.api.backupImport();
      if (res && res.added) { await Store.refreshFirms(); toast(`Restored ${res.added} firm(s)`); window.Views.refreshChrome(); }
    } catch (e) { toast('Restore failed: ' + e.message, true); }
  };
  ib.appendChild(ibBtn);
  importPanel.appendChild(ib);
  view.appendChild(importPanel);
};

// ============================================================ help
window.Views.help = function () {
  const body = el('div');
  body.innerHTML = `
    <p class="muted" style="margin-top:0">Small Firm keeps everything on this Mac — no account, no cloud. Here’s how to get around:</p>
    <div class="help-grid">
      <div><span class="k">⌘K</span> — search everything</div>
      <div><span class="k">⌘N</span> — new document</div>
      <div><span class="k">⌘1…⌘9</span> — jump between sections</div>
      <div><span class="k">Esc</span> — close a dialog</div>
      <div><span class="k">⌘S</span> — save the current form</div>
      <div><span class="k">⌘P</span> — export the open document</div>
    </div>
    <div class="section-title">Everyday flow</div>
    <ol class="muted" style="font-size:13px;line-height:1.7;padding-left:18px;margin:0">
      <li>Add your <strong>parties</strong> (customers &amp; suppliers).</li>
      <li>Add your <strong>items</strong> with sale rate and tax.</li>
      <li>Create an <strong>invoice</strong> — totals &amp; GST are automatic.</li>
      <li>Record a <strong>payment</strong> against it to clear the balance.</li>
      <li>Log <strong>expenses</strong> to see a true profit in Reports.</li>
      <li>Use <strong>Backup</strong> now and then to stay safe.</li>
    </ol>
    <div class="section-title">Where things live</div>
    <p class="muted" style="font-size:13px;margin:0">Exports and PDFs go to <strong>Documents/Small Firm</strong>. Your data lives in the app’s support folder (see Business Settings).</p>`;
  openModal({ title: 'Help & keyboard shortcuts', width: 'wide', body, actions: [{ label: 'Got it', kind: 'primary', onClick: (close) => close() }] });
};
