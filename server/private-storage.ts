import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { supabaseServer } from "./supabase";
import { requireThat } from "./errors";

function demoStorage() {
  return (
    process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production"
  );
}
function gcs() {
  if (!getApps().length)
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  return getStorage().bucket(process.env.GCS_PRIVATE_BUCKET);
}
async function supabaseStorage() {
  const client = supabaseServer(true),
    bucket = process.env.SUPABASE_STORAGE_BUCKET;
  requireThat(bucket, 503, "Private file storage is not configured.");
  const { data, error } = await client.storage.getBucket(bucket);
  requireThat(
    !error && data && !data.public,
    503,
    "Private file storage is unavailable.",
  );
  return client.storage.from(bucket);
}
export async function storePrivateFile(
  key: string,
  bytes: Buffer,
  mime: string,
) {
  if (process.env.STORAGE_PROVIDER === "supabase") {
    const { error } = await (
      await supabaseStorage()
    ).upload(key, bytes, {
      contentType: mime,
      cacheControl: "0",
      upsert: false,
    });
    requireThat(
      !error,
      503,
      "Private file storage is temporarily unavailable.",
    );
  } else if (process.env.GCS_PRIVATE_BUCKET) {
    await gcs()
      .file(key)
      .save(bytes, {
        contentType: mime,
        resumable: false,
        metadata: { cacheControl: "private, no-store" },
      });
  } else {
    requireThat(demoStorage(), 503, "Private file storage is not configured.");
    const destination = path.join(process.cwd(), "uploads", key);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx" });
  }
}
export async function readPrivateFile(key: string): Promise<Buffer> {
  if (process.env.STORAGE_PROVIDER === "supabase") {
    const { data, error } = await (await supabaseStorage()).download(key);
    requireThat(
      !error && data && data.size <= 10 * 1024 * 1024,
      503,
      "Private file storage is temporarily unavailable.",
    );
    return Buffer.from(await data.arrayBuffer());
  }
  if (process.env.GCS_PRIVATE_BUCKET)
    return (await gcs().file(key).download())[0];
  requireThat(demoStorage(), 503, "Private file storage is not configured.");
  return readFile(path.join(process.cwd(), "uploads", key));
}
export async function deletePrivateFile(key: string) {
  if (process.env.STORAGE_PROVIDER === "supabase") {
    const { error } = await (await supabaseStorage()).remove([key]);
    requireThat(
      !error,
      503,
      "Private file storage is temporarily unavailable.",
    );
  } else if (process.env.GCS_PRIVATE_BUCKET) await gcs().file(key).delete();
  else {
    requireThat(demoStorage(), 503, "Private file storage is not configured.");
    await unlink(path.join(process.cwd(), "uploads", key));
  }
}
