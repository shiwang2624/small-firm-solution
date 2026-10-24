'use strict';
window.Views = window.Views || {};

// ============================================================ code helpers
function normalizeCode(raw) {
  return String(raw || '').replace(/[\s\-]/g, '').trim();
}

function itemCode(item) {
  return item.barcode || item.sku || ('SF' + String(item.id).padStart(5, '0'));
}

function isValidEAN13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

function isValidUPC(code) {
  if (!/^\d{12}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += Number(code[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(code[11]);
}

// Pick the most sensible 1D barcode symbology for a code
// (EAN-13 / UPC / EAN-8 when the digits are valid, otherwise CODE128).
function barcodeFormatFor(code) {
  if (isValidEAN13(code)) return 'EAN13';
  if (isValidUPC(code)) return 'UPC';
  if (/^\d{8}$/.test(code)) return 'EAN8';
  if (/^[0-9A-Za-z\-\.\$\/\+\% ]+$/.test(code)) return 'CODE128';
  return 'CODE128';
}

// Render a real 1D barcode to an SVG string.
function barcodeSvg(code, opts = {}) {
  const format = opts.format || barcodeFormatFor(code);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const tryRender = (fmt) => {
    // eslint-disable-next-line no-undef
    JsBarcode(svg, String(code), {
      format: fmt,
      width: opts.width || 2,
      height: opts.height || 52,
      displayValue: opts.displayValue !== false,
      fontSize: opts.fontSize || 13,
      margin: opts.margin != null ? opts.margin : 6,
      background: '#ffffff',
      lineColor: '#000000'
    });
  };
  try {
    tryRender(format);
  } catch (e) {
    try { svg.innerHTML = ''; tryRender('CODE128'); }
    catch (e2) { return `<div style="font-size:10px;color:#c00">barcode error: ${esc(code)}</div>`; }
  }
  return svg.outerHTML;
}

function qrSvg(text, cellSize = 3, margin = 2) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(String(text));
    qr.make();
    return qr.createSvgTag({ cellSize, margin });
  } catch (e) {
    return '<div style="font-size:10px;color:#c00">QR error</div>';
  }
}

function findItemByCode(code) {
  const c = normalizeCode(code);
  if (!c) return null;
  return Store.data.items.find((i) =>
    normalizeCode(i.barcode) === c || normalizeCode(i.sku) === c || normalizeCode(itemCode(i)) === c) || null;
}

// ============================================================ hardware scan field
// USB/HID barcode scanners act as keyboards: they type the code then press Enter.
// This is how desktop billing apps take barcode input.
function attachScanField(input, onCode) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      const code = normalizeCode(input.value);
      if (!code) return;
      input.value = '';
      onCode(code);
    }
  });
  // Some scanners send a Tab instead of Enter
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const code = normalizeCode(input.value);
      if (code && code.length >= 6) { e.preventDefault(); input.value = ''; onCode(code); }
    }
  });
}

function handleScannedCode(code) {
  const found = findItemByCode(code);
  if (found) { toast('Found: ' + found.name); window.Views.itemEditor(found); }
  else { toast('New code ' + code + ' — enter the product details'); window.Views.itemEditor(null, code); }
}

