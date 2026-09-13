import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
const file = join(
  mkdtempSync(join(tmpdir(), "reality-recovery-")),
  "fixture.sqlite",
);
for (const phase of ["first", "resume"]) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/recovery-worker.ts", file, phase],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status) process.exit(result.status);
}
