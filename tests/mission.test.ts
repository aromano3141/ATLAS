import test from "node:test";
import assert from "node:assert/strict";
import {
  BEATS,
  nextBeat,
  replayData,
  operations,
  expectedReply,
  liveStage,
} from "../web/lib/mission.ts";
import { Store } from "../server/db.ts";
import { FixtureProviders, fixtureConfig } from "../server/fixtures.ts";
import { FixtureEngine, investigate } from "../server/engine.ts";
import { RealityService } from "../server/service.ts";
import { missionData } from "../server/mission.ts";

test("replay cannot skip approval or recovery; both branches finish with independent comparisons", () => {
  for (const recovery of [false, true]) {
    let beat = 0;
    while (beat < BEATS.length - 1) {
      const data = replayData(beat, recovery);
      if (beat <= 10) {
        assert.equal(data.approval, undefined);
        assert.equal(data.effects.length, 0);
      }
      if (beat === 10 || (recovery && beat === 12))
        assert.equal(nextBeat(beat, recovery), beat);
      beat = nextBeat(
        beat,
        recovery,
        beat === 10 ? "approve" : recovery && beat === 12 ? "recover" : "next",
      );
    }
    const final = replayData(beat, recovery);
    assert.equal(operations(final).length, 2);
    assert.ok(operations(final).every((o) => o.verified));
    assert.equal(final.effects[0].attempts, 1);
    assert.equal(final.snapshot!.calendar.start.date, "2026-09-30");
    assert.equal(final.run!.observations!.calendar.end.date, "2026-10-03");
  }
});
test("verification badges reject missing reads, mismatched dates, and stale approvals", () => {
  for (const mutate of [
    (d: ReturnType<typeof replayData>) => {
      d.effects[0].observations = [];
      d.run!.observations = undefined;
    },
    (d: ReturnType<typeof replayData>) => {
      d.run!.observations!.calendar = {
        ...d.run!.observations!.calendar,
        end: { date: "2026-10-04" },
      };
    },
    (d: ReturnType<typeof replayData>) => {
      d.currentPlanId = "superseded";
    },
    (d: ReturnType<typeof replayData>) => {
      d.approval = undefined;
    },
  ]) {
    const d = replayData(16);
    mutate(d);
    assert.equal(operations(d)[0].verified, false);
    assert.notEqual(liveStage(d), 6);
  }
  const partial = replayData(13);
  partial.effects[1].state = "failed";
  partial.run!.state = "partial";
  assert.equal(operations(partial)[0].verified, true);
  assert.equal(operations(partial)[1].verified, false);
});
test("expected reply is checked against fetched text, bound channel and thread", () => {
  assert.equal(expectedReply(replayData(0)), undefined);
  assert.equal(expectedReply(replayData(1))?.id, "E2");
  const d = replayData(1);
  d.snapshot!.evidence[1].threadTs = "another-thread";
  assert.equal(expectedReply(d), undefined);
});
test("progress exposes only sealed status before independent assessments commit", async () => {
  const store = new Store(":memory:");
  try {
    const base = new FixtureEngine(),
      providers = new FixtureProviders(store);
    const snapshot = await providers.snapshot(fixtureConfig().entities[0]);
    let committed = false;
    const events: string[] = [];
    await investigate(
      base,
      snapshot,
      () => {
        committed = true;
      },
      (kind, detail) => {
        events.push(kind);
        if (kind === "assessment_sealed") {
          assert.equal(detail?.initial, undefined);
          assert.equal(committed, false);
        }
        if (kind === "assessments_committed") {
          assert.equal(committed, true);
          assert.equal(detail?.initial?.length, 3);
        }
      },
    );
    assert.equal(events.filter((e) => e === "assessment_sealed").length, 3);
    assert.ok(
      events.indexOf("assessments_committed") >
        events.lastIndexOf("assessment_sealed"),
    );
  } finally {
    store.close();
  }
});
test("Mission scan reads configured resources without scheduling downstream writes; failed reads hide old plans", async () => {
  const store = new Store(":memory:");
  try {
    const providers = new FixtureProviders(store);
    const service = new RealityService(
      store,
      providers,
      new FixtureEngine(),
      fixtureConfig,
    );
    const entity = fixtureConfig().entities[0];
    await service.scanEntity(entity, true);
    const data = missionData(service, entity.id);
    assert.equal(data.entity.eventId, entity.eventId);
    assert.equal(data.progress?.state, "complete");
    assert.ok(data.snapshot);
    assert.equal(store.jobs().length, 0);
    assert.equal(store.effects().length, 0);
    await service.scanEntity(entity);
    assert.ok(service.events().some((e) => e.entityId === entity.id));
    assert.ok(store.jobs().some((j) => j.kind === "dependency"));
    providers.snapshot = async () => {
      throw new Error("Read unavailable");
    };
    await assert.rejects(service.scanEntity(entity, true));
    const failed = missionData(service, entity.id);
    assert.equal(failed.plan, undefined);
    assert.equal(failed.progress?.state, "failed");
    assert.equal(failed.effects.length, 0);
  } finally {
    store.close();
  }
});
