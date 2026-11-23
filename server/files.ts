import { randomUUID } from "node:crypto";
import path from "node:path";
import { one, transaction, audit } from "./db";
import { authenticate, has, throttle } from "./auth";
import { requireThat } from "./errors";
import { boundedBody } from "./request-body";
import { allowedOrigin } from "./origin";
import { scanDocument } from "./scan";
import {
  storePrivateFile,
  readPrivateFile,
  deletePrivateFile,
} from "./private-storage";
const allowed = ["application/pdf", "image/jpeg", "image/png"];
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
  const deferred = process.env.DOCUMENT_SCAN_MODE === "deferred";
  if (!deferred) await scanDocument(bytes);
  const state = deferred ? "quarantined" : "clean";
  const key = `documents/${user.id}/${randomUUID()}`;
  await storePrivateFile(key, bytes, file.type);
  try {
    return await transaction(async (db) => {
      const record = await one(
        "INSERT INTO documents(owner_id,filename,mime_type,size_bytes,storage_key,purpose,state) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,filename,mime_type,size_bytes,purpose,state,created_at",
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
          state,
        ],
        db,
      );
      await audit(db, user.id, "document.uploaded", record!.id, {
        purpose,
        state,
      });
      return record;
    });
  } catch (error) {
    // Do not leave an untracked private object after a failed database write.
    try {
      await deletePrivateFile(key);
    } catch {
      console.error(
        "Private document cleanup failed; storage reconciliation is required.",
      );
    }
    throw error;
  }
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
  if (!permitted && doc.purpose === "assignment_attachment")
    permitted = Boolean(
      await one(
        "SELECT s.id FROM submissions s JOIN assignments a ON a.id=s.assignment_id JOIN cohorts h ON h.id=a.cohort_id WHERE s.document_id=$1 AND ($2 OR ($3 AND h.trainer_id=$4)) LIMIT 1",
        [doc.id, has(user, "admin"), has(user, "trainer"), user.id],
      ),
    );
  requireThat(permitted, 403, "You cannot access this document.");
  const bytes = await readPrivateFile(doc.storage_key);
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
