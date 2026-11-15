import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mode = process.argv[2] === "dev" ? "dev" : "start";
const host = "127.0.0.1";
const port = process.env.PORT || "3000";
const env = {
  ...process.env,
  SLEUTHSUITE_ORIGIN: `http://${host}:${port}`,
  NEXT_TELEMETRY_DISABLED: "1",
};
const processes = [
  spawn(process.execPath, [require.resolve("next/dist/bin/next"), mode, "--hostname", host, "--port", port], { stdio: "inherit", env }),
  spawn(process.execPath, ["--experimental-strip-types", "src/crawler/worker.ts"], { stdio: "inherit", env }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
  process.exitCode = code;
}
for (const child of processes) {
  child.on("exit", (code) => stop(code ?? 1));
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
