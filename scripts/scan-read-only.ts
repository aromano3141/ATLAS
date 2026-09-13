import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";
import { Config } from "../server/contracts.ts";
import { LiveProviders } from "../server/providers.ts";
import { Store } from "../server/db.ts";
import { OpenAIEngine } from "../server/engine.ts";
import { RealityService } from "../server/service.ts";
import { assert, equal, now } from "../server/util.ts";

const session = await fetch("http://localhost:5173/api/session");
assert(session.ok, "Start the local app before a read-only scan.");
const cookie = session.headers.get("set-cookie")!.split(";")[0];
const response = await fetch("http://localhost:5173/api/state", {
  headers: { cookie, "x-reality-mode": "live" },
});
assert(response.ok, "Could not read the running app's configuration.");
const state: any = await response.json();
const config = Config.parse(state.config);
const index = process.argv.indexOf("--entity");
const entityId = index < 0 ? undefined : process.argv[index + 1];
const entity =
  config.entities.find((e) => e.id === entityId) ||
  (!entityId && config.entities.length === 1 ? config.entities[0] : undefined);
assert(entity, "Select one configured entity with --entity ID.");
// An explicit path can address the original data folder through Windows app
// virtualization. Never silently use credentials from another installation.
const dataDir = process.env.REALITY_SYNC_DATA_DIR || state.dataDir;
const saved = Config.parse(
  JSON.parse(readFileSync(join(dataDir, "config.json"), "utf8")),
);
assert(
  equal(saved, config),
  "This shell sees a different saved configuration. Set REALITY_SYNC_DATA_DIR to the running app's actual folder.",
);
dotenv.config({ path: join(dataDir, "secrets.env"), quiet: true });
const store = new Store(":memory:");
const calls: { provider: string; method: string; endpoint: string }[] = [];
class ReadOnlyProviders extends LiveProviders {
  async request(
    provider: string,
    url: string,
    init: RequestInit = {},
    read = true,
  ) {
    assert(read, "Read-only scan blocked a provider write.");
    calls.push({
      provider,
      method: init.method || "GET",
      endpoint: new URL(url).pathname,
    });
    return super.request(provider, url, init, true);
  }
}
const providers = new ReadOnlyProviders(() => config);
try {
  const before = await providers.snapshot(entity);
  const service = new RealityService(
    store,
    providers,
    new OpenAIEngine(() => config, store),
    () => config,
  );
  const result = await service.scanEntity(entity);
  const plan = service.plan(result.planId);
  const [calendar, jira] = await Promise.all([
    providers.calendarGet(entity.calendarId, entity.eventId),
    entity.jiraVersionId ? providers.jiraGet(entity.jiraVersionId) : undefined,
  ]);
  const report = {
    at: now(),
    mode: "live-read-only",
    entityId: entity.id,
    status: plan.status,
    evidenceCount: before.evidence.length,
    initialAssessments: plan.assessments.length,
    followupAssessments: plan.followup.length,
    proposedChanges: plan.actions.map((a) => ({
      provider: a.provider,
      patch: a.patch,
    })),
    unresolved: plan.unresolved,
    calendarUnchanged: equal(calendar, before.calendar),
    jiraUnchanged: equal(jira, before.jira),
    approvedActions: 0,
    providerWrites: 0,
    messagesSent: 0,
    calls,
  };
  writeFileSync(
    join(dataDir, "read-only-scan.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  store.close();
}
