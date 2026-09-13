import type {
  AssessmentT,
  ClaimT,
  Snapshot,
  RepairPlan,
  Approval,
  EventRevision,
  EntityT,
} from "./contracts.ts";
import type { Effect } from "./db.ts";
import type { RealityService } from "./service.ts";

export interface MissionEvent {
  seq: number;
  at: string;
  kind: string;
  role?: AssessmentT["role"];
  round?: "initial" | "followup";
  actionId?: string;
}
export interface MissionProgress {
  id: string;
  entityId: string;
  state: "reading" | "investigating" | "complete" | "failed";
  startedAt: string;
  updatedAt: string;
  events: MissionEvent[];
  claims?: ClaimT[];
  initial?: AssessmentT[];
  followup?: AssessmentT[];
  reused?: boolean;
  error?: string;
}
export interface MissionData {
  entity: EntityT;
  model: string;
  progress?: MissionProgress;
  snapshot?: Snapshot;
  plan?: RepairPlan;
  approval?: Approval;
  run?: {
    state: string;
    error?: string;
    verifiedAt?: string;
    observations?: {
      calendar: Record<string, any>;
      jira?: Record<string, any>;
    };
  };
  effects: Effect[];
  event?: EventRevision;
  currentPlanId?: string;
  reminders: any[];
  credentials: Record<string, boolean>;
  connections: any[];
}

/** Local presentation projection. Resource bindings always come from current configuration. */
export function missionData(
  service: RealityService,
  entityId: string,
): Omit<MissionData, "credentials"> {
  const entity = service.entity(entityId);
  const current = service.store.get("current", entityId);
  const progress = service.store.get<MissionProgress>(
    "missionProgress",
    entityId,
  );
  const plan = current ? service.plan(current.planId) : undefined;
  const snapshot = service.store.get<Snapshot>("missionSnapshot", entityId);
  return {
    entity,
    model: service.config().model,
    progress,
    snapshot:
      snapshot &&
      Date.parse(snapshot.retrievedAt) >= Date.parse(progress?.startedAt ?? "")
        ? snapshot
        : undefined,
    // A failed or unfinished fresh investigation must not present a previous plan as current evidence.
    plan: progress?.state === "complete" ? plan : undefined,
    approval: plan && service.store.get("approval", plan.id),
    run: plan && service.store.get("run", plan.id),
    effects: plan
      ? plan.actions.flatMap((a) => service.store.effect(a.id) ?? [])
      : [],
    event: service.store.get("event", entityId),
    currentPlanId: current?.planId,
    reminders: service.store
      .all("reminder")
      .filter((r) => r.eventId === entityId),
    connections: service.store.get("meta", "connections") ?? [],
  };
}
