import { serve } from "@hono/node-server";
import { join } from "node:path";
import { Store } from "./db.ts";
import { loadConfig, dataDir } from "./config.ts";
import { LiveProviders } from "./providers.ts";
import { OpenAIEngine, FixtureEngine } from "./engine.ts";
import { FixtureProviders, fixtureConfig } from "./fixtures.ts";
import { RealityService } from "./service.ts";
import { runtime, createApi } from "./api.ts";
import { startSlack } from "./slack.ts";
let config = loadConfig();
const liveStore = new Store(join(dataDir, "reality.sqlite"));
const fixtureStore = new Store(join(dataDir, "fixtures.sqlite"));
const live = runtime(
  new RealityService(
    liveStore,
    new LiveProviders(() => config),
    new OpenAIEngine(() => config, liveStore),
    () => config,
  ),
);
const fixture = runtime(
  new RealityService(
    fixtureStore,
    new FixtureProviders(fixtureStore),
    new FixtureEngine(),
    fixtureConfig,
  ),
);
const app = createApi(live, fixture, (c) => {
  config = c;
});
let slack: Awaited<ReturnType<typeof startSlack>>;
let timer: NodeJS.Timeout;
const server = serve(
  { fetch: app.fetch, hostname: "127.0.0.1", port: 4318 },
  async () => {
    console.log("Reality Sync API: http://127.0.0.1:4318 (local only)");
    for (const r of [live, fixture]) {
      await r.reminders.tick(true);
      await r.reminders.reconcilePending();
      r.worker.start();
    }
    timer = setInterval(() => {
      for (const r of [live, fixture]) {
        r.maps.prune();
        void r.reminders
          .tick()
          .catch((e) =>
            r.service.store.log("reminder_tick_failed", { error: e.message }),
          );
        for (const trip of r.service.store.all("trip")) {
          const departure = Date.parse(trip.acceptedDepartureAt);
          if (
            trip.state === "accepted" &&
            departure > Date.now() &&
            departure - Date.now() < 2 * 3600000
          )
            r.service.store.enqueue(
              "travel-refresh",
              `${trip.id}:${Math.floor(Date.now() / 300000)}`,
              { tripId: trip.id },
            );
        }
      }
    }, 15000);
    try {
      slack = await startSlack(live);
    } catch (e) {
      liveStore.log("slack_socket_failed", { error: (e as Error).message });
    }
  },
);
async function stop() {
  clearInterval(timer);
  for (const r of [live, fixture]) r.worker.stop();
  await slack?.stop();
  server.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
