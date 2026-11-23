import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { clamCommand, freshSignatures, MAX_UPLOAD } from "./protocol.mjs";
export function createScannerServer(command = clamCommand) {
  const server = createServer(async (req, res) => {
    const reply = (status, body) => {
      if (res.writableEnded) return;
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(body));
    };
    try {
      if (
        !["/health", "/scan"].includes(req.url) ||
        (req.url === "/health" ? req.method !== "GET" : req.method !== "POST")
      )
        return reply(404, { error: "Not found" });
      const version = await command("VERSION");
      if (!freshSignatures(version))
        return reply(503, { error: "Scanner definitions require an update" });
      if (req.url === "/health") return reply(200, { status: "ok" });
      if (req.headers["content-type"] !== "application/octet-stream")
        return reply(415, { error: "Expected file bytes" });
      if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD)
        return reply(413, { error: "Maximum file size is 10 MB" });
      let size = 0;
      const chunks = [];
      // Keep the socket available long enough to return a bounded error response.
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > MAX_UPLOAD) {
          req.resume();
          return reply(413, { error: "Maximum file size is 10 MB" });
        }
        chunks.push(chunk);
      }
      if (!size) return reply(400, { error: "Empty file" });
      const verdict = await command("INSTREAM", Buffer.concat(chunks));
      if (verdict === "stream: OK") return reply(200, { clean: true });
      if (/^stream: .+ FOUND$/.test(verdict))
        return reply(422, { clean: false });
      return reply(503, { error: "Scanner did not return a valid verdict" });
    } catch {
      reply(503, { error: "Scanner temporarily unavailable" });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.setTimeout(35000, (socket) => socket.destroy());
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createScannerServer().listen(
    Number(process.env.PORT || 8080),
    "0.0.0.0",
  );
  process.on("SIGTERM", () => server.close(() => process.exit(0)));
}
