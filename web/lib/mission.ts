import type {
  AssessmentT,
  RepairAction,
  RepairPlan,
  Snapshot,
} from "../../server/contracts.ts";
import type { MissionData, MissionEvent } from "../../server/mission.ts";
import type { Effect } from "../../server/db.ts";

export const STAGES = [
  "Detect",
  "Investigate",
  "Reconcile",
  "Approve",
  "Act",
  "Verify",
  "Adapt",
];
export const ROLES = ["temporal", "authority", "skeptic"] as const;
export const UPDATE_TEXT =
  "Decision update: Atlas Demo Launch has moved from September 30, 2026 to October 2, 2026. As the decision owner, I confirm October 2 replaces the previous date. Keep it as an all-day milestone. The Calendar event and Jira release should both be updated to October 2.";
export const BEATS = [
  {
    stage: 0,
    title: "Everything agrees. Until reality moves.",
    note: "Introduce the launch. One decision is represented in three applications; they currently agree.",
    seconds: 8,
  },
  {
    stage: 0,
    title: "One reply changes the launch.",
    note: "The owner explicitly replaces September 30 with October 2. Slack changes; the other records do not.",
    seconds: 10,
  },
  {
    stage: 1,
    title: "Evidence arrives. A timeline takes shape.",
    note: "Original text, actual author, timestamp, and source references remain attached to every claim.",
    seconds: 9,
  },
  {
    stage: 1,
    title: "Three perspectives. No shared conclusions yet.",
    note: "Three isolated assessment contexts use the same configured model and retrieved evidence. They do not retrieve independently.",
    seconds: 8,
  },
  {
    stage: 1,
    title: "Temporal orders the decisions.",
    note: "Watch the timeline: the original date remains in history, while the explicit replacement establishes the proposed new date.",
    seconds: 8,
  },
  {
    stage: 1,
    title: "Authority attaches the decision owner.",
    note: "The author is checked against configured user IDs. Saying ‘I am the owner’ would not grant authority.",
    seconds: 8,
  },
  {
    stage: 1,
    title: "Skeptic tests the apparent contradiction.",
    note: "All three initial assessments are now committed. Only now can peers see and compare them.",
    seconds: 10,
  },
  {
    stage: 2,
    title: "Compare the evidence. Resolve the concern.",
    note: "Skeptic asks whether the older date is superseded. The system permits one bounded follow-up round using original evidence.",
    seconds: 10,
  },
  {
    stage: 2,
    title: "One follow-up. A grounded decision.",
    note: "The owner’s explicit replacement resolves the concern. If evidence remained ambiguous, the engine would abstain.",
    seconds: 9,
  },
  {
    stage: 2,
    title: "One date. Two precise repairs.",
    note: "Only start/end dates and the Jira release date change. Calendar end dates are exclusive: October 3 means the October 2 milestone ends at midnight.",
    seconds: 10,
  },
  {
    stage: 3,
    title: "Your decision is the execution boundary.",
    note: "Pause here. Human approval binds to this exact immutable revision. New evidence or changed target state invalidates the action.",
    seconds: 0,
  },
  {
    stage: 4,
    title: "Approved. Now the system can act.",
    note: "An effect is persisted before the Calendar request. Calendar uses an ETag; Jira receives its own immediate preflight.",
    seconds: 8,
  },
  {
    stage: 4,
    title: "A response is not verification.",
    note: "The service independently reads Calendar after the write. In the recovery branch, the reply is lost and the result is uncertain.",
    seconds: 8,
  },
  {
    stage: 4,
    title: "Calendar verified. Jira has its own outcome.",
    note: "Calendar is now independently confirmed. Jira is a separate operation; a Jira failure does not erase Calendar’s success.",
    seconds: 9,
  },
  {
    stage: 5,
    title: "Read it back. Compare every requested field.",
    note: "The green badge requires returned provider values to match the approved patch. Sending a request is not enough.",
    seconds: 9,
  },
  {
    stage: 5,
    title: "The records now reflect the decision.",
    note: "Both resources match after a final independent reread. Proposed, approved, applied, and verified remain distinct records.",
    seconds: 9,
  },
  {
    stage: 6,
    title: "Reality changed. The next steps adapt.",
    note: "Native relative reminders follow the event. Preparation needs an explicit issue link. Messages require audience checks and a separate reviewed send.",
    seconds: 0,
  },
];
export function nextBeat(
  beat: number,
  recovery: boolean,
  action: "next" | "approve" | "recover" = "next",
) {
  if (beat === 10 && action !== "approve") return beat;
  if (beat === 12 && recovery && action !== "recover") return beat;
  return Math.min(beat + 1, BEATS.length - 1);
}

