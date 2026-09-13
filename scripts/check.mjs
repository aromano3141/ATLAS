import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const args of [
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  [
    "web/node_modules/typescript/bin/tsc",
    "--noEmit",
    "-p",
    "web/tsconfig.json",
  ],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status) process.exit(result.status);
}
