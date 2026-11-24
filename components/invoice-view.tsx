"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Printer, X } from "lucide-react";
import { api, money, date } from "@/lib/client";
import { stateName } from "@/lib/india";

export function InvoiceButton({ id }: { id: string }) {
  const [record, setRecord] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button
        className="button tiny secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setRecord(await api(`shop/invoices/${id}`));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FileText size={16} />
        {busy ? "Opening…" : "Invoice"}
      </button>
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
      {record && <InvoiceView record={record} close={() => setRecord(null)} />}
    </>
  );
}
export function InvoiceView({
  record,
  close,
}: {
  record: any;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const d = record.document,
    s = d.seller,
    b = d.buyer,
    t = d.totals;
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    document.body.classList.add("invoice-open");
    return () => {
      document.body.classList.remove("invoice-open");
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="invoice-dialog"
      aria-labelledby="invoice-title"
      onCancel={close}
    >
      <div className="invoice-toolbar">
        <button className="button secondary" onClick={() => window.print()}>
          <Printer size={17} />
          Print / Save PDF
        </button>
        <button
          className="icon-button"
          aria-label="Close invoice"
          onClick={close}
        >
          <X />
        </button>
      </div>
      <article className="invoice-paper">
        <header>
          <div>
            <span className="invoice-brand">INCYS</span>
            <h1 id="invoice-title">{d.title}</h1>
            <p>
              {record.kind === "credit_note" ? "Credit note" : "Invoice"}{" "}
              {d.number}
            </p>
          </div>
          <div>
            <strong>{s.legal_name}</strong>
            <p>{s.address || "________________________"}</p>
            <p>
              {stateName(s.state_code)} {s.state_code && `(${s.state_code})`}
            </p>
            <p>GSTIN: {s.gstin || "________________________"}</p>
          </div>
        </header>
        <div className="invoice-parties">
          <div>
            <small>BILL TO / DELIVER TO</small>
            <h2>{b.name}</h2>
            <p>
              {b.line}, {b.city} {b.postcode}
            </p>
            <p>
              {stateName(b.stateCode)} ({b.stateCode})
            </p>
            {b.gstin && <p>GSTIN: {b.gstin}</p>}
          </div>
          <div>
            <p>Issued: {date(d.issuedAt)}</p>
            <p>Order: {d.orderId.slice(0, 8).toUpperCase()}</p>
            <p>
              Place of supply: {stateName(b.stateCode)} ({b.stateCode})
            </p>
            {d.originalNumber && (
              <p>
                Against: {d.originalNumber} · {date(d.originalDate)}
              </p>
            )}
          </div>
        </div>
        <div className="invoice-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Item / HSN</th>
                <th>Qty</th>
                <th>Unit price*</th>
                <th>
                  {s.registration === "regular" ? "Taxable value" : "Value"}
                </th>
                <th>GST</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l: any) => (
                <tr key={l.productId}>
                  <td>
                    {l.name}
                    <small>{l.hsn || "—"}</small>
                  </td>
                  <td>
                    {l.quantity} {l.unit}
                  </td>
                  <td>{money(l.unitPaise)}</td>
                  <td>{money(l.net)}</td>
                  <td>
                    {l.rateBps / 100}%<small>{money(l.tax)}</small>
                  </td>
                  <td>{money(l.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="invoice-total">
          <p>
            <span>Subtotal</span>
            <b>{money(t.net)}</b>
          </p>
          {t.cgst > 0 && (
            <p>
              <span>CGST</span>
              <b>{money(t.cgst)}</b>
            </p>
          )}
          {t.sgst > 0 && (
            <p>
              <span>{d.localTax}</span>
              <b>{money(t.sgst)}</b>
            </p>
          )}
          {t.igst > 0 && (
            <p>
              <span>IGST</span>
              <b>{money(t.igst)}</b>
            </p>
          )}
          <p className="grand-total">
            <span>
              {record.kind === "credit_note" ? "Credit total" : "Total paid"}
            </span>
            <b>{money(t.gross)}</b>
          </p>
        </div>
        <footer>
          <p>*Unit prices include applicable tax. Currency: INR.</p>
          {s.registration === "non_gst" && (
            <p>Commercial invoice. No GST collected.</p>
          )}
          {s.registration === "composition" && (
            <p>
              Composition taxable person, not eligible to collect tax on
              supplies.
            </p>
          )}
          {s.registration === "regular" && <p>Reverse charge: No.</p>}
          {d.reason && <p>{d.reason}</p>}
          <div className="signature-line">
            {s.signatory}
            <small>Authorised signatory</small>
          </div>
        </footer>
      </article>
    </dialog>
  );
}
