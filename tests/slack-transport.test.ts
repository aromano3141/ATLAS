import test from "node:test";
import assert from "node:assert/strict";
import { LiveProviders } from "../server/providers.ts";
import { Config, ReminderInput } from "../server/contracts.ts";
import { fixtureConfig, FixtureProviders } from "../server/fixtures.ts";
import { Store } from "../server/db.ts";
import { RealityService } from "../server/service.ts";
import { FixtureEngine } from "../server/engine.ts";
import { runtime, createApi } from "../server/api.ts";
import { configured } from "../server/config.ts";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Slack reads use query parameters, retain timestamp precision, and encode pagination cursors", async () => {
  const seen: { url: URL; init: RequestInit; read: boolean }[] = [];
  const token = process.env.SLACK_BOT_TOKEN;
  process.env.SLACK_BOT_TOKEN = "fixture-token";
  class Probe extends LiveProviders {
    async request(
      _provider: string,
      url: string,
      init: RequestInit = {},
      read = true,
    ) {
      seen.push({ url: new URL(url), init, read });
      return {
        ok: true,
        messages: [],
        response_metadata: seen.length === 2 ? { next_cursor: "page+/=" } : {},
      };
    }
  }
  try {
    const p = new Probe(fixtureConfig);
    await p.slack(
      "conversations.info",
      { channel: "C_TEST", include_locale: false, unused: undefined },
      true,
    );
    await p.pagedSlack(
      "conversations.replies",
      { channel: "C_TEST", ts: "1700000000.000012" },
      "messages",
    );
    assert.equal(seen.length, 3);
    for (const r of seen) {
      assert.equal(r.init.method, "GET");
      assert.equal(r.init.body, undefined);
      assert.equal(r.url.searchParams.get("channel"), "C_TEST");
      assert.equal(r.read, true);
    }
    assert.equal(seen[0].url.searchParams.get("include_locale"), "false");
    assert.equal(seen[0].url.searchParams.has("unused"), false);
    assert.equal(seen[1].url.searchParams.get("ts"), "1700000000.000012");
    assert.equal(seen[2].url.searchParams.get("cursor"), "page+/=");
  } finally {
    if (token === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = token;
  }
});

test("Slack writes keep nested JSON while errors name the failing API method", async () => {
  const token = process.env.SLACK_BOT_TOKEN;
  process.env.SLACK_BOT_TOKEN = "fixture-token";
  let observed: RequestInit | undefined;
  class Probe extends LiveProviders {
    async request(_p: string, _u: string, init: RequestInit = {}) {
      observed = init;
      return { ok: false, error: "invalid_arguments" };
    }
  }
  try {
    const p = new Probe(fixtureConfig),
      body = {
        channel: "C_TEST",
        text: "Fixture only",
        blocks: [{ type: "divider" }],
      };
    await assert.rejects(
      p.slack("chat.postMessage", body),
      /slack: invalid_arguments \(chat.postMessage\)/,
    );
    assert.equal(observed?.method, "POST");
    assert.deepEqual(JSON.parse(observed?.body as string), body);
  } finally {
    if (token === undefined) delete process.env.SLACK_BOT_TOKEN;
    else process.env.SLACK_BOT_TOKEN = token;
  }
});

test("removed navigation configuration and reminder types cannot be activated", () => {
  const c = Config.parse({
    places: {},
    savedOrigin: {},
    policyUrl: "https://example.com",
    maxMapsRequestsPerDay: 1,
    preferences: { arrivalBuffer: 10, autoDeparture: true },
  });
  for (const key of [
    "places",
    "savedOrigin",
    "policyUrl",
    "maxMapsRequestsPerDay",
  ])
    assert.equal(key in c, false);
  assert.equal("autoDeparture" in c.preferences, false);
  assert.equal("maps" in configured(), false);
  assert.equal(
    ReminderInput.safeParse({
      eventId: "meeting",
      purpose: "departure",
      rule: "departure",
      channel: "slack",
    }).success,
    false,
  );
});

test("removed routing endpoints return 404 and unsupported intents do not become reminders", async () => {
  const store = new Store(":memory:"),
    providers = new FixtureProviders(store);
  const r = runtime(
    new RealityService(store, providers, new FixtureEngine(), fixtureConfig),
  );
  const app = createApi(r, r),
    session = await app.request("http://localhost:5173/api/session");
  const cookie = session.headers.get("set-cookie")!.split(";")[0],
    { csrf } = (await session.json()) as any;
  for (const endpoint of [
    "/api/trips",
    "/api/places/resolve",
    "/api/trips/test/accept",
    "/api/trips/test/refresh",
  ]) {
    const result = await app.request("http://localhost:5173" + endpoint, {
      method: "POST",
      headers: {
        host: "localhost:5173",
        cookie,
        origin: "http://localhost:5173",
        "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(result.status, 404);
  }
  const preview = await r.intents.preview("Find a driving route with gas");
  assert.equal(preview.intent.kind, "unknown");
  assert.deepEqual(preview.events, []);
  assert.equal(providers.writeCount, 0);
  store.close();
});

test("legacy navigation jobs retire locally without losing provider references or ordinary reminders", () => {
  const file = join(
    mkdtempSync(join(tmpdir(), "reality-retire-")),
    "test.sqlite",
  );
  let store = new Store(file);
  store.put("reminder", "old-departure", {
    id: "old-departure",
    purpose: "departure",
    rule: "departure",
    providerId: "existing-provider-schedule",
  });
  store.put("reminder", "ordinary", {
    id: "ordinary",
    purpose: "meeting",
    rule: "relative",
  });
  store.put("trip", "old-trip", { id: "old-trip" });
  store.enqueue("reminder", "legacy", { id: "old-departure" });
  store.enqueue("reminder", "normal", { id: "ordinary" });
  store.enqueue("travel-refresh", "legacy", { tripId: "old-trip" });
  store.db.prepare("DELETE FROM schema_migrations WHERE version=2").run();
  store.close();
  store = new Store(file);
  assert.equal(store.get("reminder", "old-departure"), undefined);
  assert.equal(
    store.get("retiredReminder", "old-departure").providerId,
    "existing-provider-schedule",
  );
  assert.ok(store.get("reminder", "ordinary"));
  assert.deepEqual(store.all("trip"), []);
  assert.equal(store.jobs().filter((j) => j.state === "canceled").length, 2);
  assert.equal(store.jobs().filter((j) => j.state === "queued").length, 1);
  assert.match(
    store.get("inbox", "retired:old-departure").message,
    /managed directly/,
  );
  store.close();
});
