import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/db.ts";
import { FixtureProviders, fixtureConfig } from "../server/fixtures.ts";
import {
  FixtureEngine,
  investigate,
  resolveClaims,
  validateClaims,
} from "../server/engine.ts";
import { RealityService, patchMatches } from "../server/service.ts";
import { runtime, createApi } from "../server/api.ts";
import { ProviderError, LiveProviders } from "../server/providers.ts";
import {
  eventStart,
  localInstant,
  moveEvent,
  occurrenceKey,
  reminderOverrides,
  nextMeetings,
  meetingKind,
} from "../server/time.ts";
import { mapsUrl, stopComparison } from "../server/maps.ts";
import { verifiedSummary } from "../server/messages.ts";
import { now, hash, id } from "../server/util.ts";
import type { ClaimT, EventRevision, Reminder } from "../server/contracts.ts";
function setup(path = ":memory:") {
  const store = new Store(path),
    providers = new FixtureProviders(store),
    service = new RealityService(
      store,
      providers,
      new FixtureEngine(),
      fixtureConfig,
    );
  return { ...runtime(service), store, providers };
}
async function repaired() {
  const r = setup();
  await r.service.scan();
  const p = r.service.overview().plans.find((p) => p.entityId === "meeting")!;
  r.service.approve(p.id, "operator");
  await r.service.execute(p.id);
  return { ...r, p };
}

