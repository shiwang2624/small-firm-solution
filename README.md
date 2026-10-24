# SmallFirm Solution

Billing, invoicing, inventory and **GST-ready** accounting for small businesses.
Local-first: your books live on your machine. No account, no cloud required.

**Version 3.0.0** — own brand identity (logo + blue palette) and GST compliance.

## Build & run

```bash
cd ~/re-toolkit/projects/SmallFirm
npm install                 # Electron + vendor libraries
bash package.sh             # builds "SmallFirm Solution.app"
open "build/SmallFirm Solution.app"
```

After edits: `bash package.sh && open "build/SmallFirm Solution.app"`.

## What it does

**Sales** — Invoice, Estimate/Quotation, Proforma Invoice, Sale Order,
Delivery Challan, Credit Note
**Purchase** — Purchase Bill, Purchase Order, Purchase Return
**Money** — Payments In/Out, Expenses, Other Income, Bank & Cash, Cheques
**Catalogue** — Items (stock, low-stock alerts, batch, expiry, godown), Categories, Units
**People** — Customers & suppliers with ledger, balances and statement PDF
**Insights** — 14 reports (below)
**Utilities** — Barcode printing, Cheque register, Import & Export, Backup
**Setup** — Business profile, tax, multiple firms, POS

Every document supports line and document **discounts**, **additional charges**,
**round-off**, due dates and per-line GST. Invoices print with an HSN column,
CGST/SGST or IGST split, and **amount in words**.

## GST compliance

- **Place of supply** decides the tax type automatically: same state →
  **CGST + SGST**, different state → **IGST**
- **GSTIN validation** — format, state code and the mod-36 **check digit**
- **State codes** (01–38, 97) with the full state list
- **Invoice numbering rules** — ≤16 characters, allowed characters, uniqueness
- **Compliance checker** on every document — flags a missing business GSTIN,
  invalid party GSTIN, missing HSN, missing place of supply, duplicate numbers
- **Reverse charge** flag
- **GSTR-1 (outward supplies)** — B2B / B2C split, rate-wise, with HSN summary
- **GSTR-3B (monthly summary)** — outward supplies, input tax credit, net payable
- **HSN summary** and **GST (CGST/SGST/IGST)** reports

> Note: this prepares the data for filing. It does not connect to the GST portal,
> and e-invoice (IRN) generation requires IRP credentials — see below.

## Reports

Sales · Purchase · Expense · Profit & Loss · Outstanding · Stock summary ·
GST summary · GST (CGST/SGST/IGST) · GSTR-1 · GSTR-3B · HSN summary ·
Day book · Trial balance · Balance sheet · Expiry & batch

All date-ranged and exportable to PDF.

## Utilities

- **Barcode printing** — pick items, set copies and label size (38×25 / 50×30 / 70×40 mm)
- **Cheques** — register with pending / cleared / bounced
- **Import & Export** — items, parties and documents to CSV; items from CSV
- **Backup & restore** — all firms to one file

## Scanning

- **USB/HID barcode scanner** — a "Scan or type a code, then Enter" field on Items
  and inside the invoice editor
- **Camera scan** — EAN-13/8, UPC-A/E, Code-128/39/93, ITF, Codabar, QR
- Barcode field has a dropdown: Generate · Scan · Print label · Clear

## Brand

Logo and palette live in `brand/`:

| Token | Value |
|---|---|
| Primary blue | `#2454D8` (light `#3370EF`, deep `#1B3FA8`, tint `#E6EEFF`) |
| Logo light blue | `#7EC2F9` |
| Navy (sidebar/wordmark) | `#07172D` |
| Complementary accent | `#F59E0B` (amber) |
| Success / danger | `#0F9D58` / `#D92D20` |

`brand/app.icns` is the macOS app icon; `brand/icons/` holds PWA-ready PNG sizes.

## Data

- Per-firm JSON: `~/Library/Application Support/SmallFirm Solution/firms/<id>.json`
- Firm index: `.../SmallFirm Solution/firms.json`
- PDFs, CSV and backups: `~/Documents/Small Firm/`

## Architecture

| File | Role |
|---|---|
| `main.js` | Electron main: window, firms, storage, PDF, backup, camera permission |
| `preload.js` | `contextBridge` API surface |
| `renderer/index.html` | App shell |
| `renderer/styles.css` | Brand styling |
| `renderer/brand/` | Logo + icon assets |
| `renderer/js/icons.js` | SVG line-icon set |
| `renderer/js/util.js` | DOM helpers, formatting, modal, toast, popup menu |
| `renderer/js/store.js` | State, CRUD, document maths, GST logic, reports |
| `renderer/js/views-main.js` | Dashboard, Transactions, Parties + ledger, Items, Categories |
| `renderer/js/views-money.js` | Documents, payments, expenses, banking, reminders |
| `renderer/js/views-reports.js` | Reports incl. GSTR-1 / GSTR-3B |
| `renderer/js/views-settings.js` | Business settings, firms, backup, help |
| `renderer/js/views-editors.js` | Item & party editors, scanner, labels |
| `renderer/js/views-pos.js` | Point of Sale |
| `renderer/js/views-utilities.js` | Barcode printing, cheques, import/export |
| `renderer/js/app.js` | Navigation, router, palette, shortcuts |

## Distribution notes

Currently an **ad-hoc signed macOS build** — Gatekeeper will warn on first open.
For public distribution you need an Apple Developer ID signature + notarization,
or ship it as an installable web app (PWA) instead.
