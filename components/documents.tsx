"use client";
import { useState, type FormEvent } from "react";
import { authHeaders } from "@/lib/client";
export function DocumentDownload({
  id,
  filename,
}: {
  id: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/v1/documents/${id}`, {
        headers: await authHeaders(),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="button tiny secondary"
        disabled={busy}
        onClick={download}
      >
        {busy ? "Downloading…" : `Download ${filename}`}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function Documents({
  documents,
  refresh,
}: {
  documents: any[];
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/documents", {
        method: "POST",
        headers: await authHeaders(),
        body: new FormData(form),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error);
      form.reset();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Authorized documents</h2>
      <p className="muted">
        Upload reports or academic documents as PDF, JPEG or PNG. Maximum 10 MB.
        Files awaiting a safety check cannot be downloaded or submitted as
        coursework.
      </p>
      <form onSubmit={upload}>
        <div className="form-grid">
          <label>
            Document purpose
            <select name="purpose">
              <option value="patient_report">Patient report</option>
              <option value="admission_document">Admission document</option>
              <option value="assignment_attachment">
                Assignment attachment
              </option>
            </select>
          </label>
          <label>
            Select a document
            <input
              type="file"
              name="file"
              accept="application/pdf,image/jpeg,image/png"
              required
            />
          </label>
        </div>
        <button className="button small" disabled={busy}>
          {busy ? "Checking and uploading…" : "Upload document"}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Purpose</th>
              <th>Size</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.filename}
                  <small>{d.owner_name}</small>
                </td>
                <td>{d.purpose.replaceAll("_", " ")}</td>
                <td>{Math.ceil(d.size_bytes / 1024)} KB</td>
                <td>
                  {d.state === "clean" ? (
                    <DocumentDownload id={d.id} filename={d.filename} />
                  ) : (
                    <span>
                      {d.state === "quarantined"
                        ? "Awaiting safety check"
                        : "Rejected by safety check"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
