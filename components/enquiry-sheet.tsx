"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, CheckCircle2, Send } from "lucide-react";
import { api } from "@/lib/client";
export function EnquirySheet({
  interest,
  close,
}: {
  interest: string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  useEffect(() => {
    const d = dialog.current!;
    const trigger = document.activeElement as HTMLElement | null;
    d.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d.close();
      document.body.style.overflow = previous;
      trigger?.focus();
    };
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("enquiries", "POST", {
        name: f.get("name"),
        email: f.get("email"),
        message: f.get("message"),
        interest,
        consent: f.get("consent") === "on",
      });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="enquiry-sheet"
      ref={dialog}
      aria-labelledby="enquiry-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div className="sheet-body">
        <div className="sheet-handle" />
        <button
          aria-label="Close enquiry"
          className="icon-button sheet-close"
          onClick={close}
          disabled={busy}
        >
          <X />
        </button>
        {sent ? (
          <div className="sent-state" role="status">
            <CheckCircle2 size={52} />
            <h2 id="enquiry-title">You’re on our list.</h2>
            <p>
              The institute team has received your enquiry and can reply to your
              email.
            </p>
            <button className="button" onClick={close}>
              Done
            </button>
          </div>
        ) : (
          <>
            <span className="icon-tile mint">
              <Send />
            </span>
            <h2 id="enquiry-title">Let’s talk.</h2>
            <p className="muted">{interest}</p>
            <form onSubmit={submit}>
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  maxLength={200}
                  required
                />
              </label>
              <label>
                How can we help?
                <textarea
                  name="message"
                  rows={3}
                  minLength={5}
                  maxLength={3000}
                  required
                />
              </label>
              <label className="check">
                <input type="checkbox" name="consent" required />I agree to be
                contacted about this enquiry.
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="button" disabled={busy}>
                {busy ? "Sending…" : "Send enquiry"}
              </button>
            </form>
          </>
        )}
      </div>
    </dialog>
  );
}
