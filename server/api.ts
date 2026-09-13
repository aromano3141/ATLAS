import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { missionData } from "./mission.ts";
import { getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { timingSafeEqual, randomBytes } from "node:crypto";
import type { RealityService } from "./service.ts";
import { Messages } from "./messages.ts";
import { Reminders } from "./reminders.ts";

import { Intents } from "./intents.ts";
import { OpenAIEngine } from "./engine.ts";
import { Worker } from "./worker.ts";
import { Config, Audience } from "./contracts.ts";
import { configured, dataDir, saveConfig } from "./config.ts";
import { assert, id, safeError, now } from "./util.ts";
import { eventStart, nextMeetings, meetingKind } from "./time.ts";

export function runtime(service: RealityService) {
  const messages = new Messages(service),
    reminders = new Reminders(service),
    intents = new Intents(
      service,
      service.engine instanceof OpenAIEngine ? service.engine : undefined,
    ),
    worker = new Worker(service);
  worker.handlers.set("message", (p) => messages.send(p.draftId, p.revision));
  worker.handlers.set("reminder", (p) => reminders.schedule(p.id, p.revision));
  worker.handlers.set("block", (p) => reminders.createBlock(p.blockId));
  service.onDependency = async (eventId) => {
    for (const d of service.store
      .all("draft")
      .filter(
        (d) =>
          d.entityId === eventId && ["review", "approved"].includes(d.state),
      )) {
      try {
        messages.current(d);
      } catch {
        service.store.put("draft", d.id, { ...d, state: "stale" });
      }
    }
    await reminders.maintain(eventId);
  };
  const updateDependencies = service.onDependency;
  service.onDependency = async (eventId) => {
    await updateDependencies(eventId);
    for (const block of service.store
      .all("block")
      .filter(
        (b) =>
          b.eventId === eventId &&
          b.eventRevision !== service.currentEvent(eventId).revision,
      )) {
      service.store.put("blockState", block.id, {
        id: block.id,
        state: "stale",
        eventId,
      });
      service.store.put("inbox", `block:${block.id}`, {
        id: block.id,
        kind: "preparation",
        eventId,
        state: "stale",
        message:
          "Meeting changed. Review the existing personal preparation block; it has not been moved automatically.",
        at: now(),
      });
    }
  };
  return { service, messages, reminders, intents, worker };
}
export type Runtime = ReturnType<typeof runtime>;
const origins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
const hosts = new Set([
  "localhost:5173",
  "127.0.0.1:5173",
  "127.0.0.1:4318",
  "localhost:4318",
]);
const requestObject = z.object({}).passthrough();
export function createApi(
  live: Runtime,
  fixture: Runtime,
  onConfig: (config: z.infer<typeof Config>) => void = () => {},
) {
  const app = new Hono();
  const sessions = new Map<string, { csrf: string; until: number }>();
  const getRuntime = (c: any) =>
    c.req.header("x-reality-mode") === "fixture" ? fixture : live;
  app.use("/api/*", async (c, next) => {
    const host = c.req.header("host") || new URL(c.req.url).host;
    assert(hosts.has(host), "Untrusted host.");
    assert(
      c.req.header("sec-fetch-site") !== "cross-site",
      "Cross-site access is blocked.",
    );
    const origin = c.req.header("origin");
    if (origin) assert(origins.has(origin), "Untrusted origin.");
    if (c.req.path === "/api/session") {
      assert(c.req.method === "GET", "Session bootstrap is read-only.");
      await next();
      return;
    }
    const sid = getCookie(c, "rs_session");
    const session = sid ? sessions.get(sid) : undefined;
    if (!session || session.until < Date.now())
      return c.json({ error: "Session expired. Reload the application." }, 401);
    if (!["GET", "HEAD"].includes(c.req.method)) {
      assert(
        origin && origins.has(origin),
        "An application origin is required.",
      );
      const token = c.req.header("x-csrf-token") || "";
      assert(
        token.length === session.csrf.length &&
          timingSafeEqual(Buffer.from(token), Buffer.from(session.csrf)),
        "Invalid CSRF token.",
      );
      assert(
        (c.req.header("content-type") || "").startsWith("application/json"),
        "Use a JSON request.",
      );
    }
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    await next();
  });
  app.get("/api/session", (c) => {
    const old = getCookie(c, "rs_session");
    let session = old ? sessions.get(old) : undefined;
    let sid = old;
    if (!session || session.until < Date.now()) {
      sid = randomBytes(32).toString("hex");
      session = {
        csrf: randomBytes(32).toString("hex"),
        until: Date.now() + 12 * 3600000,
      };
      sessions.set(sid, session);
      setCookie(c, "rs_session", sid, {
        httpOnly: true,
        sameSite: "Strict",
        path: "/",
        maxAge: 43200,
      });
    }
    c.header("Cache-Control", "no-store");
    return c.json({ csrf: session.csrf, operator: "Local operator" });
  });
  app.get("/api/state", (c) => {
    const r = getRuntime(c);
    return c.json({
      ...r.service.overview(),
      connections: r.service.store.get("meta", "connections"),
      credentials: r.service.providers.mode === "fixture" ? {} : configured(),
      dataDir,
      next: nextMeetings(
        r.service.events(),
        r.service.config().preferences.timezone,
      ),
    });
  });
  app.post("/api/check", async (c) => {
    const r = getRuntime(c);
    const connections = await r.service.providers.health();
    r.service.store.put("meta", "connections", connections);
    return c.json(connections);
  });
  app.post("/api/scan", (c) => {
    const r = getRuntime(c);
    assert(
      r.service.config().entities.length,
      "Add a reconciliation entity in Connections first.",
    );
    return c.json({ jobId: r.service.store.enqueue("scan", id(), {}) }, 202);
  });
  app.get("/api/mission/:id", (c) => {
    const service = getRuntime(c).service;
    return c.json({
      ...missionData(service, c.req.param("id")),
      credentials: configured(),
    });
  });
  app.post("/api/mission/:id/scan", (c) => {
    const service = getRuntime(c).service;
    const entity = service.entity(c.req.param("id"));
    const previous = service.store.get("missionJob", entity.id);
    const active = service.store
      .jobs()
      .find(
        (j) =>
          j.id === previous?.jobId &&
          ["queued", "running"].includes(String(j.state)),
      );
    const jobId =
      active?.id ??
      service.store.enqueue("mission-scan", id(), { entityId: entity.id });
    service.store.put("missionJob", entity.id, { jobId });
    return c.json({ jobId }, 202);
  });
  // Only the authenticated live workspace uses this stream. Replay never opens it.
  app.get("/api/mission/:id/events", (c) => {
    const entityId = c.req.param("id");
    live.service.entity(entityId);
    return streamSSE(c, async (stream) => {
      let previous = "";
      while (!stream.aborted) {
        const data = JSON.stringify({
          ...missionData(live.service, entityId),
          credentials: configured(),
        });
        if (data !== previous) {
          await stream.writeSSE({ event: "mission", data });
          previous = data;
        } else
          await stream.writeSSE({
            event: "heartbeat",
            data: String(Date.now()),
          });
        await stream.sleep(800);
      }
    });
  });
  app.put("/api/config", async (c) => {
    assert(getRuntime(c) === live, "Fixture configuration is fixed.");
    const config = saveConfig(await c.req.json());
    onConfig(config);
    live.service.store.log("configuration_updated", { at: now() });
    return c.json(config);
  });
  app.put("/api/preferences", async (c) => {
    const r = getRuntime(c);
    const next = Config.parse({
      ...r.service.config(),
      preferences: {
        ...r.service.config().preferences,
        ...(await c.req.json()),
      },
    });
    if (r === live) {
      saveConfig(next);
      onConfig(next);
    } else r.service.config = () => next;
    return c.json(next.preferences);
  });
  app.get("/api/plans/:id", (c) => {
    const r = getRuntime(c),
      p = r.service.plan(c.req.param("id"));
    return c.json({
      plan: p,
      snapshot: r.service.store.get("snapshot", p.snapshotId),
      approval: r.service.store.get("approval", p.id),
      run: r.service.store.get("run", p.id),
      effects: p.actions.map((a) => r.service.store.effect(a.id)),
    });
  });
  app.post("/api/plans/:id/decision", async (c) => {
    const body = z
      .object({ decision: z.enum(["approved", "rejected", "unresolved"]) })
      .parse(await c.req.json());
    return c.json(
      getRuntime(c).service.approve(
        c.req.param("id"),
        "operator",
        body.decision,
      ),
      202,
    );
  });
  app.post("/api/plans/:id/resume", (c) =>
    c.json({ jobId: getRuntime(c).service.resume(c.req.param("id")) }, 202),
  );
  app.get("/api/history", (c) => c.json(getRuntime(c).service.store.history()));
  app.post("/api/jobs/:id/retry", (c) => {
    const r = getRuntime(c);
    r.service.store.retry(c.req.param("id"));
    return c.json({ queued: true });
  });
  app.post("/api/intent", async (c) => {
    const { text } = z
      .object({ text: z.string().min(1).max(2000) })
      .parse(await c.req.json());
    return c.json(await getRuntime(c).intents.preview(text));
  });
  app.post("/api/reminders/preview", async (c) =>
    c.json(await getRuntime(c).reminders.preview(await c.req.json())),
  );
  app.post("/api/reminders", async (c) => {
    const body = await c.req.json();
    assert(
      typeof body.expectedEventRevision === "string" &&
        typeof body.expectedTriggerAt === "string",
      "A concrete reminder preview revision and trigger time are required.",
    );
    return c.json(
      await getRuntime(c).reminders.approve(
        body,
        body.expectedEventRevision,
        body.expectedTriggerAt,
      ),
      202,
    );
  });
  app.post("/api/reminders/:id/cancel", async (c) => {
    await getRuntime(c).reminders.cancel(c.req.param("id"));
    return c.json({ canceled: true });
  });
  app.post("/api/preparation/preview", async (c) => {
    const b = z
      .object({
        eventId: z.string(),
        start: z.string().datetime({ offset: true }),
      })
      .parse(await c.req.json());
    return c.json(
      await getRuntime(c).reminders.preparation(b.eventId, b.start),
    );
  });
  app.post("/api/preparation", async (c) => {
    const b = z
      .object({
        eventId: z.string(),
        start: z.string().datetime({ offset: true }),
        eventRevision: z.string(),
      })
      .parse(await c.req.json());
    return c.json(
      await getRuntime(c).reminders.approveBlock(
        b.eventId,
        b.start,
        b.eventRevision,
      ),
      202,
    );
  });
  app.post("/api/drafts", async (c) => {
    const b = z
      .object({
        entityId: z.string(),
        category: z.enum(["clarification", "update", "consequence"]),
        audience: Audience,
      })
      .parse(await c.req.json());
    return c.json(
      await getRuntime(c).messages.create(b.entityId, b.category, b.audience),
    );
  });
  app.post("/api/slack/review", async (c) => {
    const b = z
      .object({ planId: z.string(), draftId: z.string().optional() })
      .parse(await c.req.json());
    return c.json(await getRuntime(c).messages.controls(b.planId, b.draftId));
  });
  app.put("/api/drafts/:id", async (c) => {
    const b = z
      .object({ revision: z.string(), text: z.string() })
      .parse(await c.req.json());
    return c.json(
      getRuntime(c).messages.edit(c.req.param("id"), b.revision, b.text),
    );
  });
  app.post("/api/drafts/:id/send", async (c) => {
    const b = z.object({ revision: z.string() }).parse(await c.req.json());
    return c.json(
      await getRuntime(c).messages.approveSend(
        c.req.param("id"),
        b.revision,
        "operator",
      ),
      202,
    );
  });
  app.post("/api/drafts/:id/dismiss", async (c) => {
    const b = z.object({ revision: z.string() }).parse(await c.req.json());
    getRuntime(c).messages.dismiss(c.req.param("id"), b.revision);
    return c.json({ dismissed: true });
  });
  app.post("/api/drafts/:id/recover", async (c) => {
    await getRuntime(c).messages.recover(c.req.param("id"));
    return c.json({ verified: true });
  });
  app.get("/api/events/:id/attendees", async (c) =>
    c.json(await getRuntime(c).messages.verifyMappings(c.req.param("id"))),
  );
  app.post("/api/events/:id/attendees/drafts", async (c) => {
    const r = getRuntime(c),
      eventId = c.req.param("id");
    const b = z
      .object({ category: z.enum(["clarification", "update", "consequence"]) })
      .parse(await c.req.json());
    const mappings = await r.messages.verifyMappings(eventId);
    assert(
      mappings.allMapped,
      "Some attendees are unmapped; no attendee drafts were prepared. Review external communication manually.",
    );
    for (const a of mappings.attendees)
      await r.messages.audienceAllowed(eventId, {
        kind: "slack",
        target: a.slackId!,
      });
    const drafts = [];
    for (const a of mappings.attendees)
      drafts.push(
        await r.messages.create(eventId, b.category, {
          kind: "slack",
          target: a.slackId!,
        }),
      );
    return c.json({ drafts, recipientCount: drafts.length, sent: false });
  });
  app.onError((error, c) =>
    c.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ")
            : safeError(error),
      },
      400,
    ),
  );
  return app;
}
