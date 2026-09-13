import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = [
  spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: root,
    stdio: "inherit",
  }),
  spawn(
    process.execPath,
    [
      "scripts/run-framework.mjs",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
    ],
    { cwd: path.join(root, "web"), stdio: "inherit" },
  ),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const c of children)
  c.on("exit", (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
