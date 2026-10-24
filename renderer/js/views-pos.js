'use strict';
window.Views = window.Views || {};

// ============================================================ Point of Sale
// Quick counter sale: tap items, take payment, get an invoice.
window.Views.pos = function (view, actions, sub) {
  sub.textContent = 'Fast counter billing — tap items, then complete the sale';
  let query = '', cart = [], partyId = 0, payMode = 'Cash';

  function itemPool() {
    const q = query.toLowerCase();
    return Store.data.items.filter((i) => !q || (i.name + ' ' + (i.barcode || '') + ' ' + (i.hsn || '')).toLowerCase().includes(q));
  }

  function addToCart(item) {
    const line = cart.find((l) => l.itemId === item.id);
    if (line) line.qty += 1;
    else cart.push({ itemId: item.id, itemName: item.name, hsn: item.hsn, unit: item.unit, qty: 1, rate: item.saleRate, discountPercent: 0, taxPercent: item.taxPercent });
    draw();
  }

  function cartTotals() {
    const doc = { lines: cart };
    return {
      subtotal: Store.docSubtotal(doc),
      tax: Store.docTax(doc),
      total: Store.docSubtotal(doc) + Store.docTax(doc)
    };
  }

  function draw() {
    actions.innerHTML = '';
    const scanBtn = el('button', { class: 'btn' });
    scanBtn.appendChild(iconEl('camera', 15));
    scanBtn.appendChild(el('span', { text: 'Scan item' }));
    scanBtn.onclick = () => window.Views.scanCode({ onDetect: (code) => {
      const it = findItemByCode(code);
      if (it) addToCart(it); else toast('No item with code ' + code, true);
    } });
    actions.appendChild(scanBtn);

    view.innerHTML = '';
    const layout = el('div', { class: 'pos-layout' });

    // ---- left: catalogue
    const left = el('div', { class: 'pos-left' });
    const bar = el('div', { class: 'toolbar' });
    const q = el('input', { placeholder: 'Search items or scan…', value: query, style: 'max-width:340px' });
    q.oninput = debounce(() => { query = q.value; draw(); }, 200);
    const scanInp = el('input', { placeholder: '⌨️ Scan code ⏎', style: 'max-width:220px' });
    attachScanField(scanInp, (code) => { const it = findItemByCode(code); if (it) addToCart(it); else toast('No item with code ' + code, true); });
    bar.appendChild(q); bar.appendChild(scanInp);
    left.appendChild(bar);

    const pool = itemPool();
    if (!pool.length) left.appendChild(emptyState('box', 'No items found', 'Add items first, or clear the search.'));
    else {
      const grid = el('div', { class: 'pos-grid' });
      pool.forEach((i) => {
        const b = el('button', { class: 'pos-item' });
        b.appendChild(el('div', { class: 'pi-name', text: i.name }));
        b.appendChild(el('div', { class: 'pi-price', text: money(i.saleRate) }));
        b.appendChild(el('div', { class: 'pi-stock', text: 'stock ' + qty(Store.stockOf(i.id)) }));
        b.onclick = () => addToCart(i);
        grid.appendChild(b);
      });
      left.appendChild(grid);
    }
    layout.appendChild(left);

    // ---- right: cart
    const right = el('div', { class: 'pos-cart' });
    right.appendChild(el('div', { class: 'pos-cart-head', text: 'Current sale' }));

    if (!cart.length) {
      const hint = el('div', { class: 'empty', style: 'padding:30px 14px;border:0' });
      hint.appendChild(el('div', { class: 'big' })).innerHTML = iconSvg('cart', 30);
      hint.appendChild(el('h3', { text: 'Cart is empty' }));
      hint.appendChild(el('p', { text: 'Tap an item to add it.' }));
      right.appendChild(hint);
    } else {
      cart.forEach((l, idx) => {
        const row = el('div', { class: 'pos-line' });
        const name = el('div', { class: 'pl-name', text: l.itemName });
        const minus = el('button', { class: 'btn sm', text: '−' });
        minus.onclick = () => { l.qty = Math.max(1, l.qty - 1); draw(); };
        const qtyIn = el('input', { type: 'number', step: '1', value: l.qty, style: 'width:56px' });
        qtyIn.oninput = () => { l.qty = Number(qtyIn.value) || 1; draw(); };
        const plus = el('button', { class: 'btn sm', text: '+' });
        plus.onclick = () => { l.qty += 1; draw(); };
        const amt = el('div', { class: 'pl-amt', text: money(Store.lineTotal(l)) });
        const del = el('button', { class: 'btn sm danger', text: '✕' });
        del.onclick = () => { cart.splice(idx, 1); draw(); };
        row.appendChild(name); row.appendChild(minus); row.appendChild(qtyIn); row.appendChild(plus); row.appendChild(amt); row.appendChild(del);
        right.appendChild(row);
      });
    }

    const t = cartTotals();
    const totals = el('div', { class: 'pos-totals' });
    totals.innerHTML = `
      <div class="stat-line"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      <div class="stat-line"><span>Tax</span><span>${money(t.tax)}</span></div>
      <div class="stat-line"><span><strong>Total</strong></span><span><strong>${money(t.total)}</strong></span></div>`;
    right.appendChild(totals);

    const partySel = el('select');
    partySel.innerHTML = '<option value="0">Walk-in customer</option>' +
      Store.data.parties.filter((p) => p.type !== 'supplier').map((p) => `<option value="${p.id}" ${p.id === partyId ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    partySel.onchange = () => { partyId = Number(partySel.value); };
    const paySel = el('select');
    paySel.innerHTML = PAY_METHODS.map((m) => `<option ${m === payMode ? 'selected' : ''}>${m}</option>`).join('');
    paySel.onchange = () => { payMode = paySel.value; };

    const fields = el('div', { class: 'grid-2 form', style: 'margin-top:10px' });
    const f1 = el('div', { class: 'field' }, [el('label', { text: 'Customer' }), partySel]);
    const f2 = el('div', { class: 'field' }, [el('label', { text: 'Payment mode' }), paySel]);
    fields.appendChild(f1); fields.appendChild(f2);
    right.appendChild(fields);

    const complete = el('button', { class: 'btn primary block', style: 'margin-top:10px' });
    complete.appendChild(iconEl('check', 15));
    complete.appendChild(el('span', { text: 'Complete sale · ' + money(t.total) }));
    complete.disabled = !cart.length;
    complete.onclick = async () => {
      const party = Store.party(partyId);
      const doc = {
        id: 0, type: 'invoice', number: Store.nextNumber('invoice'), date: today(),
        partyId: partyId || 0, partyName: party ? party.name : 'Walk-in customer',
        lines: cart.map((l) => ({ ...l })), notes: 'POS sale', paid: t.total, status: 'paid',
        paymentMode: payMode
      };
      const saved = await Store.upsertDoc(doc);
      cart = [];
      toast('Sale completed · ' + saved.number);
      draw();
      window.Views.viewDoc(saved.id);
    };
    right.appendChild(complete);

    const clear = el('button', { class: 'btn ghost block', text: 'Clear cart', style: 'margin-top:6px' });
    clear.disabled = !cart.length;
    clear.onclick = () => { cart = []; draw(); };
    right.appendChild(clear);

    layout.appendChild(right);
    view.appendChild(layout);
  }

  draw();
};
