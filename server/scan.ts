import { connect } from "node:net";
import { GoogleAuth } from "google-auth-library";
import { isDemo } from "./auth";
import { AppError, requireThat } from "./errors";
const identity = new GoogleAuth();
export async function scanDocument(bytes: Buffer) {
  if (isDemo()) return;
  const url = process.env.SCAN_SERVICE_URL;
  if (url) {
    requireThat(
      new URL(url).protocol === "https:",
      503,
      "The scan service requires HTTPS.",
    );
    try {
      const client = await identity.getIdTokenClient(url);
      const response = await client.request<{ clean?: boolean }>({
        url: `${url}/scan`,
        method: "POST",
        data: bytes,
        headers: { "Content-Type": "application/octet-stream" },
        timeout: 45000,
        retry: false,
        validateStatus: () => true,
      });
      if (response.status === 422)
        throw new AppError(422, "The file did not pass the safety scan.");
      requireThat(
        response.status === 200 && response.data.clean === true,
        503,
        "Document scanning is temporarily unavailable.",
      );
      return;
    } catch (error) {
      if (error instanceof AppError) throw error;
      // The auth/HTTP client's error can include request headers and file data.
      throw new AppError(503, "Document scanning is temporarily unavailable.");
    }
  }
  requireThat(
    process.env.CLAMAV_HOST,
    503,
    "Document scanning is not configured.",
  );
  return scanWithClamd(
    bytes,
    process.env.CLAMAV_HOST,
    Number(process.env.CLAMAV_PORT || 3310),
  );
}
export async function scanWithClamd(
  bytes: Buffer,
  host: string,
  port: number,
  timeout = 20000,
) {
  await new Promise<void>((resolve, reject) => {
    const socket = connect(port, host);
    let response = "",
      finished = false;
    const done = (error?: AppError) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      error ? reject(error) : resolve();
    };
    socket.setTimeout(timeout, () =>
      done(new AppError(503, "Document scanning timed out.")),
    );
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let i = 0; i < bytes.length; i += 65536) {
        const chunk = bytes.subarray(i, i + 65536),
          length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (data) => {
      response += data.toString();
      if (response.length > 4096)
        return done(new AppError(503, "Invalid scanner response."));
      if (response.includes("\0")) {
        const verdict = response.slice(0, response.indexOf("\0"));
        done(
          verdict === "stream: OK"
            ? undefined
            : new AppError(
                / FOUND$/.test(verdict) ? 422 : 503,
                "The file could not be cleared by the scanner.",
              ),
        );
      }
    });
    socket.on("error", () =>
      done(new AppError(503, "Document scanning is temporarily unavailable.")),
    );
    socket.on("close", () => {
      if (!finished) done(new AppError(503, "Incomplete scanner response."));
    });
  });
}
