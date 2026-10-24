'use strict';
window.Views = window.Views || {};

const REPORTS = [
  { id: 'sales', icon: '💵', title: 'Sales report', desc: 'All sales documents with totals and tax' },
  { id: 'purchase', icon: '🛒', title: 'Purchase report', desc: 'Purchases and supplier returns' },
  { id: 'expense', icon: '💸', title: 'Expense report', desc: 'Spending grouped by category' },
  { id: 'pnl', icon: '📈', title: 'Profit & loss', desc: 'Revenue, cost, expenses and net profit' },
  { id: 'outstanding', icon: '⏳', title: 'Outstanding', desc: 'Who owes you and whom you owe' },
  { id: 'stock', icon: '📦', title: 'Stock summary', desc: 'Live quantity and value per item' },
  { id: 'gst', icon: 'chart', title: 'GST summary', desc: 'Output and input tax by rate' },
  { id: 'gst_split', icon: 'chart', title: 'GST (CGST/SGST/IGST)', desc: 'Rate-wise tax split for returns' },
  { id: 'gstr1', icon: 'clipboard', title: 'GSTR-1 (outward supplies)', desc: 'B2B and B2C sales, rate-wise, with HSN summary' },
  { id: 'gstr3b', icon: 'clipboard', title: 'GSTR-3B (monthly summary)', desc: 'Outward supplies, input credit and net GST payable' },
  { id: 'hsn', icon: 'barcode', title: 'HSN summary', desc: 'Taxable value and tax by HSN code' },
  { id: 'daybook', icon: 'calendar', title: 'Day book', desc: 'Every entry, newest first' },
  { id: 'trial_balance', icon: 'list', title: 'Trial balance', desc: 'Debit and credit balances' },
  { id: 'balance_sheet', icon: 'building', title: 'Balance sheet', desc: 'Assets, liabilities and equity (simplified)' },
  { id: 'expiry', icon: 'alert', title: 'Expiry & batch', desc: 'Items expiring soon or already expired' }
];

window.Views.reports = function (view, actions, sub) {
  sub.textContent = 'Understand how your business is doing';
  actions.innerHTML = '';
  view.innerHTML = '';
  const grid = el('div', { class: 'grid-3' });
  REPORTS.forEach((r) => {
    const c = el('div', { class: 'panel', style: 'cursor:pointer' });
    c.appendChild(el('div', { class: 'panel-body' }, [
      el('div', { style: 'font-size:24px', text: r.icon }),
      el('div', { style: 'font-weight:700;margin-top:6px', text: r.title }),
      el('div', { class: 'muted', style: 'font-size:12.5px;margin-top:2px', text: r.desc })
    ]));
    c.onclick = () => window.Views.go('report:' + r.id);
    grid.appendChild(c);
  });
  view.appendChild(grid);
};

