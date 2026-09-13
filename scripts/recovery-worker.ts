import { Store } from "../server/db.ts";
import { FixtureProviders, fixtureConfig } from "../server/fixtures.ts";
import { FixtureEngine } from "../server/engine.ts";
import { RealityService } from "../server/service.ts";
const [path, phase] = process.argv.slice(2);
if (!path || !["first", "resume"].includes(phase))
  throw new Error("A fixture path and phase are required.");
const store = new Store(path),
  providers = new FixtureProviders(store),
  service = new RealityService(
    store,
    providers,
    new FixtureEngine(),
    fixtureConfig,
  );
if (phase === "first") {
  await service.scan();
  const plan = service.overview().plans.find((p) => p.entityId === "launch")!;
  service.approve(plan.id, "operator");
  store.put("meta", "recoveryPlan", { id: plan.id });
  providers.timeoutAfterWrite = true;
  try {
    await service.execute(plan.id);
  } catch {
    console.log(
      "FIXTURE: Calendar committed; response timed out. Process exits with journal retained.",
    );
  }
  process.exit(0);
}
const plan = service.plan(store.get("meta", "recoveryPlan").id);
await service.execute(plan.id);
console.log(
  JSON.stringify(
    {
      mode: "fixture",
      status: store.get("run", plan.id).state,
      calendarWriteAttempts: store.effect(plan.actions[0].id)?.attempts,
      recovered: store.effect(plan.actions[0].id)?.reference.recovered,
      writesInNewProcess: providers.writeCount,
      liveAcceptance: "pending dedicated accounts",
    },
    null,
    2,
  ),
);
store.close();