const at = (second: number) =>
  new Date(Date.UTC(2026, 8, 14, 15, 0, second)).toISOString();
const explain = [
  "The later owner reply explicitly replaces September 30 with October 2. The milestone remains all-day.",
  "The reply’s author matches the configured decision owner. Authority comes from the ID binding, not the message’s wording.",
  "The event and version still say September 30. Check whether that is stale state or a conflicting authorized decision.",
];
const initial: AssessmentT[] = ROLES.map((role, i) => ({
  role,
  supported: ["E2"],
  concerns:
    i === 2
      ? ["Confirm the September 30 decision is explicitly superseded."]
      : [],
  explanation: explain[i],
  confidence: [0.97, 0.99, 0.82][i],
  needsFollowup: i === 2,
}));
const followup: AssessmentT[] = initial.map((a) => ({
  ...a,
  concerns: [],
  confidence: 0.98,
  needsFollowup: false,
  explanation:
    a.role === "skeptic"
      ? "E2 explicitly replaces E1 for the same launch and scope. Older provider dates are stale records; no competing owner decision is present."
      : a.explanation,
}));

/** Presentation fixture only. No live IDs, tokens, source material, or provider calls. */
export function replayData(beat: number, recovery = false): MissionData {
  const entity = {
    id: "atlas-launch",
    title: "Atlas Demo Launch",
    kind: "launch" as const,
    calendarId: "replay-calendar",
    eventId: "replay-event",
    slackChannelId: "replay-channel",
    threadTs: "replay-thread",
    authorityUserIds: ["replay-owner"],
    jiraVersionId: "replay-version",
    jiraProjectId: "replay-project",
    clientMeeting: false,
  };
  const calendar = {
    id: entity.eventId,
    etag: '"replay-etag-1"',
    summary: entity.title,
    start: { date: "2026-09-30" },
    end: { date: "2026-10-01" },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 30 }],
    },
    status: "confirmed",
  };
  const jira = {
    id: entity.jiraVersionId,
    name: entity.title,
    releaseDate: "2026-09-30",
    released: false,
  };
  const evidence = [
    {
      id: "E1",
      source: "slack" as const,
      entityId: entity.id,
      authorId: "replay-owner",
      at: at(0),
      retrievedAt: at(30),
      text: "Decision: Atlas Demo Launch is September 30, 2026. Keep it as an all-day milestone.",
      url: "",
      channelId: entity.slackChannelId,
      threadTs: entity.threadTs,
      private: true,
    },
    ...(beat >= 1
      ? [
          {
            id: "E2",
            source: "slack" as const,
            entityId: entity.id,
            authorId: "replay-owner",
            at: at(20),
            retrievedAt: at(30),
            text: UPDATE_TEXT,
            url: "",
            channelId: entity.slackChannelId,
            threadTs: entity.threadTs,
            private: true,
          },
        ]
      : []),
  ];
  const snapshot: Snapshot = {
    id: "replay:snapshot:02",
    entity,
    calendar,
    jira,
    evidence,
    defaults: [],
    retrievedAt: at(30),
    complete: true,
    warnings: [],
  };
  const claims = evidence.map((e) => ({
    evidenceId: e.id,
    entityId: entity.id,
    field: "launchDate" as const,
    value: e.id === "E1" ? "2026-09-30" : "2026-10-02",
    statement: "approved" as const,
    supersedesEvidenceIds: e.id === "E2" ? ["E1"] : [],
    quote: e.text,
    validAt: null,
  }));
  const actions: RepairAction[] = [
    {
      id: "replay:calendar:02",
      provider: "calendar",
      target: entity.eventId,
      before: { start: calendar.start, end: calendar.end },
      patch: { start: { date: "2026-10-02" }, end: { date: "2026-10-03" } },
      etag: calendar.etag,
      description: "Move the all-day milestone",
    },
    {
      id: "replay:jira:02",
      provider: "jira",
      target: entity.jiraVersionId,
      before: { releaseDate: jira.releaseDate },
      patch: { releaseDate: "2026-10-02" },
      description: "Correct the release date",
    },
  ];
  const plan: RepairPlan = {
    id: "replay:revision:02",
    entityId: entity.id,
    snapshotId: snapshot.id,
    createdAt: at(50),
    claims,
    assessments: initial,
    followup,
    actions,
    status: "review",
    explanation:
      "The configured owner explicitly replaced the prior launch date. All three assessments support October 2 after one follow-up. Only the selected Calendar dates and Jira release date need repair.",
    unresolved: [],
    canonical: { launchDate: "2026-10-02" },
    mode: "fixture",
  };
  const events: MissionEvent[] = [
    { seq: 1, at: at(30), kind: "evidence_received" },
  ];
  function emit(
    kind: string,
    role?: (typeof ROLES)[number],
    round?: "initial" | "followup",
    actionId?: string,
  ) {
    events.push({
      seq: events.length + 1,
      at: at(30 + events.length),
      kind,
      role,
      round,
      actionId,
    });
  }
  if (beat >= 3)
    ROLES.forEach((role) => emit("assessment_started", role, "initial"));
  ROLES.forEach((role, i) => {
    if (beat >= i + 4) emit("assessment_sealed", role, "initial");
  });
  if (beat >= 6) emit("assessments_committed");
  if (beat >= 7)
    ROLES.forEach((role) => emit("assessment_started", role, "followup"));
  if (beat >= 8) emit("followup_committed");
  const effects: Effect[] = [];
  if (beat >= 11) {
    const verified = beat >= 13;
    effects.push({
      id: actions[0].id,
      kind: "repair",
      state: verified
        ? "verified"
        : recovery && beat === 12
          ? "uncertain"
          : "sending",
      request: { planId: plan.id, action: actions[0] },
      attempts: 1,
      updatedAt: at(70),
      observations: verified
        ? [
            {
              phase: recovery ? "preflight" : "readback",
              at: at(70),
              value: { ...calendar, ...actions[0].patch },
            },
          ]
        : [],
      reference: verified && recovery ? { recovered: true } : undefined,
      error:
        recovery && beat === 12
          ? "Calendar may have accepted the write; the response was lost. Reread before retrying."
          : undefined,
    });
    emit(
      beat === 12 && !recovery ? "awaiting_verification" : "operation_started",
      undefined,
      undefined,
      actions[0].id,
    );
  }
  if (beat >= 13) {
    effects.push({
      id: actions[1].id,
      kind: "repair",
      state: beat >= 15 ? "verified" : "sending",
      request: { planId: plan.id, action: actions[1] },
      attempts: 1,
      updatedAt: at(80),
      observations:
        beat >= 15
          ? [
              {
                phase: "readback",
                at: at(80),
                value: { ...jira, ...actions[1].patch },
              },
            ]
          : [],
    });
    emit(
      beat >= 14 ? "awaiting_verification" : "operation_started",
      undefined,
      undefined,
      actions[1].id,
    );
  }
  return {
    entity,
    model: "Configured Responses model",
    snapshot,
    plan: beat >= 9 ? plan : undefined,
    currentPlanId: plan.id,
    progress: {
      id: "replay-run",
      entityId: entity.id,
      state: beat >= 9 ? "complete" : "investigating",
      startedAt: at(30),
      updatedAt: at(30 + beat),
      events,
      claims,
      initial: beat >= 6 ? initial : undefined,
      followup: beat >= 8 ? followup : undefined,
    },
    approval:
      beat >= 11
        ? {
            id: "replay-approval",
            planId: plan.id,
            actor: "replay-operator",
            at: at(60),
            decision: "approved",
          }
        : undefined,
    run:
      beat >= 11
        ? {
            state:
              beat >= 15
                ? "verified"
                : recovery && beat === 12
                  ? "uncertain"
                  : "executing",
            error:
              recovery && beat === 12
                ? "Calendar response lost. Jira has not started."
                : undefined,
            verifiedAt: beat >= 15 ? at(90) : undefined,
            observations:
              beat >= 15
                ? {
                    calendar: { ...calendar, ...actions[0].patch },
                    jira: { ...jira, ...actions[1].patch },
                  }
                : undefined,
          }
        : undefined,
    effects,
    reminders: [],
    credentials: {},
    connections: [],
  };
}

