import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createScannerServer } from "../services/scanner/server.mjs";
import { freshSignatures, MAX_UPLOAD } from "../services/scanner/protocol.mjs";
const version = () =>
  `ClamAV 1.5.5/123/${new Date().toUTCString().replace(" GMT", "")}`;
async function withScanner(command, run) {
  const server = createScannerServer(command).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
test("signature freshness rejects stale, invalid and future builds", () => {
  assert.equal(freshSignatures(version()), true);
  assert.equal(freshSignatures("ClamAV 1/123/Mon Nov 01 00:00:00 2020"), false);
  assert.equal(freshSignatures("malformed"), false);
  assert.equal(freshSignatures("ClamAV 1/123/Mon Nov 01 00:00:00 2099"), false);
});
test("scanner accepts only an exact clean verdict and never returns uploaded content", async () => {
  await withScanner(
    async (command, bytes) =>
      command === "VERSION"
        ? version()
        : bytes.toString().includes("clean")
          ? "stream: OK"
          : "stream: OK ERROR",
    async (base) => {
      for (const [body, status] of [
        ["clean bytes", 200],
        ["unknown bytes", 503],
      ]) {
        const r = await fetch(base + "/scan", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body,
        });
        assert.equal(r.status, status);
        assert.ok(!(await r.text()).includes(body));
      }
    },
  );
});
test("scanner rejects detected files and fails closed on engine failure", async () => {
  await withScanner(
    async (command) =>
      command === "VERSION" ? version() : "stream: Eicar-Signature FOUND",
    async (base) => {
      const r = await fetch(base + "/scan", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: "test fixture",
      });
      assert.equal(r.status, 422);
      assert.deepEqual(await r.json(), { clean: false });
    },
  );
  await withScanner(
    async () => {
      throw new Error("private engine detail");
    },
    async (base) => {
      const r = await fetch(base + "/health");
      assert.equal(r.status, 503);
      assert.ok(!(await r.text()).includes("private"));
    },
  );
});
test("outdated definitions stop scanning instead of accepting unchecked uploads", async () => {
  let scans = 0;
  await withScanner(
    async (command) => {
      if (command === "INSTREAM") scans++;
      return "ClamAV 1/123/Mon Nov 01 00:00:00 2020";
    },
    async (base) => {
      const r = await fetch(base + "/scan", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: "test",
      });
      assert.equal(r.status, 503);
      assert.equal(scans, 0);
    },
  );
});
test("upload service enforces content type, non-empty body and streamed size", async () => {
  let scans = 0;
  await withScanner(
    async (command) => {
      if (command === "INSTREAM") scans++;
      return version();
    },
    async (base) => {
      assert.equal(
        (await fetch(base + "/scan", { method: "POST", body: "text" })).status,
        415,
      );
      assert.equal(
        (
          await fetch(base + "/scan", {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: "",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await fetch(base + "/scan", {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: Buffer.alloc(MAX_UPLOAD + 1),
          })
        ).status,
        413,
      );
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_UPLOAD));
          controller.enqueue(new Uint8Array(1));
          controller.close();
        },
      });
      assert.equal(
        (
          await fetch(base + "/scan", {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body,
            duplex: "half",
          })
        ).status,
        413,
      );
      assert.equal(scans, 0);
    },
  );
});
