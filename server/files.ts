import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { one, rows, pool, transaction, audit } from "./db";
import { authenticate, has, isDemo, throttle, type User } from "./auth";
import { AppError, requireThat } from "./errors";
import { boundedBody } from "./request-body";
import { allowedOrigin } from "./origin";
import { scanDocument } from "./scan";
const allowed = ["application/pdf", "image/jpeg", "image/png"];
function storage() {
  if (!getApps().length)
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  return getStorage().bucket(process.env.GCS_PRIVATE_BUCKET);
}
function signatureMatches(bytes: Buffer, mime: string) {
  return mime === "application/pdf"
    ? bytes.subarray(0, 5).toString() === "%PDF-"
    : mime === "image/png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}
export async function uploadDocument(request: Request) {
  const user = await authenticate(request);
  const origin = request.headers.get("origin");
  requireThat(
    !origin || allowedOrigin(origin),
    403,
    "Unrecognized request origin.",
  );
  if (request.headers.get("cookie")?.includes("incys_session="))
    requireThat(
      allowedOrigin(origin),
      403,
      "A same-origin request is required.",
    );
  requireThat(
    Number(request.headers.get("content-length") || 0) <= 11 * 1024 * 1024,
    413,
    "Maximum upload size is 10 MB.",
  );
  const bounded = await boundedBody(request, 11 * 1024 * 1024);
  const form = await new Response(bounded as BodyInit, {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData(),
    file = form.get("file"),
    purpose = form.get("purpose");
  requireThat(
    file instanceof File && file.size > 0 && file.size <= 10 * 1024 * 1024,
    400,
    "Choose a PDF, PNG or JPEG file under 10 MB.",
  );
  requireThat(
    allowed.includes(file.type),
    400,
    "Only PDF, PNG and JPEG documents are supported.",
  );
  requireThat(
    ["patient_report", "admission_document", "assignment_attachment"].includes(
      String(purpose),
    ),
    400,
    "Select a valid document purpose.",
  );
  const bytes = Buffer.from(await file.arrayBuffer());
  requireThat(
    signatureMatches(bytes, file.type),
    400,
    "The file content does not match its declared format.",
  );
  await throttle(`document-upload:${user.id}`, 20, 3600);
  await scanDocument(bytes);
  const key = `documents/${user.id}/${randomUUID()}`;
  if (process.env.GCS_PRIVATE_BUCKET)
    await storage()
      .file(key)
      .save(bytes, {
        contentType: file.type,
        resumable: false,
        metadata: { cacheControl: "private, no-store" },
      });
  else {
    requireThat(isDemo(), 503, "Private file storage is not configured.");
    const dest = path.join(process.cwd(), "uploads", key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, bytes, { flag: "wx" });
  }
  return transaction(async (db) => {
    const record = await one(
      "INSERT INTO documents(owner_id,filename,mime_type,size_bytes,storage_key,purpose,state) VALUES($1,$2,$3,$4,$5,$6,'clean') RETURNING id,filename,mime_type,size_bytes,purpose,state,created_at",
      [
        user.id,
        path
          .basename(file.name)
          .replace(/[\r\n"\\]/g, "")
          .slice(0, 180),
        file.type,
        file.size,
        key,
        purpose,
      ],
      db,
    );
    await audit(db, user.id, "document.uploaded", record!.id, { purpose });
    return record;
  });
}
export async function downloadDocument(request: Request, id: string) {
  const user = await authenticate(request),
    doc = await one("SELECT * FROM documents WHERE id=$1 AND state='clean'", [
      id,
    ]);
  requireThat(doc, 404, "Document not found.");
  let permitted = doc.owner_id === user.id;
  if (!permitted && has(user, "admin") && doc.purpose === "admission_document")
    permitted = true;
  if (!permitted && has(user, "clinician") && doc.purpose === "patient_report")
    permitted = Boolean(
      await one(
        "SELECT id FROM appointments WHERE patient_id=$1 AND practitioner_id=$2 AND status IN ('confirmed','completed') LIMIT 1",
        [doc.owner_id, user.id],
      ),
    );
  requireThat(permitted, 403, "You cannot access this document.");
  let bytes: Buffer;
  if (process.env.GCS_PRIVATE_BUCKET)
    [bytes] = await storage().file(doc.storage_key).download();
  else {
    requireThat(isDemo(), 503, "Storage is unavailable.");
    bytes = await readFile(
      path.join(process.cwd(), "uploads", doc.storage_key),
    );
  }
  await transaction((db) => audit(db, user.id, "document.downloaded", id));
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