window.Views.report = function (id) {
  return function (view, actions, sub) {
    const meta = REPORTS.find((r) => r.id === id) || REPORTS[0];
    sub.textContent = meta.desc;
    let from = monthStart(-3), to = today();

    function rangeBar(redraw) {
      const bar = el('div', { class: 'toolbar' });
      const f = el('input', { type: 'date', value: from, style: 'width:150px' });
      const t = el('input', { type: 'date', value: to, style: 'width:150px' });
      f.onchange = () => { from = f.value; redraw(); };
      t.onchange = () => { to = t.value; redraw(); };
      bar.appendChild(el('span', { class: 'muted', text: 'From' })); bar.appendChild(f);
      bar.appendChild(el('span', { class: 'muted', text: 'To' })); bar.appendChild(t);
      [['This month', 0], ['Last 3 months', -3], ['This year', null]].forEach(([label, off]) => {
        const b = el('button', { class: 'pill', text: label });
        b.onclick = () => {
          if (off === null) { from = new Date().getFullYear() + '-01-01'; to = today(); }
          else { from = monthStart(off); to = today(); }
          redraw();
        };
        bar.appendChild(b);
      });
      bar.appendChild(el('div', { class: 'grow' }));
      const p = el('button', { class: 'btn', text: '🖨️ Export PDF' });
      p.onclick = () => exportReportPdf(meta, buildReport(id, from, to));
      bar.appendChild(p);
      return bar;
    }

    function draw() {
      actions.innerHTML = '';
      view.innerHTML = '';
      view.appendChild(rangeBar(draw));
      const rep = buildReport(id, from, to);
      if (!rep.rows.length) { view.appendChild(emptyState(meta.icon, 'No data in this period', 'Try widening the date range.')); return; }
      const wrap = el('div', { class: 'table-wrap' });
      wrap.innerHTML = `<table class="data"><thead><tr>${rep.head.map((h, i) => `<th class="${i >= rep.numFrom ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${rep.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i >= rep.numFrom ? 'num' : ''}">${typeof c === 'string' && c.startsWith('<') ? c : esc(c)}</td>`).join('')}</tr>`).join('')}
        ${rep.foot ? `<tr class="total-row">${rep.foot.map((c, i) => `<td class="${i >= rep.numFrom ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>` : ''}
        </tbody></table>`;
      view.appendChild(wrap);
    }
    draw();
  };
};

function buildReport(id, from, to) {
  if (id === 'sales' || id === 'purchase') {
    const types = id === 'sales' ? ['invoice', 'credit_note'] : ['purchase_bill', 'purchase_return'];
    const docs = Store.data.docs.filter((d) => types.includes(d.type) && inRange(d.date, from, to));
    return {
      head: ['Date', 'Type', 'Number', 'Party', 'Tax', 'Total'],
      numFrom: 4,
      rows: docs.map((d) => [fmtDate(d.date), DOC_TYPES[d.type].label, d.number, d.partyName, money(Store.docTax(d)), money(Store.docTotal(d))]),
      foot: ['', '', '', 'Total', money(docs.reduce((s, d) => s + Store.docTax(d), 0)), money(docs.reduce((s, d) => s + Store.docTotal(d), 0))]
    };
  }
  if (id === 'expense') {
    const byCat = new Map();
    Store.data.expenses.filter((e) => inRange(e.date, from, to)).forEach((e) => {
      const k = e.category || 'Other';
      byCat.set(k, (byCat.get(k) || 0) + Number(e.amount || 0));
    });
    const rows = Array.from(byCat.entries()).map(([cat, amt]) => [cat, money(amt)]);
    return { head: ['Category', 'Amount'], numFrom: 1, rows, foot: ['Total', money(Array.from(byCat.values()).reduce((a, b) => a + b, 0))] };
  }
  if (id === 'pnl') {
    const k = Store.kpis(from, to);
    return {
      head: ['Particulars', 'Amount'], numFrom: 1,
      rows: [
        ['Sales', money(k.revenue)],
        ['Purchases (cost of goods)', money(-k.cost)],
        ['Expenses', money(-k.expenseTotal)],
        ['Other income', money(k.otherTotal)]
      ],
      foot: ['Net profit', money(k.profit)]
    };
  }
  if (id === 'outstanding') {
    const rows = Store.data.parties.map((p) => {
      const s = Store.partySummary(p.id);
      return [p.name, p.type, money(s.receivable), money(s.payable)];
    }).filter((r) => r[2] !== money(0) || r[3] !== money(0));
    return {
      head: ['Party', 'Type', 'You’ll get', 'You’ll pay'], numFrom: 2, rows,
      foot: ['Total', '', money(Store.totalReceivable()), money(Store.totalPayable())]
    };
  }
  if (id === 'stock') {
    const rows = Store.data.items.map((i) => {
      const q = Store.stockOf(i.id);
      return [i.name, Store.categoryName(i.categoryId), i.unit, qty(q), money(i.purchaseRate), money(q * Number(i.purchaseRate || 0))];
    });
    return {
      head: ['Item', 'Category', 'Unit', 'Qty', 'Cost rate', 'Value'], numFrom: 3, rows,
      foot: ['Total', '', '', '', '', money(Store.stockValue())]
    };
  }
  if (id === 'gst') {
    const rows = Store.gstSummary(from, to).map((r) => [r.side, pct(r.rate), money(r.taxable), money(r.tax)]);
    const netOut = Store.gstSummary(from, to).filter((r) => r.side === 'Output').reduce((s, r) => s + r.tax, 0);
    const netIn = Store.gstSummary(from, to).filter((r) => r.side === 'Input').reduce((s, r) => s + r.tax, 0);
    return {
      head: ['Side', 'Rate', 'Taxable value', 'Tax'], numFrom: 2, rows,
      foot: ['Net GST payable', '', '', money(Math.max(0, netOut - netIn))]
    };
  }
  if (id === 'gst_split') {
    const rows = [];
    for (const d of Store.postedDocs()) {
      if (!inRange(d.date, from, to)) continue;
      const posting = DOC_TYPES[d.type].posting;
      const sale = posting === 'sale' || posting === 'sale_return';
      const sign = (posting === 'sale' || posting === 'purchase') ? 1 : -1;
      for (const r of Store.gstBreakup(d)) {
        rows.push([sale ? 'Output' : 'Input', pct(r.rate), money(sign * r.taxable), money(sign * r.cgst), money(sign * r.sgst), money(sign * r.igst), money(sign * r.tax)]);
      }
    }
    return {
      head: ['Side', 'Rate', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total tax'], numFrom: 2, rows,
      foot: ['Total', '', '', '', '', '', money(rows.reduce((s, r) => s + Number(String(r[6]).replace(/[^\d.-]/g, '') || 0), 0))]
    };
  }
  if (id === 'gstr1') {
    const g = Store.gstr1Summary(from, to);
    const rows = [];
    g.b2b.forEach((r) => rows.push(['B2B', r.number, fmtDate(r.date), r.party, r.gstin, pct(r.rate), money(r.taxable), money(r.igst), money(r.cgst), money(r.sgst)]));
    g.b2c.forEach((r) => rows.push(['B2C', r.number, fmtDate(r.date), r.party, '—', pct(r.rate), money(r.taxable), money(r.igst), money(r.cgst), money(r.sgst)]));
    const num = (i) => rows.reduce((s, r) => s + Number(String(r[i]).replace(/[^\d.-]/g, '') || 0), 0);
    return {
      head: ['Type', 'Number', 'Date', 'Party', 'GSTIN', 'Rate', 'Taxable', 'IGST', 'CGST', 'SGST'], numFrom: 6, rows,
      foot: ['Total', '', '', '', '', '', money(num(6)), money(num(7)), money(num(8)), money(num(9))]
    };
  }
  if (id === 'gstr3b') {
    const g = Store.gstr3bSummary(from, to);
    const rows = [
      ['3.1 Outward taxable supplies', money(g.outward.taxable), money(g.outward.igst), money(g.outward.cgst), money(g.outward.sgst)],
      ['4 Eligible input tax credit', money(g.itc.taxable), money(g.itc.igst), money(g.itc.cgst), money(g.itc.sgst)],
      ['Net GST payable', '—', money(g.netPayable.igst), money(g.netPayable.cgst), money(g.netPayable.sgst)]
    ];
    return {
      head: ['Particulars', 'Taxable value', 'IGST', 'CGST', 'SGST'], numFrom: 1, rows,
      foot: ['Total payable', '', '', '', money(g.totalPayable)]
    };
  }
  if (id === 'hsn') {
    const rows = Store.hsnSummary(from, to).map((r) => [r.hsn, r.side, pct(r.rate), qty(r.qty), money(r.taxable), money(r.tax)]);
    return {
      head: ['HSN', 'Side', 'Rate', 'Qty', 'Taxable value', 'Tax'], numFrom: 3, rows,
      foot: ['Total', '', '', '', money(Store.hsnSummary(from, to).reduce((s, r) => s + r.taxable, 0)), money(Store.hsnSummary(from, to).reduce((s, r) => s + r.tax, 0))]
    };
  }
  if (id === 'trial_balance') {
    const tb = Store.trialBalance(from, to);
    return {
      head: ['Account', 'Debit', 'Credit'], numFrom: 1,
      rows: tb.rows.map((r) => [r.name, money(r.debit), money(r.credit)]),
      foot: ['Total', money(tb.debit), money(tb.credit)]
    };
  }
  if (id === 'balance_sheet') {
    const bs = Store.balanceSheet(from, to);
    const rows = [
      ...bs.assets.map(([n, v]) => ['Asset · ' + n, money(v)]),
      ...bs.liabilities.map(([n, v]) => ['Liability · ' + n, money(v)]),
      ['Equity (net worth)', money(bs.totals.equity)]
    ];
    return {
      head: ['Particulars', 'Amount'], numFrom: 1, rows,
      foot: ['Assets / Liabilities + Equity', money(bs.totals.assets) + ' / ' + money(bs.totals.liabilities + bs.totals.equity)]
    };
  }
  if (id === 'expiry') {
    const alerts = Store.expiryAlerts(90);
    const rows = alerts.map((a) => [a.item.name, a.item.batch || '—', a.item.godown || '—', fmtDate(a.item.expiry), qty(a.stock), a.expired ? '<span class="badge unpaid">expired</span>' : '<span class="badge partial">expiring</span>']);
    return { head: ['Item', 'Batch', 'Godown', 'Expiry', 'Stock', 'Status'], numFrom: 4, rows, foot: null };
  }
  if (id === 'daybook') {
    const rows = Store.dayBook(from, to).map((e) => [fmtDate(e.date), e.kind, e.ref, e.party, money(e.money)]);
    return { head: ['Date', 'Entry', 'Reference', 'Party', 'Amount'], numFrom: 4, rows, foot: null };
  }
  return { head: ['—'], numFrom: 0, rows: [], foot: null };
}

async function exportReportPdf(meta, rep) {
  const s = Store.data.profile;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Helvetica,Arial,sans-serif;padding:14px;font-size:12px;color:#111}
    h1{font-size:18px;margin:0} .muted{color:#666}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{padding:6px 8px;border-bottom:1px solid #e5e5e5;text-align:left}
    td.num,th.num{text-align:right} tr.total-row td{font-weight:700;background:#f7f7f9}
  </style></head><body>
    <h1>${esc(s.name)} — ${esc(meta.title)}</h1>
    <div class="muted">Generated ${fmtDate(today())}</div>
    <table><thead><tr>${rep.head.map((h, i) => `<th class="${i >= rep.numFrom ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rep.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i >= rep.numFrom ? 'num' : ''}">${esc(String(c).replace(/<[^>]+>/g, ''))}</td>`).join('')}</tr>`).join('')}
    ${rep.foot ? `<tr class="total-row">${rep.foot.map((c, i) => `<td class="${i >= rep.numFrom ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>` : ''}
    </tbody></table></body></html>`;
  try {
    const path = await window.api.exportPdf({ html, filename: meta.title.replace(/\s+/g, '-') + '-' + today() + '.pdf' });
    toast('Saved: ' + path);
  } catch (e) { toast('Export failed: ' + e.message, true); }
}
