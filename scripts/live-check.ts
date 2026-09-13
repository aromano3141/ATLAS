import { loadConfig, configured, dataDir } from "../server/config.ts";
import { LiveProviders } from "../server/providers.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { now } from "../server/util.ts";
const config = loadConfig(),
  ready = configured(),
  provider = new LiveProviders(() => config);
const report: {
  mode: string;
  at: string;
  configured: unknown;
  checks: any[];
  acceptance: string;
} = {
  mode: "live-read-only",
  at: now(),
  configured: ready,
  checks: [],
  acceptance:
    "PENDING: no live repair, recovery, route or send is performed by this read-only command.",
};
if (
  !ready.slack ||
  !ready.calendar ||
  !ready.jira ||
  !ready.openai ||
  !ready.maps ||
  !config.entities.length
) {
  report.checks.push({
    status: "not_configured",
    message: "Complete secrets.env and Connections resource bindings first.",
  });
} else {
  report.checks.push(...(await provider.health()));
  for (const entity of config.entities) {
    try {
      const snapshot = await provider.snapshot(entity);
      report.checks.push({
        entityId: entity.id,
        complete: snapshot.complete,
        evidenceCount: snapshot.evidence.length,
        calendarEventFound: !!snapshot.calendar.id,
        jiraVersionFound: !!snapshot.jira,
        issueFound: !!snapshot.issue,
      });
    } catch (error) {
      report.checks.push({
        entityId: entity.id,
        error: (error as Error).message,
      });
    }
  }
}
writeFileSync(
  join(dataDir, "live-check.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (
  report.checks.some(
    (c) => c.error || c.status === "not_configured" || c.connected === false,
  )
)
  process.exitCode = 2;
