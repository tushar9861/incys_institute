import { connect } from "node:net";
export const MAX_UPLOAD = 10 * 1024 * 1024;
export function clamCommand(
  command,
  bytes,
  { host = "127.0.0.1", port = 3310, timeout = 20000 } = {},
) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, host);
    let answer = "",
      finished = false;
    const done = (error, value) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      error ? reject(error) : resolve(value);
    };
    socket.setTimeout(timeout, () => done(new Error("Scanner timeout")));
    socket.on("connect", () => {
      socket.write(`z${command}\0`);
      if (bytes) {
        for (let i = 0; i < bytes.length; i += 65536) {
          const chunk = bytes.subarray(i, i + 65536),
            length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      }
    });
    socket.on("data", (data) => {
      answer += data.toString("utf8");
      if (answer.length > 4096)
        return done(new Error("Invalid scanner response"));
      if (answer.includes("\0"))
        done(null, answer.slice(0, answer.indexOf("\0")));
    });
    socket.on("error", () => done(new Error("Scanner unavailable")));
    socket.on("close", () => {
      if (!finished) done(new Error("Incomplete scanner response"));
    });
  });
}
export function freshSignatures(version, now = Date.now()) {
  const dateText = version.split("/").at(-1);
  // ClamAV VERSION emits the signature build date in the container timezone (UTC).
  const built = Date.parse(`${dateText} UTC`);
  return (
    Number.isFinite(built) &&
    built <= now + 3600000 &&
    now - built <= 72 * 3600000
  );
}
