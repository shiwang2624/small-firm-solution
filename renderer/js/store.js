'use strict';

// ============================================================ document types
const DOC_TYPES = {
  invoice:           { label: 'Invoice',          plural: 'Invoices',          group: 'sales',    posting: 'sale',            prefix: 'INV', icon: 'invoice', tone: 'unpaid' },
  estimate:          { label: 'Estimate / Quotation', plural: 'Estimates',      group: 'sales',    posting: null,              prefix: 'EST', icon: 'invoice' },
  proforma_invoice:  { label: 'Proforma Invoice', plural: 'Proforma Invoices', group: 'sales',    posting: null,              prefix: 'PRO', icon: 'invoice' },
  sale_order:        { label: 'Sale Order',       plural: 'Sale Orders',       group: 'sales',    posting: null,              prefix: 'SO',  icon: '📦' },
  delivery_challan:  { label: 'Delivery Challan', plural: 'Delivery Challans', group: 'sales',    posting: null,              prefix: 'DC',  icon: '🚚' },
  credit_note:       { label: 'Credit Note',      plural: 'Credit Notes',      group: 'sales',    posting: 'sale_return',     prefix: 'CN',  icon: '↩️' },
  purchase_bill:     { label: 'Purchase Bill',    plural: 'Purchase Bills',    group: 'purchase', posting: 'purchase',        prefix: 'PUR', icon: '🧾' },
  purchase_order:    { label: 'Purchase Order',   plural: 'Purchase Orders',   group: 'purchase', posting: null,              prefix: 'PO',  icon: '📋' },
  purchase_return:   { label: 'Purchase Return',  plural: 'Purchase Returns',  group: 'purchase', posting: 'purchase_return', prefix: 'PR',  icon: '↩️' }
};
const SALES_TYPES = ['invoice', 'estimate', 'proforma_invoice', 'sale_order', 'delivery_challan', 'credit_note'];
const PURCHASE_TYPES = ['purchase_bill', 'purchase_order', 'purchase_return'];
const PAY_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other'];

// GST state codes (01–38, 97) — used for place of supply / IGST vs CGST+SGST
const GST_STATES = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
  '97': 'Other Territory'
};
const EXPENSE_CATEGORIES = ['Rent', 'Salary', 'Electricity', 'Transport', 'Office Supplies', 'Marketing', 'Repairs', 'Taxes', 'Other'];