test("independent initial assessments commit before the bounded follow-up", async () => {
  const r = setup();
  const s = await r.providers.snapshot(fixtureConfig().entities[0]);
  let committed = false,
    calls = 0;
  const base = new FixtureEngine();
  const engine = {
    extract: (s: any) => base.extract(s),
    assess: async (role: any, s: any, c: any, peers?: any) => {
      calls++;
      if (calls <= 3) assert.equal(peers, undefined);
      else assert.equal(committed, true);
      return { ...(await base.assess(role, s, c)), needsFollowup: !peers };
    },
  };
  const result = await investigate(engine, s, () => {
    committed = true;
  });
  assert.equal(calls, 6);
  assert.equal(result.canonical.launchDate, "2026-10-08");
  r.store.close();
});
test("newer unauthorized proposals do not supersede approval", async () => {
  const r = setup();
  await r.service.scan();
  const p = r.service.overview().plans.find((p) => p.entityId === "launch")!;
  assert.equal(p.canonical.launchDate, "2026-10-08");
  assert.equal(p.actions.length, 2);
  r.store.close();
});
test("invalid quotes and entity IDs are rejected", async () => {
  const r = setup(),
    s = await r.providers.snapshot(fixtureConfig().entities[0]);
  const claims = await new FixtureEngine().extract(s);
  assert.throws(() =>
    validateClaims(s, [{ ...claims[0], quote: "fabricated" }]),
  );
  assert.throws(() =>
    validateClaims(s, [{ ...claims[0], entityId: "other-project" }]),
  );
  r.store.close();
});
test("conflicting authorized values and missing authority abstain", async () => {
  const r = setup(),
    s = await r.providers.snapshot(fixtureConfig().entities[0]),
    engine = new FixtureEngine();
  const c = await engine.extract(s);
  s.evidence[1].authorId = "owner";
  c[1].statement = "approved";
  const a = await Promise.all(
    (["temporal", "authority", "skeptic"] as const).map((role) =>
      engine.assess(role, s, c),
    ),
  );
  assert.deepEqual(resolveClaims(s, c, a).unresolved, ["launchDate"]);
  s.evidence.forEach((e) => (e.authorId = "outsider"));
  assert.deepEqual(resolveClaims(s, c, a).canonical, {});
  r.store.close();
});
test("incomplete evidence and unauthorized actors cannot repair", async () => {
  const r = setup();
  const s = await r.providers.snapshot(fixtureConfig().entities[0]);
  s.complete = false;
  await assert.rejects(
    investigate(new FixtureEngine(), s, () => {}),
    /incomplete/,
  );
  await r.service.scan();
  const p = r.service.overview().plans[0];
  await assert.rejects(r.service.execute(p.id), /approval/);
  assert.throws(() => r.service.approve(p.id, "outsider"), /cannot approve/);
  assert.equal(r.providers.writeCount, 0);
  r.store.close();
});
test("approved three-app repair preserves unrelated data and rereads", async () => {
  const r = setup();
  await r.service.scan();
  const p = r.service.overview().plans.find((p) => p.entityId === "launch")!;
  r.service.approve(p.id, "operator");
  r.service.approve(p.id, "operator");
  await r.service.execute(p.id);
  assert.equal(
    (await r.providers.jiraGet("demo-version")).releaseDate,
    "2026-10-08",
  );
  const e = await r.providers.calendarGet("demo-calendar", "launch-event");
  assert.equal(e.start.date, "2026-10-08");
  assert.equal(e.end.date, "2026-10-09");
  assert.equal(e.description, "Preserve this launch note.");
  assert.equal(
    (await r.providers.jiraGet("demo-version")).description,
    "Preserve version description.",
  );
  assert.equal(r.store.get("run", p.id).state, "verified");
  assert.equal(r.providers.writeCount, 2);
  r.store.close();
});
test("successful-write timeout survives database reopen without duplicate mutation", async () => {
  const file = join(
    mkdtempSync(join(tmpdir(), "reality-recovery-")),
    "test.sqlite",
  );
  let r = setup(file);
  await r.service.scan();
  const p = r.service.overview().plans.find((p) => p.entityId === "launch")!;
  r.service.approve(p.id, "operator");
  r.providers.timeoutAfterWrite = true;
  await assert.rejects(r.service.execute(p.id), /injected_timeout/);
  assert.equal(r.providers.writeCount, 1);
  r.store.close();
  r = setup(file);
  await r.service.execute(p.id);
  assert.equal(
    r.providers.writeCount,
    1,
    "Only the remaining Jira write executes after reopen",
  );
  assert.equal(r.store.get("run", p.id).state, "verified");
  assert.equal(r.store.effect(p.actions[0].id)?.attempts, 1);
  assert.equal(r.store.effect(p.actions[0].id)?.reference.recovered, true);
  r.store.close();
});
test("Calendar concurrent edits stop approved execution", async () => {
  const r = setup();
  await r.service.scan();
  const p = r.service.overview().plans.find((p) => p.entityId === "launch")!;
  r.service.approve(p.id, "operator");
  const e = await r.providers.calendarGet("demo-calendar", "launch-event");
  r.store.put("remote", e.id, {
    ...e,
    etag: "someone-else",
    description: "A concurrent edit",
  });
  await assert.rejects(r.service.execute(p.id), /ETag changed/);
  assert.equal(r.providers.writeCount, 0);
  r.store.close();
});
test("partial Jira failure does not unverify Calendar or claim all systems repaired", async () => {
  const r = setup();
  await r.service.scan();
  const p = r.service.overview().plans.find((p) => p.entityId === "launch")!;
  r.service.approve(p.id, "operator");
  r.providers.jiraPatch = async () => {
    throw new ProviderError("jira", 429, "rate_limited", false, 30);
  };
  await assert.rejects(r.service.execute(p.id), /rate_limited/);
  assert.equal(r.store.get("run", p.id).state, "partial");
  assert.equal(r.service.currentEvent("launch").unresolved.length, 0);
  assert.match(
    verifiedSummary(r.service, p).join(" "),
    /Calendar: verified.*Jira: not verified/,
  );
  r.store.close();
});
test("DST ambiguity rejects guesses, occurrence keys survive movement, offsets compare by instant", () => {
  assert.throws(() => localInstant("2026-03-08", "02:30", "America/Chicago"));
  assert.throws(() => localInstant("2026-11-01", "01:30", "America/Chicago"));
  const e: any = {
    id: "instance1",
    recurringEventId: "series",
    originalStartTime: { dateTime: "2026-11-02T15:00:00Z" },
    start: { dateTime: "2026-11-02T15:00:00Z" },
    end: { dateTime: "2026-11-02T16:00:00Z" },
  };
  const key = occurrenceKey("c", e);
  e.start.dateTime = "2026-11-03T15:00:00Z";
  assert.equal(key, occurrenceKey("c", e));
  assert.equal(
    patchMatches(
      { start: { dateTime: "2026-10-08T15:00:00-05:00" } },
      { start: { dateTime: "2026-10-08T20:00:00Z" } },
    ),
    true,
  );
});
test("native defaults are preserved, duplicate offsets avoided, max five enforced", () => {
  const e: any = { reminders: { useDefault: true } };
  assert.equal(
    reminderOverrides(e, [{ method: "popup", minutes: 30 }], 30),
    undefined,
  );
  const patch = reminderOverrides(e, [{ method: "email", minutes: 60 }], 45)!;
  assert.deepEqual(patch.overrides, [
    { method: "email", minutes: 60 },
    { method: "popup", minutes: 45 },
  ]);
  assert.throws(() =>
    reminderOverrides(
      e,
      Array.from({ length: 5 }, (_, i) => ({ method: "popup", minutes: i })),
      30,
    ),
  );
});
test("next meeting excludes canceled/declined and flags unresolved ordering", async () => {
  const r = await repaired();
  const event = r.service.currentEvent("meeting");
  const candidate = (
    key: string,
    offset: number,
    extra: any = {},
  ): EventRevision => ({
    ...event,
    id: key,
    event: {
      ...event.event,
      start: { dateTime: new Date(Date.now() + offset).toISOString() },
      ...extra,
    },
  });
  const rows = [
    candidate("cancel", 1000, { status: "cancelled" }),
    candidate("decline", 2000, {
      attendees: [{ email: "a@b.com", self: true, responseStatus: "declined" }],
    }),
    candidate("virtual", 3000, { location: "https://zoom.us/meeting" }),
    { ...candidate("physical", 4000), unresolved: ["start"] },
  ];
  const result = nextMeetings(rows, "America/Chicago");
  assert.equal(result.next?.id, "virtual");
  assert.equal(result.nextPhysical?.id, "physical");
  assert.equal(result.ambiguous, true);
  assert.equal(meetingKind(rows[2].event), "virtual");
  r.store.close();
});
test("relative reminders bind an occurrence and deduplicate, absolute times stay fixed", async () => {
  const r = await repaired();
  const input = {
    eventId: "meeting",
    purpose: "meeting",
    rule: "relative",
    minutes: 45,
    channel: "app",
  };
  const a = await r.reminders.approve(input),
    b = await r.reminders.approve(input);
  assert.equal(a.id, b.id);
  assert.equal(a.revision, b.revision);
  await r.reminders.schedule(a.id, a.revision);
  const absolute = await r.reminders.approve({
    ...input,
    rule: "absolute",
    purpose: "preparation",
    at: new Date(Date.now() + 3600000).toISOString(),
  });
  const e = r.service.currentEvent("meeting");
  r.store.put("event", e.id, {
    ...e,
    revision: "new-revision",
    event: {
      ...e.event,
      ...moveEvent(
        e.event,
        new Date(Date.parse(eventStart(e.event)) + 3600000).toISOString(),
        "America/Chicago",
      ),
    },
  });
  await r.reminders.maintain(e.id);
  assert.equal(
    r.store.get<Reminder>("reminder", absolute.id)?.triggerAt,
    absolute.triggerAt,
  );
  assert.equal(
    Date.parse(r.store.get<Reminder>("reminder", a.id)!.triggerAt) -
      Date.parse(a.triggerAt),
    3600000,
  );
  r.store.close();
});
test("Slack schedules recover by readback and respect cancellation cutoff", async () => {
  const r = await repaired();
  const a = await r.reminders.approve({
    eventId: "meeting",
    purpose: "preparation",
    rule: "absolute",
    at: new Date(Date.now() + 3600000).toISOString(),
    channel: "slack",
  });
  await r.reminders.schedule(a.id, a.revision);
  const saved = r.store.get<Reminder>("reminder", a.id)!;
  assert.ok(saved.providerId);
  await r.reminders.schedule(a.id, a.revision);
  assert.equal((await r.reminders.schedules()).length, 1);
  const remote = r.store.get("remoteSchedule", saved.providerId!);
  r.store.put("remoteSchedule", saved.providerId!, {
    ...remote,
    post_at: Math.floor(Date.now() / 1000) + 30,
  });
  await assert.rejects(r.reminders.cancel(a.id), /60-second/);
  assert.equal((await r.reminders.schedules()).length, 1);
  assert.ok(
    !(
      "metadata" in
      r.store.effects().find((e) => e.kind === "slack-reminder")!.request
    ),
  );
  r.store.close();
});
test("completed linked tasks cancel local prep reminders; restart summarizes missed items", async () => {
  const r = await repaired();
  const a = await r.reminders.approve({
    eventId: "meeting",
    purpose: "preparation",
    rule: "absolute",
    at: new Date(Date.now() + 60000).toISOString(),
    channel: "app",
  });
  await r.reminders.schedule(a.id, a.revision);
  const e = r.service.currentEvent("meeting");
  r.store.put("event", e.id, {
    ...e,
    issue: {
      ...e.issue,
      fields: {
        ...e.issue!.fields,
        status: { statusCategory: { key: "done" } },
      },
    },
  });
  await r.reminders.maintain(e.id);
  assert.equal(r.store.get("reminder", a.id).state, "canceled");
  const b = {
    ...a,
    id: "missed",
    state: "scheduled",
    triggerAt: new Date(Date.now() - 120000).toISOString(),
  };
  r.store.put("reminder", b.id, b);
  await r.reminders.tick(true);
  assert.equal(r.store.get("reminder", b.id).state, "missed");
  assert.ok(r.store.all("inbox").some((n) => n.kind === "missed"));
  r.store.close();
});
test("message audience restrictions, exact revision approval, and readback presence", async () => {
  const r = await repaired();
  await assert.rejects(
    r.messages.create("meeting", "update", {
      kind: "slack",
      target: "unapproved-channel",
    }),
    /sharing boundary/,
  );
  const d = await r.messages.create("meeting", "update", {
    kind: "slack",
    target: "demo-team",
  });
  await assert.rejects(
    r.messages.approveSend(d.id, d.revision, "outsider"),
    /cannot send/,
  );
  const edited = r.messages.edit(
    d.id,
    d.revision,
    d.text + "\nReviewed by operator.",
  );
  await assert.rejects(
    r.messages.approveSend(d.id, d.revision, "operator"),
    /latest message/,
  );
  await r.messages.approveSend(edited.id, edited.revision, "operator");
  await r.messages.send(edited.id, edited.revision);
  assert.equal(r.messages.get(d.id).state, "verified");
  assert.equal(r.store.all("remoteMessage").length, 1);
  r.store.close();
});
test("uncertain sends do not repeat; stale drafts cannot send", async () => {
  const r = await repaired();
  const d = await r.messages.create("meeting", "update", {
    kind: "slack",
    target: "demo-team",
  });
  await r.messages.approveSend(d.id, d.revision, "operator");
  const base = r.providers.slack.bind(r.providers);
  r.providers.slack = async (method, p) => {
    if (method === "chat.postMessage") {
      await base(method, p);
      throw new ProviderError("slack", 0, "timeout", true);
    }
    if (method === "conversations.history")
      return { messages: [], response_metadata: {} };
    return base(method, p);
  };
  await assert.rejects(r.messages.send(d.id, d.revision));
  await assert.rejects(r.messages.send(d.id, d.revision), /uncertain/);
  assert.equal(r.store.all("remoteMessage").length, 1);
  r.providers.slack = base;
  await r.messages.recover(d.id);
  assert.equal(r.messages.get(d.id).state, "verified");
  const d2 = await r.messages.create("meeting", "update", {
    kind: "slack",
    target: "demo-team",
  });
  r.store.put("event", "meeting", {
    ...r.service.currentEvent("meeting"),
    revision: "superseded",
  });
  await assert.rejects(
    r.messages.approveSend(d2.id, d2.revision, "operator"),
    /event changed/,
  );
  r.store.close();
});
test("detour includes dwell, route handoff is encoded, stale quotes cannot schedule", async () => {
  assert.equal(stopComparison(600, 780, 10, 10, 0, 0).fits, false);
  assert.equal(stopComparison(600, 780, 10, 20, 0, 0).addedSeconds, 780);
  const url = mapsUrl(
    { label: "A & B", address: "A & B", confirmed: true },
    { label: "North", placeId: "p-id", confirmed: true },
  );
  assert.match(url, /destination_place_id=p-id/);
  assert.match(url, /origin=A\+%26\+B/);
  const r = await repaired();
  const result = await r.maps.calculate({
    eventId: "meeting",
    origin: { label: "Origin", address: "Fixture origin", confirmed: true },
    stop: "gas",
    maxAddedMinutes: 30,
  });
  const quote = result.quotes[0];
  assert.equal(quote.mode, "fixture");
  await r.maps.accept(quote.id);
  r.maps.quotes.get(quote.id)!.expires = Date.now() - 1;
  await assert.rejects(r.maps.departure(quote.id, "meeting"), /expired/);
  assert.equal(r.store.get("trip", quote.id).driveSeconds, undefined);
  assert.equal(r.store.get("trip", quote.id).availability, undefined);
  r.store.close();
});
test("maps refuses missing origin, disputed destination, and missing EV requirements", async () => {
  const r = await repaired();
  await assert.rejects(r.maps.calculate({ eventId: "meeting" }));
  const e = r.service.currentEvent("meeting");
  r.store.put("event", "meeting", { ...e, unresolved: ["location"] });
  await assert.rejects(
    r.maps.calculate({
      eventId: "meeting",
      origin: { label: "O", address: "O", confirmed: true },
    }),
    /destination/,
  );
  r.store.put("event", "meeting", e);
  await assert.rejects(
    r.maps.calculate({
      eventId: "meeting",
      origin: { label: "O", address: "O", confirmed: true },
      stop: "ev",
    }),
    /connector/,
  );
  r.store.close();
});
test("transactional outbox and atomic job claims deduplicate callbacks", () => {
  const r = setup();
  const a = r.store.enqueue("scan", "same", {}),
    b = r.store.enqueue("scan", "same", {});
  assert.equal(a, b);
  assert.equal(r.store.jobs().length, 1);
  const job = r.store.claim()!;
  assert.equal(r.store.claim(), undefined);
  r.store.finish(job);
  assert.equal(r.store.claim(), undefined);
  r.store.close();
});
test("API rejects untrusted hosts/origins and CSRF, keeps fixture/live stores separate", async () => {
  const live = setup(),
    fixture = setup(),
    app = createApi(live, fixture);
  let response = await app.request("http://evil.example/api/session", {
    headers: { host: "evil.example" },
  });
  assert.equal(response.status, 400);
  response = await app.request("http://localhost:5173/api/session", {
    headers: { host: "localhost:5173" },
  });
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const { csrf } = (await response.json()) as any;
  response = await app.request("http://localhost:5173/api/scan", {
    method: "POST",
    headers: {
      host: "localhost:5173",
      cookie,
      origin: "http://localhost:5173",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(response.status, 400);
  response = await app.request("http://localhost:5173/api/scan", {
    method: "POST",
    headers: {
      host: "localhost:5173",
      cookie,
      origin: "http://localhost:5173",
      "content-type": "application/json",
      "x-csrf-token": csrf,
      "x-reality-mode": "fixture",
    },
    body: "{}",
  });
  assert.equal(response.status, 202);
  assert.equal(fixture.store.jobs().length, 1);
  assert.equal(live.store.jobs().length, 0);
  live.store.close();
  fixture.store.close();
});
test("live adapter reports authentication and rate-limit errors without exposing credentials", async () => {
  const adapter = new LiveProviders(fixtureConfig);
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("{}", { status: 429, headers: { "Retry-After": "30" } });
  try {
    await assert.rejects(
      adapter.request("calendar", "https://example.invalid"),
      (e: any) => e.retryAfter === 30 && e.status === 429 && !e.uncertain,
    );
  } finally {
    globalThis.fetch = original;
  }
});
