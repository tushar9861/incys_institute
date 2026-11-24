"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
export type Field = {
  name: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  value?: any;
  required?: boolean;
  min?: number;
  max?: number;
};
export type Modal = {
  title: string;
  hint?: string;
  fields: Field[];
  submit: (v: any) => Promise<unknown>;
  label?: string;
};
export function FormModal({
  modal,
  close,
  done,
}: {
  modal: Modal;
  close: () => void;
  done: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
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
    const f = new FormData(e.currentTarget),
      v: Record<string, any> = {};
    for (const field of modal.fields) {
      const raw = f.get(field.name);
      if (field.type === "checkbox") v[field.name] = raw === "on";
      else if (field.type === "roles") v[field.name] = f.getAll(field.name);
      else if (raw !== "" && raw != null)
        v[field.name] =
          field.type === "money"
            ? Math.round(Number(raw) * 100)
            : field.type === "number"
              ? Number(raw)
              : field.type === "datetime-local"
                ? new Date(String(raw)).toISOString()
                : raw;
    }
    setBusy(true);
    try {
      await modal.submit(v);
      done();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal-backdrop native-dialog"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <section className="modal">
        <div className="modal-heading">
          <h2 id="modal-title">{modal.title}</h2>
          <button
            className="icon-button"
            onClick={close}
            disabled={busy}
            aria-label="Close"
          >
            <X />
          </button>
        </div>
        <form onSubmit={submit}>
          {modal.hint && <p className="muted">{modal.hint}</p>}
          <div className="form-grid">
            {modal.fields.map((f) => (
              <label
                className={
                  ["textarea", "checkbox", "roles"].includes(f.type || "")
                    ? "span-two"
                    : ""
                }
                key={f.name}
              >
                {f.type !== "checkbox" && f.label}
                {f.type === "select" ? (
                  <select
                    name={f.name}
                    defaultValue={f.value || ""}
                    required={f.required !== false}
                  >
                    <option value="" disabled={f.required !== false}>
                      Select an option
                    </option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    name={f.name}
                    defaultValue={f.value}
                    rows={4}
                    required={f.required !== false}
                  />
                ) : f.type === "checkbox" ? (
                  <span className="check">
                    <input
                      name={f.name}
                      type="checkbox"
                      defaultChecked={f.value}
                      required={f.required === true}
                    />
                    {f.label}
                  </span>
                ) : f.type === "roles" ? (
                  <div className="chips">
                    {f.options?.map((o) => (
                      <label className="check" key={o.value}>
                        <input
                          type="checkbox"
                          name={f.name}
                          value={o.value}
                          defaultChecked={f.value?.includes(o.value)}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                ) : (
                  <input
                    name={f.name}
                    type={f.type === "money" ? "number" : f.type || "text"}
                    defaultValue={f.value}
                    min={f.min ?? (f.type === "money" ? 0 : undefined)}
                    max={f.max}
                    step={f.type === "money" ? "0.01" : undefined}
                    required={f.required !== false}
                  />
                )}
              </label>
            ))}
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button className="button" disabled={busy}>
              {busy ? "Saving…" : modal.label || "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </dialog>
  );
}
