import { spawn } from "node:child_process";
const input = process.argv.slice(2),
  args = ["dev"];
let host = "0.0.0.0",
  port = "3000";
for (let i = 0; i < input.length; i++) {
  if (input[i] === "--host" || input[i] === "--hostname") host = input[++i];
  else if (input[i] === "--port" || input[i] === "-p") port = input[++i];
  else if (input[i] !== "--strictPort") args.push(input[i]);
}
args.push("--hostname", host, "--port", port);
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
if (host === "127.0.0.1") env.APP_ORIGIN = `http://127.0.0.1:${port}`;
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", ...args],
  { stdio: "inherit", env },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
