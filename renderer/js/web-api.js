'use strict';
/*
 * SmallFirm Solution — browser (PWA) implementation of the Electron `window.api`.
 * Loaded before the app scripts; returns immediately when the Electron preload
 * already provided window.api.
 *
 * Storage: localStorage, one key per firm plus an index. Simple, synchronous and
 * adequate for a single-shop dataset. Export/backup exists so nothing is trapped.
 */
(function () {
  if (window.api) return; // Electron preload wins

  const IDX_KEY = 'sfs.index.v1';
  const FIRM_PREFIX = 'sfs.firm.v1.';
  const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const writeJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  function blankFirm(name) {
    return {
      version: 2,
      profile: {
        name: name || 'My Firm',
        gstin: '', stateCode: '', phone: '', email: '', address: '',
        currency: '\u20b9', fyStart: '04-01',
        invoicePrefix: 'INV', purchasePrefix: 'PUR', estimatePrefix: 'EST'
      },
      tax: { defaultTax: 18, rates: [0, 5, 12, 18, 28] },
      units: ['PCS', 'KG', 'BOX', 'LTR', 'MTR', 'SET'],
      categories: [],
      accounts: [
        { id: 1, name: 'Cash in Hand', type: 'cash', opening: 0 },
        { id: 2, name: 'Bank Account', type: 'bank', opening: 0, accountNumber: '', ifsc: '' }
      ],
      parties: [], items: [], docs: [], payments: [], expenses: [], otherIncome: []
    };
  }

  function index() {
    let idx = readJSON(IDX_KEY, null);
    if (!idx || !Array.isArray(idx.firms) || !idx.firms.length) {
      const id = 'firm-' + Date.now();
      idx = { activeFirmId: id, firms: [{ id, name: 'My Firm', createdAt: new Date().toISOString() }] };
      writeJSON(IDX_KEY, idx);
      writeJSON(FIRM_PREFIX + id, blankFirm('My Firm'));
    }
    if (!idx.firms.some((f) => f.id === idx.activeFirmId)) idx.activeFirmId = idx.firms[0].id;
    return idx;
  }

  function saveIndex(idx) { writeJSON(IDX_KEY, idx); }
  function firmData(id) {
    let d = readJSON(FIRM_PREFIX + id, null);
    if (!d) { d = blankFirm('My Firm'); writeJSON(FIRM_PREFIX + id, d); }
    return d;
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '.json,application/json';
      input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return resolve(null);
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => resolve(null);
        fr.readAsText(file);
      };
      input.click();
    });
  }

  // Print an HTML document via a hidden iframe (used for invoices / labels / reports).
  function printHtml(html) {
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    document.body.appendChild(frame);
    frame.srcdoc = html;
    frame.onload = () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } finally {
        setTimeout(() => frame.remove(), 1500);
      }
    };
  }

  window.api = {
    // ---- firms
    firmsList: async () => index(),
    firmCreate: async (name) => {
      const idx = index();
      const id = 'firm-' + Date.now();
      idx.firms.push({ id, name: (name || 'New Firm').trim() || 'New Firm', createdAt: new Date().toISOString() });
      idx.activeFirmId = id;
      saveIndex(idx);
      writeJSON(FIRM_PREFIX + id, blankFirm(idx.firms[idx.firms.length - 1].name));
      return idx;
    },
    firmSwitch: async (id) => { const idx = index(); if (idx.firms.some((f) => f.id === id)) { idx.activeFirmId = id; saveIndex(idx); } return idx; },
    firmRename: async ({ id, name }) => { const idx = index(); const f = idx.firms.find((x) => x.id === id); if (f) { f.name = name; saveIndex(idx); } return idx; },
    firmDelete: async (id) => {
      let idx = index();
      if (idx.firms.length <= 1) return idx;
      idx.firms = idx.firms.filter((f) => f.id !== id);
      localStorage.removeItem(FIRM_PREFIX + id);
      if (idx.activeFirmId === id) idx.activeFirmId = idx.firms[0].id;
      saveIndex(idx);
      return idx;
    },

    // ---- data
    load: async () => {
      const idx = index();
      const firm = idx.firms.find((f) => f.id === idx.activeFirmId);
      return { firm, data: firmData(idx.activeFirmId) };
    },
    save: async (data) => { const idx = index(); writeJSON(FIRM_PREFIX + idx.activeFirmId, data); return true; },
    dataPath: async () => 'Browser storage (this device) — export a backup to keep a copy',

    // ---- files / documents
    exportPdf: async ({ html }) => { printHtml(html); return 'Print dialog (choose “Save as PDF”)'; },
    saveText: async ({ filename, content }) => { download(filename, content, 'text/csv'); return filename; },

    backupExport: async () => {
      const idx = index();
      const payload = {
        app: 'SmallFirm Solution', exportedAt: new Date().toISOString(),
        firms: idx.firms.map((f) => ({ ...f, data: firmData(f.id) }))
      };
      const stamp = new Date().toISOString().slice(0, 10);
      download(`SmallFirm-backup-${stamp}.json`, JSON.stringify(payload, null, 2));
      return `SmallFirm-backup-${stamp}.json`;
    },
    backupImport: async () => {
      const text = await pickFile();
      if (!text) return null;
      const payload = JSON.parse(text);
      if (!payload || !Array.isArray(payload.firms)) throw new Error('Not a SmallFirm backup file');
      const idx = index();
      let added = 0;
      for (const f of payload.firms) {
        const id = 'firm-' + Date.now() + '-' + added;
        idx.firms.push({ id, name: (f.name || 'Restored Firm') + ' (restored)', createdAt: new Date().toISOString() });
        writeJSON(FIRM_PREFIX + id, f.data || blankFirm(f.name));
        added++;
      }
      saveIndex(idx);
      return { added, index: idx };
    },

    // ---- camera (HTTPS required)
    askCamera: async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        stream.getTracks().forEach((t) => t.stop());
        return true;
      } catch { return false; }
    }
  };
})();