export function fields(
  value: Record<string, any>,
  prefix = "",
): { field: string; value: unknown }[] {
  return Object.entries(value).flatMap(([key, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? fields(v, prefix + key + ".")
      : [{ field: prefix + key, value: v }],
  );
}
export function readField(value: any, path: string): unknown {
  return path.split(".").reduce((v, key) => v?.[key], value);
}
export function operations(data: MissionData) {
  return (data.plan?.actions ?? []).map((action) => {
    const effect = data.effects.find((e) => e.id === action.id);
    const last = [...(effect?.observations ?? [])]
      .reverse()
      .find(
        (o) =>
          o.phase === "readback" ||
          (o.phase === "preflight" && effect?.state === "verified"),
      );
    const observed = data.run?.observations?.[action.provider] ?? last?.value;
    const rows = fields(action.patch).map((row) => ({
      ...row,
      before: readField(action.before, row.field),
      observed: readField(observed, row.field),
    }));
    const matches =
      rows.length > 0 &&
      rows.every(
        (r) =>
          r.observed !== undefined &&
          JSON.stringify(r.value) === JSON.stringify(r.observed),
      );
    const bound =
      data.approval?.decision === "approved" &&
      data.approval.planId === data.plan?.id &&
      data.currentPlanId === data.plan?.id;
    const verified = bound && effect?.state === "verified" && matches;
    const event = [...(data.progress?.events ?? [])]
      .reverse()
      .find((e) => e.actionId === action.id);
    const state = verified
      ? "verified"
      : effect?.state === "verified"
        ? "verification mismatch"
        : effect?.state === "sending"
          ? event?.kind === "awaiting_verification"
            ? "awaiting verification"
            : "in progress"
          : effect?.state === "uncertain"
            ? "uncertain"
            : effect?.state === "failed"
              ? "failed"
              : "pending";
    return {
      action,
      effect,
      rows,
      verified,
      state,
      observedAt: data.run?.verifiedAt ?? last?.at,
    };
  });
}
export function liveStage(data?: MissionData) {
  if (!data || data.progress?.state === "reading") return 0;
  if (["investigating", "failed"].includes(data.progress?.state ?? ""))
    return data.progress?.claims ? 1 : 0;
  if (
    data.run?.state === "verified" &&
    operations(data).length > 0 &&
    operations(data).every((o) => o.verified)
  )
    return 6;
  if (data.run && data.approval?.decision === "approved")
    return ["approved", "executing"].includes(data.run.state) ? 4 : 5;
  if (data.plan?.status === "review") return 3;
  return 2;
}
export function expectedReply(data: MissionData) {
  const normalize = (text: string) =>
    text.replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
  return data.snapshot?.evidence.find(
    (e) =>
      e.source === "slack" &&
      e.channelId === data.entity.slackChannelId &&
      e.threadTs === data.entity.threadTs &&
      e.id !== `slack:${data.entity.slackChannelId}:${data.entity.threadTs}` &&
      normalize(e.text) === normalize(UPDATE_TEXT),
  );
}
