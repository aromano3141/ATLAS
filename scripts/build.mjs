import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const result = spawnSync(
  process.execPath,
  ["scripts/run-framework.mjs", "build"],
  { cwd: fileURLToPath(new URL("../web/", import.meta.url)), stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
