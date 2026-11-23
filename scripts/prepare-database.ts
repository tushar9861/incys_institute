import { execFileSync } from "node:child_process";
for (const script of ["migrate", "provision-runtime-db"])
  execFileSync(process.execPath, ["--import", "tsx", `scripts/${script}.ts`], {
    stdio: "inherit",
  });