// ============================================================ camera scanner
window.Views.scanCode = function (opts = {}) {
  const body = el('div');
  body.innerHTML = `
    <div id="scan-wrap" style="position:relative;background:#111;border-radius:10px;overflow:hidden;min-height:250px;display:grid;place-items:center">
      <video id="scan-video" autoplay playsinline muted style="width:100%;max-height:44vh;object-fit:cover"></video>
      <div id="scan-hint" style="position:absolute;color:#fff;font-size:13px;text-align:center;padding:0 20px">
        Starting camera…
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn" id="scan-capture">${iconSvg('camera', 14)} Capture frame</button>
      <span class="muted" style="font-size:12px;align-self:center">Point at the printed barcode (EAN/UPC) or QR code</span>
    </div>
    <div class="field" style="margin-top:10px"><label>Or type / paste the code</label>
      <div style="display:flex;gap:8px">
        <input id="scan-manual" placeholder="e.g. 8901234567890" />
        <button class="btn primary" id="scan-manual-go" style="white-space:nowrap">Use code</button>
      </div>
    </div>
    <p class="muted" style="font-size:11.5px;margin:8px 0 0">
      Tip: a USB barcode scanner works too — click the Items screen, scan, and the code lands straight in.
    </p>`;

  let reader = null, controls = null, stopped = false, video = null;

  function stop() {
    stopped = true;
    try { if (controls && controls.stop) controls.stop(); } catch {}
    try { if (reader && reader.reset) reader.reset(); } catch {}
  }
  function finish(code) {
    stop();
    modal.close();
    opts.onDetect && opts.onDetect(code);
  }

  const modal = openModal({
    title: 'Scan barcode / QR',
    sub: 'Reads EAN-13, EAN-8, UPC, Code-128, Code-39, ITF and QR.',
    body,
    actions: [{ label: 'Cancel', onClick: (close) => { stop(); close(); } }],
    onMount: async (box) => {
      video = $('#scan-video', box);
      const hint = $('#scan-hint', box);

      $('#scan-manual-go', box).onclick = () => {
        const v = normalizeCode($('#scan-manual', box).value);
        if (!v) return toast('Enter a code first', true);
        finish(v);
      };
      $('#scan-manual', box).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); $('#scan-manual-go', box).click(); }
      });

      try {
        const allowed = window.api.askCamera ? await window.api.askCamera() : true;
        if (!allowed) { hint.textContent = 'Camera blocked — allow it in System Settings → Privacy & Security → Camera, or type the code below.'; return; }
      } catch {}

      if (typeof ZXing === 'undefined') { hint.textContent = 'Scanner library missing — type the code below.'; return; }

      try {
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
          ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
          ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.CODE_39,
          ZXing.BarcodeFormat.CODE_93, ZXing.BarcodeFormat.ITF,
          ZXing.BarcodeFormat.CODABAR, ZXing.BarcodeFormat.QR_CODE
        ]);
        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
        reader = new ZXing.BrowserMultiFormatReader(hints, 120);

        hint.textContent = 'Looking for a barcode…';
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
          video,
          (result, err) => {
            if (stopped) return;
            if (result) { hint.textContent = 'Found: ' + result.getText(); finish(result.getText()); }
            else if (err && err.name === 'NotAllowedError') hint.textContent = 'Camera blocked — type the code below.';
          }
        );
      } catch (e) {
        hint.textContent = 'Camera unavailable (' + (e && e.name ? e.name : 'error') + '). Type the code below.';
      }

      // still-frame fallback: helps with small or awkwardly angled 1D barcodes
      $('#scan-capture', box).onclick = async () => {
        if (!reader || !video || !video.videoWidth) return toast('Camera not ready', true);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL('image/png');
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
          const res = await reader.decodeFromImageElement(img);
          if (res && res.getText()) { hint.textContent = 'Found: ' + res.getText(); finish(res.getText()); }
          else toast('No code found in that frame — try again', true);
        } catch (e) {
          toast('No code found in that frame — try again', true);
        }
      };
    }
  });

  const origClose = modal.close;
  modal.close = function () { stop(); origClose(); };
};

