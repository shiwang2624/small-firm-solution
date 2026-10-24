'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, session, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

// ---- app identity + one-time migration from the old data folder ----
app.setName('SmallFirm Solution');
try {
  const legacy = path.join(app.getPath('appData'), 'Small Firm');
  const current = path.join(app.getPath('appData'), 'SmallFirm Solution');
  if (!fs.existsSync(current) && fs.existsSync(legacy)) fs.cpSync(legacy, current, { recursive: true });
  app.setPath('userData', current);
} catch (e) { /* keep default */ }

const P = {
  index: () => path.join(app.getPath('userData'), 'firms.json'),
  firmsDir: () => path.join(app.getPath('userData'), 'firms'),
  firmData: (id) => path.join(app.getPath('userData'), 'firms', `${id}.json`)
};

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function nextId(list) {
  return (list || []).reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
}
function today() { return new Date().toISOString().slice(0, 10); }

// ---------------------------------------------------------------- seed data
function seedFirm(name) {
  const cats = [
    { id: 1, name: 'Stationery' },
    { id: 2, name: 'Electronics' }
  ];
  const parties = [
    { id: 1, type: 'customer', name: 'Acme Traders', phone: '+91 98765 43210', email: 'billing@acme.example', gstin: '29AAAAA1111A1ZS', address: '12 MG Road, Bengaluru 560001', stateCode: '29', opening: 0 },
    { id: 2, type: 'customer', name: 'Sunrise Stores', phone: '+91 91234 56780', email: '', gstin: '27BBBBB2222B1ZH', address: '44 FC Road, Pune 411004', stateCode: '27', opening: 0 },
    { id: 3, type: 'supplier', name: 'Metro Wholesale', phone: '+91 99887 76655', email: 'sales@metro.example', gstin: '07CCCCC3333C1Z4', address: 'Okhla Phase 2, New Delhi 110020', stateCode: '07', opening: 0 }
  ];
  const items = [
    { id: 1, name: 'A4 Paper Ream', categoryId: 1, unit: 'REAM', hsn: '4802', saleRate: 320, purchaseRate: 250, taxPercent: 18, openingStock: 20, lowStock: 5 },
    { id: 2, name: 'Ball Pen (Blue)', categoryId: 1, unit: 'PCS', hsn: '9608', saleRate: 10, purchaseRate: 6, taxPercent: 12, openingStock: 200, lowStock: 50 },
    { id: 3, name: 'Stapler', categoryId: 1, unit: 'PCS', hsn: '8472', saleRate: 145, purchaseRate: 110, taxPercent: 18, openingStock: 15, lowStock: 5 },
    { id: 4, name: 'USB Cable (Type-C)', categoryId: 2, unit: 'PCS', hsn: '8544', saleRate: 199, purchaseRate: 130, taxPercent: 18, openingStock: 40, lowStock: 10 }
  ];
  const docs = [
    {
      id: 1, type: 'invoice', number: 'INV-0001', date: today(), partyId: 1, partyName: 'Acme Traders',
      status: 'partial', paid: 500, notes: 'Thanks for your business!',
      lines: [
        { itemId: 1, itemName: 'A4 Paper Ream', hsn: '4802', unit: 'REAM', qty: 4, rate: 320, taxPercent: 18 },
        { itemId: 2, itemName: 'Ball Pen (Blue)', hsn: '9608', unit: 'PCS', qty: 20, rate: 10, taxPercent: 12 }
      ]
    },
    {
      id: 2, type: 'purchase_bill', number: 'PUR-0001', date: today(), partyId: 3, partyName: 'Metro Wholesale',
      status: 'paid', paid: 0, notes: 'Stock replenishment',
      lines: [
        { itemId: 4, itemName: 'USB Cable (Type-C)', hsn: '8544', unit: 'PCS', qty: 25, rate: 130, taxPercent: 18 }
      ]
    },
    {
      id: 3, type: 'estimate', number: 'EST-0001', date: today(), partyId: 2, partyName: 'Sunrise Stores',
      status: 'open', paid: 0, notes: 'Quotation valid 15 days',
      lines: [
        { itemId: 3, itemName: 'Stapler', hsn: '8472', unit: 'PCS', qty: 10, rate: 145, taxPercent: 18 }
      ]
    }
  ];
  const payments = [
    { id: 1, dir: 'in', date: today(), partyId: 1, partyName: 'Acme Traders', amount: 500, mode: 'UPI', ref: 'UPI/8842', notes: 'Part payment', accountId: 2 }
  ];
  const expenses = [
    { id: 1, date: today(), category: 'Rent', amount: 1200, notes: 'Shop rent', mode: 'Bank', accountId: 2 }
  ];

  return {
    version: 2,
    profile: {
      name,
      gstin: '29ABCDE1234F1ZW',
      stateCode: '29',
      address: '12 MG Road, Bengaluru, Karnataka 560001',
      phone: '+91 98765 43210',
      phone: '',
      email: '',
      address: '',
      currency: '₹',
      fyStart: '04-01',
      invoicePrefix: 'INV',
      purchasePrefix: 'PUR',
      estimatePrefix: 'EST'
    },
    tax: { defaultTax: 18, rates: [0, 5, 12, 18, 28] },
    units: ['PCS', 'KG', 'BOX', 'REAM', 'LTR', 'MTR', 'SET'],
    categories: cats,
    accounts: [
      { id: 1, name: 'Cash in Hand', type: 'cash', opening: 0 },
      { id: 2, name: 'Bank Account', type: 'bank', opening: 0, accountNumber: '', ifsc: '' }
    ],
    parties,
    items,
    docs,
    payments,
    expenses,
    otherIncome: []
  };
}

