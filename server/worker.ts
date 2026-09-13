import type { RealityService } from "./service.ts";
import type { Job } from "./db.ts";
import { safeError } from "./util.ts";
export class Worker {
  handlers = new Map<string, (payload: any) => Promise<unknown>>();
  private busy = false;
  private timer?: NodeJS.Timeout;
  private lastScan = 0;
  constructor(public service: RealityService) {
    this.handlers.set("scan", () => service.scan());
    this.handlers.set("repair", (p) => service.execute(p.planId));
    this.handlers.set("dependency", async (p) =>
      service.onDependency?.(p.eventId),
    );
  }
  async once() {
    if (this.busy) return;
    this.busy = true;
    let job: Job | undefined;
    let heartbeat: NodeJS.Timeout | undefined;
    try {
      job = this.service.store.claim();
      if (!job) return;
      const current = job;
      heartbeat = setInterval(() => {
        const next = Date.now() + 120000;
        const result = this.service.store.db
          .prepare(
            "UPDATE jobs SET lease=? WHERE id=? AND state='running' AND lease=?",
          )
          .run(next, current.id, current.lease);
        if (result.changes) current.lease = next;
      }, 30000);
      const handler = this.handlers.get(job.kind);
      if (!handler) throw new Error("Unsupported durable job: " + job.kind);
      await handler(JSON.parse(job.payload));
      this.service.store.finish(job);
    } catch (error) {
      if (job) this.service.store.fail(job, safeError(error));
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.busy = false;
    }
  }
  start() {
    this.timer = setInterval(() => {
      if (
        !this.service.config().preferences.scanPaused &&
        this.service.config().entities.length &&
        Date.now() - this.lastScan > 300000
      ) {
        this.lastScan = Date.now();
        this.service.store.enqueue(
          "scan",
          String(Math.floor(Date.now() / 300000)),
          {},
        );
      }
      void this.once();
    }, 1000);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
