import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/db.ts";
import { FixtureProviders, fixtureConfig } from "../server/fixtures.ts";
import { RealityService } from "../server/service.ts";
import { ProviderError } from "../server/providers.ts";

function setup() {
  const store = new Store(":memory:");
  const providers = new FixtureProviders(store);
  const config = fixtureConfig();
  config.entities = [{ ...config.entities[0], id: "atlas-launch" }];
  // This operator path must work even when Slack/model investigation is unavailable.
  providers.snapshot = async () => {
    throw new Error("No Slack/model scan allowed");
  };
  const engine = {
    extract: async (): Promise<never> => {
      throw new Error("No agent call allowed");
    },
    assess: async (): Promise<never> => {
      throw new Error("No agent call allowed");
    },
  };
  return {
    store,
    providers,
    service: new RealityService(store, providers, engine, () => config),
  };
}

test("operator launch preview has exact October 2 changes and only writes after its button approval", async () => {
  const { store, providers, service } = setup();
  try {
    const result = await service.prepareOperatorLaunch();
    const plan = service.plan(result.planId);
    assert.equal(plan.operatorDate, "2026-10-02");
    assert.deepEqual(plan.assessments, []);
    assert.deepEqual(plan.claims, []);
    assert.deepEqual(
      plan.actions.map((a) => a.patch),
      [
        { start: { date: "2026-10-02" }, end: { date: "2026-10-03" } },
        { releaseDate: "2026-10-02" },
      ],
    );
    assert.equal(providers.writeCount, 0);
    assert.equal(store.jobs().length, 0);
    await assert.rejects(service.execute(plan.id), /approval/);
    service.approve(plan.id, "operator");
    await service.execute(plan.id);
    assert.equal(store.get("run", plan.id).state, "verified");
    assert.equal(providers.writeCount, 2);
    const calendar = await providers.calendarGet(
      "demo-calendar",
      "launch-event",
    );
    assert.equal(calendar.summary, "Atlas launch");
    assert.equal(calendar.description, "Preserve this launch note.");
    assert.equal((await providers.jiraGet("demo-version")).name, "Atlas 1.0");
    await service.scanEntity(service.entity("atlas-launch"), true);
    assert.equal(store.get("current", "atlas-launch").planId, plan.id);
    assert.equal(store.get("run", plan.id).state, "verified");
  } finally {
    store.close();
  }
});

test("operator launch keeps Calendar success on Jira failure and recovers without rewriting it", async () => {
  const { store, providers, service } = setup();
  try {
    const result = await service.prepareOperatorLaunch();
    const patch = providers.jiraPatch.bind(providers);
    providers.jiraPatch = async () => {
      throw new ProviderError("jira", 403, "denied");
    };
    service.approve(result.planId, "operator");
    await assert.rejects(service.execute(result.planId));
    assert.equal(store.get("run", result.planId).state, "partial");
    assert.equal(providers.writeCount, 1);
    providers.jiraPatch = patch;
    await service.execute(result.planId);
    assert.equal(store.get("run", result.planId).state, "verified");
    assert.equal(providers.writeCount, 2);
  } finally {
    store.close();
  }
});

test("operator launch refuses a concurrent Calendar edit instead of overwriting unrelated fields", async () => {
  const { store, providers, service } = setup();
  try {
    const { planId } = await service.prepareOperatorLaunch();
    service.approve(planId, "operator");
    store.put("remote", "launch-event", {
      ...store.get<Record<string, unknown>>("remote", "launch-event"),
      etag: "edited",
      description: "New human edit",
    });
    await assert.rejects(service.execute(planId), /ETag/);
    assert.equal(providers.writeCount, 0);
  } finally {
    store.close();
  }
});
