# Institute shop and supplier portal

The confirmed business model is **INCYS sells to customers; vendors supply stock to INCYS**. The configured legal name is **Institute for Nature Cure & Yogic Sciences**. GSTIN starts blank, with registration status `pending`; no registration number, registered address or tax status has been invented.

## Workspaces

- Administrators and finance staff open **Shop management** (also the bottom Shop destination). The sections are Overview, Stock, Sales, Supplies, Accounts, Invoices and Settings.
- Suppliers get their own workspace, scoped on the server to their supplier ID. Their five bottom destinations are Home, Stock, Sales, Accounts and Account. Supplies and Business are available from the section bar.
- An administrator can add a supplier using an existing active INCYS account's email, then approve the supplier. Alternatively, a signed-in user can submit the existing vendor application. Both paths require staff/vendor authenticator setup before privileged API access in hosted mode.
- Suppliers may submit products, edit their own catalogue, adjust their own available stock with a reason, and read their own supplies, payments and retail sales. Supplier edits require product review again. Customer delivery addresses and customer invoice contents are restricted to institute staff and the customer.

## Inventory and supplier accounts

Product records include SKU, unit, HSN, configurable GST rate, reorder threshold, batch and expiry. A different batch or unit needs a separate product after stock movements exist. Regulated products still require licence, batch and expiry evidence before publication.

**Receive stock** records a multi-item supplier delivery at agreed tax-inclusive unit costs. It increments available stock and the supplier payable in the same database transaction. The supplier's original invoice/reference is retained; this is not a generated supplier GST invoice or an input-tax-credit claim. Returns reference a receipt, use its original costs and cannot exceed received quantities or available stock. A supplier can have a credit balance after a return of already-paid stock.

**Record payment** records a completed external bank/cash payment; it does not transfer money. Concurrent payments lock the supplier balance and cannot overpay it. A correction adds a reversal dated on the correction day instead of deleting or backdating the old payment. Statements show all-time balances plus opening and closing balances for the chosen dates. CSV exports are available for stock, sales, account entries and the invoice register.

Stock opening balances, reservations, cancellations, adjustments, receipts, supplier returns and unsent refunds have an append-only movement trail. Stock adjustments change counted stock only; they do not create a supplier payable. Supply documents, supplier payments, invoices and credit notes are also append-only at both the database-trigger and runtime-permission levels.

Reports are bounded to 500 sales/document/payment/invoice rows, 1,000 catalogue products and 100 stock movements. Sales totals and supplier balances aggregate the complete eligible history, not the displayed page. Narrow the report dates when the row-limit notice is shown. These are MVP operational reports, not an accounting-system general ledger or a filed GST return.

## Customer invoices

Checkout now explicitly creates an `institute_retail` order, with a snapshot of seller identity, buyer/delivery state, price, product description, HSN, quantity, tax rates and tax amounts. Customer receipts post institute retail revenue and applicable output-tax liabilities. Supplier payables come from accepted supplies, independently of retail sales. Historical marketplace orders retain their previous commission accounting and require their original seller's invoice.

Staff can issue one permanent invoice for a paid retail order. Number allocation is locked, consecutive within an Indian financial year, and unique; retries return the same invoice. Customers can open their own issued invoices from Orders. **Print / Save PDF** produces a printable A4 document in the browser without publishing a public document URL. Full processed refunds generate a linked, separately numbered credit note exactly once. Shipped goods still require physical inspection before a stock adjustment; issuing a refund does not put shipped items straight back into inventory.

Before issuance, the institute must enter its registered address/state and authorised signatory and confirm registration status:

- `pending`: issuance is blocked. The GSTIN field remains blank.
- `non_gst`: commercial invoices collect no GST and keep the requested blank GSTIN space.
- `regular`: a validated GSTIN matching the seller state is required. Product HSN and rates must be configured. Tax-inclusive prices split into CGST + SGST/UTGST for same-state delivery or IGST for interstate delivery. This MVP supports ordinary domestic goods with the same billing and delivery state; different bill-to/ship-to GSTIN states are rejected for review.
- `composition`: bills of supply collect no GST from the customer.

The invoice register exports value, CGST, SGST/UTGST, IGST, place of supply and buyer GSTIN. Credit amounts are negative in the export. Product edits and later seller-setting changes cannot rewrite an issued invoice.

An order placed while registration is pending can become a commercial invoice only after non-GST status is explicitly confirmed. It cannot retroactively gain GST. IRP applicability must be explicitly confirmed as not applicable before this implementation issues a regular GST tax invoice. If IRP is required, issuance is blocked until a proper authorised IRP integration is supplied. The app does not obtain an IRN, file GST returns, calculate cess, handle exports/SEZ/reverse-charge supplies, or replace classification by the institute's accountant.

Invoice fields and numbering were checked against [CBIC invoice and credit-note rules](https://cbic-gst.gov.in/gst-invoice-rules.html) and [the consolidated CGST Rules, including Rule 46](https://cbic-gst.gov.in/pdf/amended-01012022-CGST-Rules-2017-Part-A.pdf). Registration applicability and product tax rates are operator-supplied facts, not inferred from a product name.

## UI and motion

The shared interface uses a brighter teal with violet and coral accents, shorter headings, compact action cards, icon-based section navigation and responsive tables. Local SVG storefront/growth graphics have short entrance animations. The existing opt-in Lottie breathing exercise remains available. Reduced motion is respected, background-tab animation is paused, and no financial or medical response is cached by the service worker. The shared Android trusted web app receives these same web changes.

## Deployment and verification

Migration `007_institute_shop.sql` adds six private tables and product/order fields. Apply it before deploying the new server, then refresh runtime grants/RLS. An older server still gets the historical order-model default during rollout; the new checkout explicitly selects the retailer model. Do not seed synthetic products or invoices into the hosted institute project.

Local checks cover supplier isolation, concurrent stock changes, duplicate receipts, payment overpayment/reversal, historical statement balances, supplier returns, GST rounding, financial-year boundaries, concurrent invoice numbering, immutable snapshots, linked refund credit notes, restricted runtime permissions and historical commission compatibility. Browser checks cover supplier/admin operations, CSV export, invoice printing, customer invoice access, all eight workspaces, reduced motion, and phone/tablet/desktop navigation.

## Current release state — 24 November 2026

Implementation commit `9f5cb7d5bc3cef3935464ac1af5227d16c01cc1f` passed all 37 backend checks, 23 browser scenarios, production build, scanner checks, shared Android build and the legacy Flutter checks in [GitHub Actions](https://github.com/tushar9861/incys_institute/actions/runs/45372646877). The invoice PDF was also inspected as a single A4 page with synthetic data.

**This upgrade is not yet live.** The migration connector repeatedly reset before the database received the write, and the dashboard automation could not connect. Readbacks confirmed migration 007 and its six new tables were absent. A complete, transactional, replay-safe SQL script is prepared at `/workspace/artifacts/INCYS-shop-upgrade.sql` for the owner to run in this project's SQL Editor. The current live service remains on its previous release. After the owner applies it, verify RLS/runtime grants, deploy the tested commit, and perform hosted smoke checks. Do not report the new shop as deployed before that verification.

The owner has designated an administrator email, but its verified sign-in identity was not yet present when checked. Granting the first administrator remains pending that sign-in; do not create an unverified privileged account or bypass the authenticator requirement.