// ============================================================ item editor
window.Views.itemEditor = function (item, presetBarcode) {
  const isNew = !item;
  const it = item ? { ...item } : {
    id: 0, name: '', categoryId: 0, unit: 'PCS', hsn: '',
    saleRate: 0, purchaseRate: 0, taxPercent: (Store.data.tax.defaultTax || 0),
    openingStock: 0, lowStock: 0, barcode: presetBarcode || '', sku: ''
  };
  it.barcode = it.barcode || '';

  const body = el('div');
  body.innerHTML = `
    <div class="field"><label>Item name *</label><input id="i-name" value="${esc(it.name)}" placeholder="e.g. Parle-G Biscuit 100g" /></div>
    <div class="grid-2 form">
      <div class="field"><label>Category</label>
        <select id="i-cat">
          <option value="0">— none —</option>
          ${Store.data.categories.map((c) => `<option value="${c.id}" ${c.id === it.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Unit</label>
        <select id="i-unit">${Store.data.units.map((u) => `<option ${u === it.unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="grid-3 form">
      <div class="field"><label>Sale rate</label><input id="i-sale" type="number" step="0.01" value="${it.saleRate}" /></div>
      <div class="field"><label>Purchase rate</label><input id="i-purchase" type="number" step="0.01" value="${it.purchaseRate}" /></div>
      <div class="field"><label>Tax %</label><input id="i-tax" type="number" step="0.01" value="${it.taxPercent}" /></div>
    </div>
    <div class="grid-3 form">
      <div class="field"><label>HSN / SAC</label><input id="i-hsn" value="${esc(it.hsn || '')}" /></div>
      <div class="field"><label>Opening stock</label><input id="i-stock" type="number" step="1" value="${it.openingStock}" /></div>
      <div class="field"><label>Low-stock alert at</label><input id="i-low" type="number" step="1" value="${it.lowStock}" />
        <span class="hint">Warn me when stock drops to this</span></div>
    </div>
    <div class="grid-3 form">
      <div class="field"><label>Batch no.</label><input id="i-batch" value="${esc(it.batch || '')}" placeholder="optional" /></div>
      <div class="field"><label>Expiry date</label><input id="i-expiry" type="date" value="${esc(it.expiry || '')}" /></div>
      <div class="field"><label>Godown / location</label><input id="i-godown" value="${esc(it.godown || '')}" placeholder="e.g. Main store" /></div>
    </div>
    <div class="field">
      <label>Barcode (the code printed on the pack)</label>
      <div style="display:flex;gap:8px">
        <input id="i-barcode" value="${esc(it.barcode)}" placeholder="Scan the pack, or type it — e.g. 8901234567890" style="flex:1" />
        <button class="btn" id="i-barcode-menu" title="Barcode options">Barcode ${iconSvg('chevronDown', 12)}</button>
      </div>
      <span class="hint" id="i-barcode-hint"></span>
    </div>`;

  const hintEl = $('#i-barcode-hint', body);
  const refreshHint = () => {
    const c = normalizeCode($('#i-barcode', body).value);
    if (!c) { hintEl.textContent = 'Leave blank to auto-generate an internal code.'; return; }
    const fmt = barcodeFormatFor(c);
    hintEl.textContent = 'Will print as ' + fmt + (fmt === 'CODE128' ? ' (works for any code)' : '') + '.';
  };
  setTimeout(refreshHint, 30);

  const actions = [{ label: 'Cancel', onClick: (close) => close() }];
  if (!isNew) actions.push({ label: 'Barcode label', icon: 'barcode', onClick: () => window.Views.itemLabel(it) });
  actions.push({ label: isNew ? 'Add item' : 'Save changes', kind: 'primary', onClick: async (close) => {
    const name = $('#i-name', body).value.trim();
    if (!name) { toast('Item name is required', true); $('#i-name', body).focus(); return; }

    const barcode = normalizeCode($('#i-barcode', body).value);
    if (barcode) {
      const dup = Store.data.items.find((x) => x.id !== it.id && normalizeCode(x.barcode) === barcode);
      if (dup) { toast('That code is already used by “' + dup.name + '”', true); return; }
    }

    const payload = {
      ...it,
      name,
      categoryId: Number($('#i-cat', body).value) || 0,
      unit: $('#i-unit', body).value,
      saleRate: Number($('#i-sale', body).value) || 0,
      purchaseRate: Number($('#i-purchase', body).value) || 0,
      taxPercent: Number($('#i-tax', body).value) || 0,
      hsn: $('#i-hsn', body).value.trim(),
      openingStock: Number($('#i-stock', body).value) || 0,
      lowStock: Number($('#i-low', body).value) || 0,
      batch: $('#i-batch', body).value.trim(),
      expiry: $('#i-expiry', body).value,
      godown: $('#i-godown', body).value.trim(),
      barcode
    };
    if (!payload.sku) payload.sku = barcode || ('SF' + String(payload.id || Date.now()).slice(-5));
    await Store.upsertItem(payload);
    close();
    toast(isNew ? 'Item added' : 'Item saved');
    window.Views.go(window.Views.current || 'items');
  } });

  openModal({
    title: isNew ? 'Add Item' : 'Edit Item',
    sub: isNew ? 'Fill in the basics — you can always edit later.' : 'Update the details for this item.',
    body,
    width: 'wide',
    actions,
    onMount: (box) => {
      $('#i-barcode', box).addEventListener('input', refreshHint);
      const capture = (code) => {
        const c = normalizeCode(code);
        $('#i-barcode', box).value = c;
        refreshHint();
        const existing = findItemByCode(c);
        if (existing && existing.id !== it.id) toast('Code already belongs to “' + existing.name + '”', true);
        else { toast('Code captured: ' + c); if (!$('#i-name', box).value.trim()) $('#i-name', box).focus(); }
      };
      $('#i-barcode-menu', box).onclick = (ev) => {
        ev.stopPropagation();
        openMenu($('#i-barcode-menu', box), [
          { label: 'Generate a code', icon: 'plus', run: () => {
            const base = ($('#i-name', box).value.trim() || 'ITEM').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'ITEM';
            capture(base + String(Date.now()).slice(-6));
          } },
          { label: 'Scan with camera', icon: 'camera', run: () => window.Views.scanCode({ onDetect: capture }) },
          { label: 'Print this label', icon: 'printer', run: () => window.Views.printItemLabels([{ ...it, name: $('#i-name', box).value.trim() || it.name, barcode: $('#i-barcode', box).value.trim() }], 'barcode') },
          { sep: true },
          { label: 'Clear code', icon: 'trash', run: () => { $('#i-barcode', box).value = ''; refreshHint(); } }
        ]);
      };
      if (isNew) setTimeout(() => $('#i-name', box).focus(), 60);
    }
  });
};

// ============================================================ label preview
window.Views.itemLabel = function (item) {
  const code = itemCode(item);
  const body = el('div');
  body.innerHTML = `
    <div style="display:flex;gap:20px;align-items:flex-start">
      <div id="label-preview" style="background:#fff;padding:10px;border:1px solid var(--line);border-radius:10px;min-width:260px;text-align:center">
        ${barcodeSvg(code, { width: 1.8, height: 48 })}
        <div style="font-size:11.5px;margin-top:6px">${esc(item.name)}</div>
        <div style="font-size:13px;font-weight:700">${money(item.saleRate)}</div>
      </div>
      <div style="flex:1">
        <div style="font-weight:700">${esc(item.name)}</div>
        <div class="muted" style="font-size:12.5px;margin-top:2px">Code: ${esc(code)} · prints as ${barcodeFormatFor(code)}</div>
        <div class="field" style="margin-top:12px"><label>Label type</label>
          <select id="lbl-type">
            <option value="barcode">1D barcode (CODE128 — any code)</option>
            <option value="ean">1D barcode (EAN-13, needs 13 digits)</option>
            <option value="qr">QR code</option>
          </select>
        </div>
        <p class="muted" style="font-size:12px">1D barcodes are what shop scanners read — the standard for retail labelling.</p>
      </div>
    </div>`;

  openModal({
    title: 'Item label',
    body,
    width: 'narrow',
    actions: [
      { label: 'Close', onClick: (close) => close() },
      { label: 'Print labels', icon: 'printer', kind: 'primary', onClick: () => window.Views.printItemLabels([item], $('#lbl-type', body).value) }
    ],
    onMount: (box) => {
      const sel = $('#lbl-type', box);
      sel.onchange = () => {
        const type = sel.value;
        const prev = $('#label-preview', box);
        const inner = type === 'qr'
          ? `<div style="padding:6px">${qrSvg(code, 5, 2)}</div>`
          : barcodeSvg(code, type === 'ean' ? { format: 'EAN13', width: 1.8, height: 48 } : { format: 'CODE128', width: 1.8, height: 48 });
        prev.innerHTML = `${inner}
          <div style="font-size:11.5px;margin-top:6px">${esc(item.name)}</div>
          <div style="font-size:13px;font-weight:700">${money(item.saleRate)}</div>`;
      };
    }
  });
};

// ============================================================ label sheets
window.Views.printItemLabels = async function (items, type = 'barcode') {
  const list = (items && items.length ? items : Store.data.items).slice();
  if (!list.length) return toast('No items to print', true);

  const s = Store.data.profile;
  const renderCode = (code) => {
    if (type === 'qr') return `<div class="qr">${qrSvg(code, 3, 1)}</div>`;
    if (type === 'ean') return `<div class="bar">${barcodeSvg(code, { format: 'EAN13', width: 1.5, height: 34, fontSize: 10, margin: 2 })}</div>`;
    return `<div class="bar">${barcodeSvg(code, { format: 'CODE128', width: 1.5, height: 34, fontSize: 10, margin: 2 })}</div>`;
  };

  const labels = list.map((it) => {
    const code = itemCode(it);
    return `<div class="label">
      ${renderCode(code)}
      <div class="name">${esc(it.name)}</div>
      <div class="meta">${money(it.saleRate)}</div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 8mm; }
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:0;color:#111}
    .head{font-size:11px;color:#666;margin-bottom:5mm}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}
    .label{border:1px dashed #bbb;border-radius:2mm;padding:2.5mm;text-align:center;page-break-inside:avoid}
    .bar svg{width:56mm;height:16mm}
    .qr svg{width:24mm;height:24mm}
    .name{font-size:8.5px;font-weight:700;margin-top:1mm;line-height:1.2;height:6mm;overflow:hidden}
    .meta{font-size:8px;color:#444}
  </style></head><body>
    <div class="head">${esc(s.name)} · item barcode labels · ${fmtDate(today())}</div>
    <div class="grid">${labels}</div>
  </body></html>`;

  try {
    const path = await window.api.exportPdf({ html, filename: 'Item-labels-' + today() + '.pdf' });
    toast('Labels saved: ' + path);
  } catch (e) {
    toast('Could not create labels: ' + e.message, true);
  }
};

// ============================================================ party editor
window.Views.partyEditor = function (party, onSaved) {
  const isNew = !party;
  const p = party ? { ...party } : {
    id: 0, type: 'customer', name: '', phone: '', email: '', gstin: '', address: '', opening: 0
  };

  const body = el('div');
  body.innerHTML = `
    <div class="grid-2 form">
      <div class="field"><label>Party type</label>
        <select id="p-type">
          <option value="customer" ${p.type !== 'supplier' ? 'selected' : ''}>Customer</option>
          <option value="supplier" ${p.type === 'supplier' ? 'selected' : ''}>Supplier</option>
        </select>
      </div>
      <div class="field"><label>Opening balance</label>
        <input id="p-opening" type="number" step="0.01" value="${Number(p.opening || 0)}" />
        <span class="hint">Amount already owed at start (optional)</span>
      </div>
    </div>
    <div class="field"><label>Name *</label><input id="p-name" value="${esc(p.name)}" placeholder="e.g. Sharma General Store" /></div>
    <div class="grid-2 form">
      <div class="field"><label>Phone</label><input id="p-phone" value="${esc(p.phone || '')}" placeholder="+91…" /></div>
      <div class="field"><label>Email</label><input id="p-email" value="${esc(p.email || '')}" /></div>
    </div>
    <div class="field"><label>GSTIN</label><input id="p-gstin" value="${esc(p.gstin || '')}" placeholder="15-character GSTIN" />
      <span class="hint" id="p-gstin-hint">Leave blank for unregistered buyers (B2C)</span></div>
    <div class="field"><label>Address</label><textarea id="p-address" rows="2">${esc(p.address || '')}</textarea></div>`;

  openModal({
    title: isNew ? 'Add Party' : 'Edit Party',
    sub: isNew ? 'Customers and suppliers both live here.' : 'Update this party’s details.',
    body,
    width: 'narrow',
    actions: [
      { label: 'Cancel', onClick: (close) => close() },
      { label: isNew ? 'Add party' : 'Save changes', kind: 'primary', onClick: async (close) => {
        const name = $('#p-name', body).value.trim();
        if (!name) { toast('Name is required', true); $('#p-name', body).focus(); return; }
        const payload = {
          ...p,
          name,
          type: $('#p-type', body).value,
          phone: $('#p-phone', body).value.trim(),
          email: $('#p-email', body).value.trim(),
          gstin: $('#p-gstin', body).value.trim().toUpperCase(),
          address: $('#p-address', body).value.trim(),
          opening: Number($('#p-opening', body).value) || 0
        };
        const saved = await Store.upsertParty(payload);
        close();
        toast(isNew ? 'Party added' : 'Party saved');
        if (onSaved) onSaved(saved);
        else window.Views.go(window.Views.current || 'parties');
      } }
    ],
    onMount: (box) => {
      if (isNew) setTimeout(() => $('#p-name', box).focus(), 60);
      const g = $('#p-gstin', box);
      const hint = $('#p-gstin-hint', box);
      const check = () => {
        const v = g.value.trim().toUpperCase();
        if (!v) { hint.textContent = 'Leave blank for unregistered buyers (B2C)'; g.classList.remove('invalid'); return; }
        const ok = Store.isValidGstin(v);
        g.classList.toggle('invalid', !ok);
        hint.textContent = ok ? 'Valid GSTIN · ' + Store.stateName(Store.gstinStateCode(v)) : 'Not a valid GSTIN (format or check digit).';
      };
      g.addEventListener('input', check);
      check();
    }
  });
};