// ---------------------------------------------------------------- firms index
function loadIndex() {
  let idx = readJSON(P.index(), null);
  if (!idx || !Array.isArray(idx.firms) || !idx.firms.length) {
    const id = 'firm-' + Date.now();
    idx = { activeFirmId: id, firms: [{ id, name: 'My Firm', createdAt: new Date().toISOString() }] };
    writeJSON(P.index(), idx);
    writeJSON(P.firmData(id), seedFirm('My Firm'));
  }
  if (!idx.firms.some((f) => f.id === idx.activeFirmId)) idx.activeFirmId = idx.firms[0].id;
  return idx;
}
function saveIndex(idx) { writeJSON(P.index(), idx); }
function loadFirmData(id) {
  let d = readJSON(P.firmData(id), null);
  if (!d) { d = seedFirm('My Firm'); writeJSON(P.firmData(id), d); }
  return d;
}

// ---------------------------------------------------------------- window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    title: 'SmallFirm Solution',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  // ---- camera (barcode / QR scanning)
  try {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media' || permission === 'camera');
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media' || permission === 'camera');
  } catch (e) { /* older Electron */ }

  ipcMain.handle('media:askCamera', async () => {
    try {
      if (process.platform === 'darwin' && systemPreferences.askForMediaAccess) {
        return await systemPreferences.askForMediaAccess('camera');
      }
      return true;
    } catch { return true; }
  });

  // ---- firms
  ipcMain.handle('firms:list', () => loadIndex());

  ipcMain.handle('firms:create', (_e, name) => {
    const idx = loadIndex();
    const id = 'firm-' + Date.now();
    idx.firms.push({ id, name: (name || 'New Firm').trim() || 'New Firm', createdAt: new Date().toISOString() });
    idx.activeFirmId = id;
    saveIndex(idx);
    writeJSON(P.firmData(id), seedFirm(idx.firms[idx.firms.length - 1].name));
    return idx;
  });

  ipcMain.handle('firms:switch', (_e, id) => {
    const idx = loadIndex();
    if (idx.firms.some((f) => f.id === id)) { idx.activeFirmId = id; saveIndex(idx); }
    return idx;
  });

  ipcMain.handle('firms:rename', (_e, { id, name }) => {
    const idx = loadIndex();
    const f = idx.firms.find((x) => x.id === id);
    if (f) { f.name = name; saveIndex(idx); }
    return idx;
  });

  ipcMain.handle('firms:delete', (_e, id) => {
    let idx = loadIndex();
    if (idx.firms.length <= 1) return idx; // never delete the last firm
    idx.firms = idx.firms.filter((f) => f.id !== id);
    try { fs.unlinkSync(P.firmData(id)); } catch {}
    if (idx.activeFirmId === id) idx.activeFirmId = idx.firms[0].id;
    saveIndex(idx);
    return idx;
  });

  // ---- data
  ipcMain.handle('data:load', () => {
    const idx = loadIndex();
    return { firm: idx.firms.find((f) => f.id === idx.activeFirmId), data: loadFirmData(idx.activeFirmId) };
  });

  ipcMain.handle('data:save', (_e, data) => {
    const idx = loadIndex();
    writeJSON(P.firmData(idx.activeFirmId), data);
    return true;
  });

  ipcMain.handle('data:path', () => {
    const idx = loadIndex();
    return P.firmData(idx.activeFirmId);
  });

  // ---- documents -> PDF
  ipcMain.handle('doc:pdf', async (_e, { html, filename }) => {
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
    });
    win.destroy();
    const dir = path.join(app.getPath('documents'), 'Small Firm');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, filename);
    fs.writeFileSync(target, pdf);
    shell.showItemInFolder(target);
    return target;
  });

  // ---- save arbitrary text (CSV exports, etc.)
  ipcMain.handle('file:saveText', async (_e, { filename, content, filters }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save file',
      defaultPath: path.join(app.getPath('documents'), 'Small Firm', filename),
      filters: filters || [{ name: 'Text', extensions: ['txt'] }]
    });
    if (canceled || !filePath) return null;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    shell.showItemInFolder(filePath);
    return filePath;
  });

  // ---- backup / restore
  ipcMain.handle('backup:export', async () => {
    const idx = loadIndex();
    const payload = {
      app: 'Small Firm',
      exportedAt: new Date().toISOString(),
      firms: idx.firms.map((f) => ({ ...f, data: loadFirmData(f.id) }))
    };
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export backup',
      defaultPath: path.join(app.getPath('documents'), `SmallFirm-backup-${stamp}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (canceled || !filePath) return null;
    writeJSON(filePath, payload);
    shell.showItemInFolder(filePath);
    return filePath;
  });

  ipcMain.handle('backup:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Restore from backup',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths || !filePaths.length) return null;
    const payload = readJSON(filePaths[0], null);
    if (!payload || !Array.isArray(payload.firms)) throw new Error('Not a Small Firm backup file');
    const idx = loadIndex();
    let added = 0;
    for (const f of payload.firms) {
      const id = f.id && !idx.firms.some((x) => x.id === f.id) ? f.id : 'firm-' + Date.now() + '-' + added;
      idx.firms.push({ id, name: (f.name || 'Restored Firm') + (idx.firms.some((x) => x.id === f.id) ? ' (restored)' : ''), createdAt: new Date().toISOString() });
      writeJSON(P.firmData(id), f.data || seedFirm(f.name || 'Restored Firm'));
      added++;
    }
    saveIndex(idx);
    return { added, index: idx };
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