// ============================================================ store
const Store = {
  firms: [],
  firm: null,
  data: null,
  _saveTimer: null,

  async boot() {
    const idx = await window.api.firmsList();
    this.firms = idx.firms;
    await this.loadActive();
  },

  async loadActive() {
    const { firm, data } = await window.api.load();
    this.firm = firm;
    this.data = data;
    this.data.otherIncome = this.data.otherIncome || [];
    this.data.categories = this.data.categories || [];
    this.data.accounts = this.data.accounts || [];
  },

  async refreshFirms() {
    const idx = await window.api.firmsList();
    this.firms = idx.firms;
  },

  async switchFirm(id) {
    await window.api.firmSwitch(id);
    await this.refreshFirms();
    await this.loadActive();
  },

  async createFirm(name) {
    await window.api.firmCreate(name);
    await this.refreshFirms();
    await this.loadActive();
  },

  async renameFirm(id, name) {
    await window.api.firmRename({ id, name });
    await this.refreshFirms();
    if (this.firm && this.firm.id === id) this.firm.name = name;
  },

  async deleteFirm(id) {
    await window.api.firmDelete(id);
    await this.refreshFirms();
    await this.loadActive();
  },

  save() {
    clearTimeout(this._saveTimer);
    return new Promise((resolve) => {
      this._saveTimer = setTimeout(async () => {
        await window.api.save(this.data);
        resolve(true);
      }, 150);
    });
  },

  async saveNow() { await window.api.save(this.data); },

  // ---------------- numbering ----------------
  nextNumber(type) {
    const meta = DOC_TYPES[type];
    const prefix = meta.prefix;
    const nums = this.data.docs
      .filter((d) => d.type === type)
      .map((d) => parseInt(String(d.number).replace(/[^0-9]/g, ''), 10) || 0);
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return prefix + '-' + String(next).padStart(4, '0');
  },

  // ---------------- doc math ----------------
  // line: qty x rate, minus line discount, plus tax
  lineGross(l) { return Number(l.qty || 0) * Number(l.rate || 0); },
  lineDiscountAmount(l) { return this.lineGross(l) * Number(l.discountPercent || 0) / 100; },
  lineAmount(l) { return this.lineGross(l) - this.lineDiscountAmount(l); },
  lineTax(l) { return this.lineAmount(l) * Number(l.taxPercent || 0) / 100; },
  lineTotal(l) { return this.lineAmount(l) + this.lineTax(l); },

  // document: line subtotal, then doc discount, charges, round-off
  docSubtotal(doc) { return (doc.lines || []).reduce((s, l) => s + this.lineAmount(l), 0); },
  docLineDiscount(doc) { return (doc.lines || []).reduce((s, l) => s + this.lineDiscountAmount(l), 0); },
  docDiscount(doc) { return this.docSubtotal(doc) * Number(doc.discountPercent || 0) / 100; },
  docTaxable(doc) { return this.docSubtotal(doc) - this.docDiscount(doc); },
  docTax(doc) {
    const sub = this.docSubtotal(doc) || 0;
    const factor = sub ? (this.docTaxable(doc) / sub) : 1;
    return (doc.lines || []).reduce((s, l) => s + this.lineTax(l) * factor, 0);
  },
  docCharges(doc) { return Number(doc.additionalCharges || 0); },
  docRawTotal(doc) { return this.docTaxable(doc) + this.docTax(doc) + this.docCharges(doc); },
  docRoundOff(doc) { return doc.roundOff ? (Math.round(this.docRawTotal(doc)) - this.docRawTotal(doc)) : 0; },
  docTotal(doc) { return this.docRawTotal(doc) + this.docRoundOff(doc); },

  // ---------------- GST: state codes, GSTIN validation, supply type ----------------
  // Per-rate split. Intra-state => CGST+SGST, inter-state => IGST, derived from
  // the supplier's state vs the place of supply (not a manual toggle).
  gstBreakup(doc) {
    const map = new Map();
    const sub = this.docSubtotal(doc) || 0;
    const factor = sub ? (this.docTaxable(doc) / sub) : 1;
    const inter = this.isInterState(doc);
    (doc.lines || []).forEach((l) => {
      const rate = Number(l.taxPercent || 0);
      const taxable = this.lineAmount(l) * factor;
      const tax = this.lineTax(l) * factor;
      const cur = map.get(rate) || { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
      cur.taxable += taxable;
      cur.tax += tax;
      if (inter) cur.igst += tax;
      else { cur.cgst += tax / 2; cur.sgst += tax / 2; }
      map.set(rate, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
  },

  supplierStateCode() {
    const p = this.data.profile || {};
    const fromGstin = this.gstinStateCode(p.gstin);
    return fromGstin || p.stateCode || '';
  },

  placeOfSupplyCode(doc) {
    if (doc.placeOfSupplyCode) return doc.placeOfSupplyCode;
    const party = this.party(doc.partyId);
    const fromGstin = party ? this.gstinStateCode(party.gstin) : '';
    if (fromGstin) return fromGstin;
    return this.supplierStateCode();
  },

  // Intra-state (CGST+SGST) vs inter-state (IGST)
  isInterState(doc) {
    const supplier = this.supplierStateCode();
    const pos = this.placeOfSupplyCode(doc);
    if (!supplier || !pos) return !!doc.interState;
    return supplier !== pos;
  },

  gstinStateCode(gstin) {
    const g = String(gstin || '').trim().toUpperCase();
    if (g.length < 2) return '';
    const code = g.slice(0, 2);
    return GST_STATES[code] ? code : '';
  },

  stateName(code) { return GST_STATES[code] || ''; },

  // GSTIN = 2-digit state + 10-char PAN + entity + 'Z' + mod-36 check digit
  isValidGstin(gstin) {
    const g = String(gstin || '').trim().toUpperCase();
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
    if (!GST_STATES[g.slice(0, 2)]) return false;
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      const v = chars.indexOf(g[i]);
      if (v < 0) return false;
      const factor = (i % 2 === 0) ? 1 : 2;
      const product = v * factor;
      sum += Math.floor(product / 36) + (product % 36);
    }
    const check = (36 - (sum % 36)) % 36;
    return chars[check] === g[14];
  },

  // ---------------- GST compliance checks ----------------
  invoiceNumberIssue(doc) {
    const n = String(doc.number || '').trim();
    if (!n) return 'Document number is missing.';
    if (n.length > 16) return 'Invoice number must be 16 characters or fewer (GST rule).';
    if (!/^[A-Za-z0-9\-/]+$/.test(n)) return 'Invoice number may contain only letters, digits, hyphen and slash.';
    if (this.data.docs.some((d) => d.id !== doc.id && d.id !== 0 && String(d.number) === n)) {
      return `Invoice number “${n}” is already used — GST requires unique numbers.`;
    }
    return null;
  },

  // Returns a list of compliance problems for a document (empty = clean).
  complianceIssues(doc) {
    const issues = [];
    const p = this.data.profile || {};
    const party = this.party(doc.partyId);
    const isTaxInvoice = doc.type === 'invoice';
    const posting = DOC_TYPES[doc.type] && DOC_TYPES[doc.type].posting;

    if (isTaxInvoice) {
      if (!p.gstin) issues.push('Your business GSTIN is not set — required on a tax invoice.');
      else if (!this.isValidGstin(p.gstin)) issues.push('Your business GSTIN is not valid.');
      if (!p.address) issues.push('Your business address is missing — required on a tax invoice.');
      if (!this.supplierStateCode()) issues.push('Your business state is not set — needed to choose IGST vs CGST/SGST.');
    }
    if (party && party.gstin && !this.isValidGstin(party.gstin)) issues.push(`Party GSTIN “${party.gstin}” is not valid.`);

    const numIssue = this.invoiceNumberIssue(doc);
    if (numIssue) issues.push(numIssue);
    if (!doc.date) issues.push('Document date is missing.');
    if (!(doc.lines || []).length) issues.push('No line items.');
    if (posting && (doc.lines || []).some((l) => !String(l.hsn || '').trim())) issues.push('One or more lines have no HSN/SAC code.');
    if (this.isInterState(doc) && !doc.placeOfSupplyCode && !(party && party.gstin)) {
      issues.push('Inter-state supply, but place of supply is not specified.');
    }
    if (isTaxInvoice && !doc.dueDate) issues.push('No due date set (recommended, not mandatory).');
    return issues;
  },

  // ---------------- GSTR-1 / GSTR-3B style summaries ----------------
  gstr1Summary(from, to) {
    const b2b = [], b2c = [];
    for (const d of this.postedDocs()) {
      if (!inRange(d.date, from, to)) continue;
      const posting = DOC_TYPES[d.type].posting;
      if (posting !== 'sale' && posting !== 'sale_return') continue;
      const party = this.party(d.partyId);
      const registered = !!(party && this.isValidGstin(party.gstin));
      const sign = posting === 'sale' ? 1 : -1;
      for (const r of this.gstBreakup(d)) {
        const row = {
          number: d.number, date: d.date, party: d.partyName,
          gstin: party ? (party.gstin || '') : '',
          pos: this.stateName(this.placeOfSupplyCode(d)),
          rate: r.rate, taxable: sign * r.taxable,
          igst: sign * r.igst, cgst: sign * r.cgst, sgst: sign * r.sgst, tax: sign * r.tax,
          kind: posting === 'sale' ? 'Invoice' : 'Credit note'
        };
        (registered ? b2b : b2c).push(row);
      }
    }
    return { b2b, b2c, hsn: this.hsnSummary(from, to).filter((r) => r.side === 'Output') };
  },

  gstr3bSummary(from, to) {
    const acc = (side) => {
      let taxable = 0, igst = 0, cgst = 0, sgst = 0;
      for (const d of this.postedDocs()) {
        if (!inRange(d.date, from, to)) continue;
        const posting = DOC_TYPES[d.type].posting;
        const isSale = posting === 'sale' || posting === 'sale_return';
        const isBuy = posting === 'purchase' || posting === 'purchase_return';
        if (side === 'out' ? !isSale : !isBuy) continue;
        const sign = (posting === 'sale' || posting === 'purchase') ? 1 : -1;
        for (const r of this.gstBreakup(d)) {
          taxable += sign * r.taxable; igst += sign * r.igst; cgst += sign * r.cgst; sgst += sign * r.sgst;
        }
      }
      return { taxable, igst, cgst, sgst, totalTax: igst + cgst + sgst };
    };
    const outward = acc('out');
    const itc = acc('in');
    return {
      outward, itc,
      netPayable: { igst: outward.igst - itc.igst, cgst: outward.cgst - itc.cgst, sgst: outward.sgst - itc.sgst },
      totalPayable: (outward.igst - itc.igst) + (outward.cgst - itc.cgst) + (outward.sgst - itc.sgst)
    };
  },

  // GST registration state codes (India)
  states() { return Object.entries(GST_STATES).map(([code, name]) => ({ code, name })); },

  // amount in words (Indian numbering)
  amountInWords(amount, currency) {
    const cur = currency || (this.data && this.data.profile.currency) || '\u20b9';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (n) => n < 20 ? ones[n] : (tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''));
    const whole = Math.floor(Math.abs(Number(amount) || 0));
    const paise = Math.round((Math.abs(Number(amount) || 0) - whole) * 100);
    if (whole === 0 && paise === 0) return 'Zero Only';
    let n = whole, out = '';
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    const hundred = Math.floor(n / 100); n %= 100;
    if (crore) out += two(crore) + ' Crore ';
    if (lakh) out += two(lakh) + ' Lakh ';
    if (thousand) out += two(thousand) + ' Thousand ';
    if (hundred) out += ones[hundred] + ' Hundred ';
    if (n) out += (out ? 'and ' : '') + two(n) + ' ';
    out = out.trim();
    let res = out + ' Rupees';
    if (paise) res += ' and ' + two(paise) + ' Paise';
    return res + ' Only';
  },

  // ---------------- document actions ----------------
  async convertDoc(id, toType) {
    const src = this.data.docs.find((d) => d.id === id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = 0;
    copy.type = toType;
    copy.number = this.nextNumber(toType);
    copy.date = today();
    copy.paid = 0;
    copy.status = DOC_TYPES[toType].posting ? 'unpaid' : 'open';
    copy.linkedFrom = src.number;
    return this.upsertDoc(copy);
  },

  async duplicateDoc(id) {
    const src = this.data.docs.find((d) => d.id === id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = 0;
    copy.number = this.nextNumber(src.type);
    copy.date = today();
    copy.paid = 0;
    return this.upsertDoc(copy);
  },

  // ---------------- HSN summary (GSTR-1 style) ----------------
  hsnSummary(from, to) {
    const map = new Map();
    for (const d of this.postedDocs()) {
      if (!inRange(d.date, from, to)) continue;
      const posting = DOC_TYPES[d.type].posting;
      const sale = posting === 'sale' || posting === 'sale_return';
      const sign = (posting === 'sale' || posting === 'purchase') ? 1 : -1;
      for (const l of d.lines || []) {
        const key = (l.hsn || '—') + '|' + Number(l.taxPercent || 0) + '|' + (sale ? 'out' : 'in');
        const cur = map.get(key) || { hsn: l.hsn || '—', rate: Number(l.taxPercent || 0), side: sale ? 'Output' : 'Input', qty: 0, taxable: 0, tax: 0 };
        cur.qty += sign * Number(l.qty || 0);
        cur.taxable += sign * this.lineAmount(l);
        cur.tax += sign * this.lineTax(l);
        map.set(key, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.side.localeCompare(b.side) || a.hsn.localeCompare(b.hsn));
  },

  // ---------------- party statement ----------------
  statementRows(partyId, from, to) {
    const rows = [];
    const p = this.party(partyId);
    if (!p) return { rows, opening: 0, closing: 0 };
    let opening = Number(p.opening || 0);
    for (const d of this.postedDocs()) {
      if (d.partyId !== partyId || !(d.date < from)) continue;
      const posting = DOC_TYPES[d.type].posting;
      opening += (posting === 'sale' || posting === 'purchase') ? this.docTotal(d) : -this.docTotal(d);
    }
    for (const pay of this.data.payments) {
      if (pay.partyId !== partyId || !(pay.date < from)) continue;
      opening += pay.dir === 'in' ? -Number(pay.amount || 0) : Number(pay.amount || 0);
    }
    let bal = opening;
    for (const d of this.postedDocs()) {
      if (d.partyId !== partyId || !inRange(d.date, from, to)) continue;
      const posting = DOC_TYPES[d.type].posting;
      const amt = ((posting === 'sale' || posting === 'purchase') ? 1 : -1) * this.docTotal(d);
      bal += amt;
      rows.push({ date: d.date, kind: DOC_TYPES[d.type].label, ref: d.number, debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0, balance: bal });
    }
    for (const pay of this.data.payments) {
      if (pay.partyId !== partyId || !inRange(pay.date, from, to)) continue;
      const amt = pay.dir === 'in' ? -Number(pay.amount || 0) : Number(pay.amount || 0);
      bal += amt;
      rows.push({ date: pay.date, kind: pay.dir === 'in' ? 'Payment In' : 'Payment Out', ref: pay.mode || '', debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0, balance: bal });
    }
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { rows, opening, closing: bal };
  },

  // ---------------- stock / expiry ----------------
  expiryAlerts(days = 90) {
    const limit = new Date(); limit.setDate(limit.getDate() + days);
    const iso = limit.toISOString().slice(0, 10);
    return this.data.items
      .filter((i) => i.expiry && this.stockOf(i.id) > 0)
      .map((i) => ({ item: i, stock: this.stockOf(i.id), expired: i.expiry < today(), soon: i.expiry <= iso }))
      .filter((r) => r.expired || r.soon)
      .sort((a, b) => (a.item.expiry < b.item.expiry ? -1 : 1));
  },

  // ---------------- simplified financial statements ----------------
  balanceSheet(from, to) {
    const k = this.kpis(from, to);
    const receivable = this.totalReceivable();
    const payable = this.totalPayable();
    const cash = this.data.accounts.reduce((s, a) => s + this.accountBalance(a.id), 0);
    const stock = this.stockValue();
    const loans = this.data.accounts.filter((a) => a.type === 'loan').reduce((s, a) => s + this.accountBalance(a.id), 0);
    const assets = receivable + cash + stock;
    const liabilities = payable + Math.max(0, -loans);
    return {
      assets: [
        ['Sundry debtors (receivable)', receivable],
        ['Cash & bank', cash],
        ['Closing stock', stock]
      ],
      liabilities: [
        ['Sundry creditors (payable)', payable],
        ['Loans', Math.max(0, -loans)]
      ],
      totals: { assets, liabilities, equity: assets - liabilities, profit: k.profit }
    };
  },

  trialBalance(from, to) {
    const k = this.kpis(from, to);
    const rows = [
      { name: 'Sundry debtors', debit: this.totalReceivable(), credit: 0 },
      { name: 'Cash & bank', debit: Math.max(0, this.data.accounts.reduce((s, a) => s + this.accountBalance(a.id), 0)), credit: 0 },
      { name: 'Closing stock', debit: this.stockValue(), credit: 0 },
      { name: 'Sundry creditors', debit: 0, credit: this.totalPayable() },
      { name: 'Sales', debit: 0, credit: k.revenue },
      { name: 'Purchases', debit: k.cost, credit: 0 },
      { name: 'Expenses', debit: k.expenseTotal, credit: 0 },
      { name: 'Other income', debit: 0, credit: k.otherTotal },
      { name: 'GST output', debit: 0, credit: Math.max(0, k.taxOut) },
      { name: 'GST input', debit: Math.max(0, k.taxIn), credit: 0 }
    ].filter((r) => r.debit || r.credit);
    const debit = rows.reduce((s, r) => s + r.debit, 0);
    const credit = rows.reduce((s, r) => s + r.credit, 0);
    return { rows, debit, credit };
  },
  docStatus(doc) {
    if (!DOC_TYPES[doc.type].posting) return doc.status || 'open';
    const total = this.docTotal(doc);
    const paid = Number(doc.paid || 0);
    if (paid <= 0) return 'unpaid';
    if (paid + 0.001 >= total) return 'paid';
    return 'partial';
  },
  docBalance(doc) { return Math.max(0, this.docTotal(doc) - Number(doc.paid || 0)); },

  // ---------------- lookups ----------------
  party(id) { return this.data.parties.find((p) => p.id === id) || null; },
  item(id) { return this.data.items.find((i) => i.id === id) || null; },
  categoryName(id) { const c = this.data.categories.find((x) => x.id === id); return c ? c.name : '—'; },
  postedDocs() { return this.data.docs.filter((d) => DOC_TYPES[d.type].posting); },

  // ---------------- party balances ----------------
  partySummary(partyId) {
    let receivable = 0, payable = 0;
    const p = this.party(partyId);
    if (!p) return { receivable, payable };
    if (p.type === 'supplier') payable += Number(p.opening || 0);
    else receivable += Number(p.opening || 0);

    for (const d of this.postedDocs()) {
      if (d.partyId !== partyId) continue;
      const posting = DOC_TYPES[d.type].posting;
      const total = this.docTotal(d);
      if (posting === 'sale') receivable += total;
      else if (posting === 'sale_return') receivable -= total;
      else if (posting === 'purchase') payable += total;
      else if (posting === 'purchase_return') payable -= total;
    }
    for (const pay of this.data.payments) {
      if (pay.partyId !== partyId) continue;
      if (pay.dir === 'in') receivable -= Number(pay.amount || 0);
      else payable -= Number(pay.amount || 0);
    }
    return { receivable, payable };
  },

  totalReceivable() { return this.data.parties.reduce((s, p) => s + Math.max(0, this.partySummary(p.id).receivable), 0); },
  totalPayable() { return this.data.parties.reduce((s, p) => s + Math.max(0, this.partySummary(p.id).payable), 0); },

  // ---------------- stock ----------------
  stockOf(itemId) {
    const it = this.item(itemId);
    let q = Number(it ? it.openingStock : 0);
    for (const d of this.postedDocs()) {
      const posting = DOC_TYPES[d.type].posting;
      for (const l of d.lines || []) {
        if (Number(l.itemId) !== Number(itemId)) continue;
        const n = Number(l.qty || 0);
        if (posting === 'purchase') q += n;
        else if (posting === 'purchase_return') q -= n;
        else if (posting === 'sale') q -= n;
        else if (posting === 'sale_return') q += n;
      }
    }
    return q;
  },
  stockValue() { return this.data.items.reduce((s, i) => s + this.stockOf(i.id) * Number(i.purchaseRate || 0), 0); },
  lowStockItems() {
    return this.data.items.filter((i) => Number(i.lowStock || 0) > 0 && this.stockOf(i.id) <= Number(i.lowStock));
  },

  // ---------------- dashboard KPIs ----------------
  kpis(from, to) {
    const docs = this.data.docs.filter((d) => inRange(d.date, from, to));
    const sales = docs.filter((d) => DOC_TYPES[d.type].posting === 'sale');
    const credits = docs.filter((d) => DOC_TYPES[d.type].posting === 'sale_return');
    const purchases = docs.filter((d) => DOC_TYPES[d.type].posting === 'purchase');
    const returns = docs.filter((d) => DOC_TYPES[d.type].posting === 'purchase_return');
    const sum = (a) => a.reduce((s, d) => s + this.docTotal(d), 0);
    const expenses = this.data.expenses.filter((e) => inRange(e.date, from, to));
    const otherIncome = this.data.otherIncome.filter((e) => inRange(e.date, from, to));

    const revenue = sum(sales) - sum(credits);
    const cost = sum(purchases) - sum(returns);
    const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const otherTotal = otherIncome.reduce((s, e) => s + Number(e.amount || 0), 0);

    return {
      revenue, cost, expenseTotal, otherTotal,
      profit: revenue - cost - expenseTotal + otherTotal,
      salesCount: sales.length,
      taxOut: sales.reduce((s, d) => s + this.docTax(d), 0) - credits.reduce((s, d) => s + this.docTax(d), 0),
      taxIn: purchases.reduce((s, d) => s + this.docTax(d), 0) - returns.reduce((s, d) => s + this.docTax(d), 0),
      expenses, otherIncome
    };
  },

  // ---------------- GST summary ----------------
  gstSummary(from, to) {
    const rows = new Map();
    const bump = (rate, taxable, tax, side) => {
      const key = rate + '|' + side;
      const cur = rows.get(key) || { rate, side, taxable: 0, tax: 0 };
      cur.taxable += taxable; cur.tax += tax;
      rows.set(key, cur);
    };
    for (const d of this.postedDocs()) {
      if (!inRange(d.date, from, to)) continue;
      const posting = DOC_TYPES[d.type].posting;
      for (const l of d.lines || []) {
        const taxable = this.lineAmount(l);
        const tax = this.lineTax(l);
        if (posting === 'sale') bump(Number(l.taxPercent || 0), taxable, tax, 'Output');
        else if (posting === 'sale_return') bump(Number(l.taxPercent || 0), -taxable, -tax, 'Output');
        else if (posting === 'purchase') bump(Number(l.taxPercent || 0), taxable, tax, 'Input');
        else if (posting === 'purchase_return') bump(Number(l.taxPercent || 0), -taxable, -tax, 'Input');
      }
    }
    return Array.from(rows.values()).sort((a, b) => a.side.localeCompare(b.side) || a.rate - b.rate);
  },

  // ---------------- day book ----------------
  dayBook(from, to) {
    const entries = [];
    for (const d of this.data.docs) {
      if (!inRange(d.date, from, to)) continue;
      const posting = DOC_TYPES[d.type].posting;
      if (!posting) continue;
      const sale = posting === 'sale' || posting === 'sale_return';
      const sign = (posting === 'sale' || posting === 'purchase') ? 1 : -1;
      entries.push({
        date: d.date, kind: DOC_TYPES[d.type].label, ref: d.number,
        party: d.partyName, detail: this.docStatus(d),
        money: sign * this.docTotal(d), side: sale ? 'Sale' : 'Purchase'
      });
    }
    for (const p of this.data.payments) {
      if (!inRange(p.date, from, to)) continue;
      entries.push({
        date: p.date, kind: p.dir === 'in' ? 'Payment In' : 'Payment Out', ref: p.mode || '—',
        party: p.partyName, detail: p.notes || '', money: Number(p.amount || 0) * (p.dir === 'in' ? -1 : -1), side: 'Money'
      });
    }
    for (const e of this.data.expenses) {
      if (!inRange(e.date, from, to)) continue;
      entries.push({ date: e.date, kind: 'Expense', ref: e.category, party: '', detail: e.notes || '', money: -Number(e.amount || 0), side: 'Money' });
    }
    for (const o of this.data.otherIncome) {
      if (!inRange(o.date, from, to)) continue;
      entries.push({ date: o.date, kind: 'Other Income', ref: o.source || '', party: '', detail: o.notes || '', money: Number(o.amount || 0), side: 'Money' });
    }
    return entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  },

  cashflow(from, to) {
    let inflow = 0, outflow = 0;
    for (const p of this.data.payments) {
      if (!inRange(p.date, from, to)) continue;
      if (p.dir === 'in') inflow += Number(p.amount || 0); else outflow += Number(p.amount || 0);
    }
    for (const o of this.data.otherIncome) if (inRange(o.date, from, to)) inflow += Number(o.amount || 0);
    for (const e of this.data.expenses) if (inRange(e.date, from, to)) outflow += Number(e.amount || 0);
    return { inflow, outflow, net: inflow - outflow };
  },

  accountBalance(accountId) {
    const acc = this.data.accounts.find((a) => a.id === accountId);
    let bal = Number(acc ? acc.opening : 0);
    for (const p of this.data.payments) {
      if (Number(p.accountId) !== Number(accountId)) continue;
      bal += (p.dir === 'in' ? 1 : -1) * Number(p.amount || 0);
    }
    for (const e of this.data.expenses) if (Number(e.accountId) === Number(accountId)) bal -= Number(e.amount || 0);
    for (const o of this.data.otherIncome) if (Number(o.accountId) === Number(accountId)) bal += Number(o.amount || 0);
    return bal;
  },

  // ---------------- CRUD ----------------
  async upsertDoc(doc) {
    const list = this.data.docs;
    if (!doc.id) { doc.id = nextId(list); list.push(doc); }
    else {
      const i = list.findIndex((d) => d.id === doc.id);
      if (i >= 0) list[i] = doc; else list.push(doc);
    }
    await this.save();
    return doc;
  },
  async deleteDoc(id) {
    this.data.docs = this.data.docs.filter((d) => d.id !== id);
    await this.save();
  },
  async upsertParty(p) {
    if (!p.id) { p.id = nextId(this.data.parties); this.data.parties.push(p); }
    else { const i = this.data.parties.findIndex((x) => x.id === p.id); this.data.parties[i] = p; }
    await this.save();
    return p;
  },
  async deleteParty(id) {
    this.data.parties = this.data.parties.filter((p) => p.id !== id);
    await this.save();
  },
  async upsertItem(it) {
    if (!it.id) { it.id = nextId(this.data.items); this.data.items.push(it); }
    else { const i = this.data.items.findIndex((x) => x.id === it.id); this.data.items[i] = it; }
    await this.save();
    return it;
  },
  async deleteItem(id) {
    this.data.items = this.data.items.filter((i) => i.id !== id);
    await this.save();
  },
  async upsertPayment(p) {
    if (!p.id) { p.id = nextId(this.data.payments); this.data.payments.push(p); }
    else { const i = this.data.payments.findIndex((x) => x.id === p.id); this.data.payments[i] = p; }
    // reflect on linked document
    if (p.docId) {
      const doc = this.data.docs.find((d) => d.id === p.docId);
      if (doc) doc.paid = Number(doc.paid || 0) + Number(p.amount || 0);
    }
    await this.save();
    return p;
  },
  // update a payment in place (no document side-effects)
  async updatePayment(id, patch) {
    const i = this.data.payments.findIndex((p) => p.id === id);
    if (i >= 0) this.data.payments[i] = { ...this.data.payments[i], ...patch };
    await this.save();
  },

  async deletePayment(id) {
    const p = this.data.payments.find((x) => x.id === id);
    if (p && p.docId) {
      const doc = this.data.docs.find((d) => d.id === p.docId);
      if (doc) doc.paid = Math.max(0, Number(doc.paid || 0) - Number(p.amount || 0));
    }
    this.data.payments = this.data.payments.filter((x) => x.id !== id);
    await this.save();
  },
  async upsertExpense(e) {
    if (!e.id) { e.id = nextId(this.data.expenses); this.data.expenses.push(e); }
    else { const i = this.data.expenses.findIndex((x) => x.id === e.id); this.data.expenses[i] = e; }
    await this.save();
    return e;
  },
  async deleteExpense(id) { this.data.expenses = this.data.expenses.filter((e) => e.id !== id); await this.save(); },
  async upsertIncome(o) {
    if (!o.id) { o.id = nextId(this.data.otherIncome); this.data.otherIncome.push(o); }
    else { const i = this.data.otherIncome.findIndex((x) => x.id === o.id); this.data.otherIncome[i] = o; }
    await this.save();
    return o;
  },
  async deleteIncome(id) { this.data.otherIncome = this.data.otherIncome.filter((x) => x.id !== id); await this.save(); },
  async upsertAccount(a) {
    if (!a.id) { a.id = nextId(this.data.accounts); this.data.accounts.push(a); }
    else { const i = this.data.accounts.findIndex((x) => x.id === a.id); this.data.accounts[i] = a; }
    await this.save();
    return a;
  },
  async deleteAccount(id) { this.data.accounts = this.data.accounts.filter((a) => a.id !== id); await this.save(); },
  async upsertCategory(c) {
    if (!c.id) { c.id = nextId(this.data.categories); this.data.categories.push(c); }
    else { const i = this.data.categories.findIndex((x) => x.id === c.id); this.data.categories[i] = c; }
    await this.save();
    return c;
  },
  async deleteCategory(id) { this.data.categories = this.data.categories.filter((c) => c.id !== id); await this.save(); },
  async saveProfile() { await this.save(); }
};
