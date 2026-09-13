"use client";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  GitCompareArrows,
  Hash,
  Radio,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { date } from "@/lib/api";
import { ROLES, operations, expectedReply } from "@/lib/mission";
import type { MissionData } from "../../../server/mission";

const icons = {
  temporal: Clock3,
  authority: ShieldCheck,
  skeptic: TriangleAlert,
};
const prompts = {
  temporal: "Order the events. Identify explicit replacements.",
  authority: "Check the actual author against configured owners.",
  skeptic: "Test ambiguity, scope, and contradictory decisions.",
};
export const short = (value?: string) =>
  value
    ? value.length > 24
      ? value.slice(0, 12) + "…" + value.slice(-7)
      : value
    : "Not available";
const display = (value: unknown) =>
  value === undefined
    ? "Not yet reread"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
export const stamp = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "America/Chicago",
      }).format(new Date(value)) + " CT"
    : "Not read";
const safeSource = (url: string) => {
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
};

export function SourceCards({
  data,
  reading,
  highlight,
  onInspect,
}: {
  data?: MissionData;
  reading: boolean;
  highlight: string;
  onInspect: () => void;
}) {
  const ops = data ? operations(data) : [];
  const claims = data?.progress?.claims ?? data?.plan?.claims ?? [];
  const dates = claims.filter((c) => c.field === "launchDate");
  const current = dates.filter(
    (c) =>
      !dates.some((other) =>
        other.supersedesEvidenceIds.includes(c.evidenceId),
      ),
  );
  const unique = [...new Set(current.map((c) => c.value))];
  const reply = data && expectedReply(data);
  const slackDate = unique.length === 1 ? unique[0] : undefined;
  return (
    <aside className="mc-sources">
      <p className="mc-rail-label">
        SOURCE RECORDS <span>03</span>
      </p>
      {(["slack", "calendar", "jira"] as const).map((provider) => {
        const op = ops.find((o) => o.action.provider === provider);
        const record = op?.verified
          ? op.effect?.observations.at(-1)?.value
          : undefined;
        const value =
          provider === "slack"
            ? slackDate
            : provider === "calendar"
              ? (record?.start?.date ?? data?.snapshot?.calendar.start?.date)
              : (record?.releaseDate ?? data?.snapshot?.jira?.releaseDate);
        const Icon =
          provider === "slack"
            ? Hash
            : provider === "calendar"
              ? CalendarDays
              : GitCompareArrows;
        const title =
          provider === "calendar"
            ? "Calendar"
            : provider === "slack"
              ? "Slack"
              : "Jira";
        const status = reading
          ? "Reading current records…"
          : (op?.state ??
            (provider === "slack"
              ? reply
                ? "Expected reply found"
                : data?.snapshot
                  ? "Thread read · inspect evidence"
                  : "Waiting for thread"
              : value
                ? "Read from source"
                : "Not available"));
        return (
          <button
            onClick={onInspect}
            className={`mc-source mc-${provider} ${highlight === provider ? "mc-linked" : ""}`}
            key={provider}
            aria-label={`Inspect ${title} source`}
          >
            <div className="mc-card-top">
              <span className="mc-provider-icon">
                <Icon size={20} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>
                  {provider === "slack"
                    ? "Decision thread"
                    : provider === "calendar"
                      ? "All-day milestone"
                      : "Release version"}
                </p>
              </div>
              {op?.verified ? (
                <CheckCircle2 size={16} className="mc-green" />
              ) : (
                <span className={"mc-dot " + (reading ? "mc-pulse" : "")} />
              )}
            </div>
            <strong className="mc-source-date">
              {reading
                ? "Reading…"
                : value
                  ? date(String(value)).replace(", 2026", "")
                  : provider === "slack"
                    ? unique.length > 1
                      ? "Disputed"
                      : "Evidence"
                    : "—"}
              <span>{typeof value === "string" ? value.slice(0, 4) : ""}</span>
            </strong>
            <div
              className={
                "mc-source-foot " +
                (op?.verified ? "mc-green" : op ? "mc-amber" : "")
              }
            >
              {status}
            </div>
          </button>
        );
      })}
    </aside>
  );
}

export function Timeline({
  data,
  beat,
  replay,
  selected,
  select,
}: {
  data?: MissionData;
  beat: number;
  replay: boolean;
  selected: string;
  select: (id: string) => void;
}) {
  const claims = data?.progress?.claims ?? data?.plan?.claims ?? [];
  const evidence = [...(data?.snapshot?.evidence ?? [])].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  const initial = data?.progress?.initial ?? data?.plan?.assessments ?? [];
  const temporalBuilt = replay
    ? beat >= 4
    : initial.some((a) => a.role === "temporal");
  const authorityBuilt = replay
    ? beat >= 5
    : initial.some((a) => a.role === "authority");
  const skepticBuilt = replay
    ? beat >= 6
    : initial.some((a) => a.role === "skeptic");
  const displayed = replay ? evidence : evidence.slice(-12);
  return (
    <div className="mc-timeline" aria-label="Evidence timeline">
      {!evidence.length && (
        <div className="mc-waiting">
          <Radio size={28} />
          <h3>Listening for evidence</h3>
          <p>
            Slack, Calendar, and Jira must be read before the timeline can be
            assembled.
          </p>
        </div>
      )}
      {displayed.map((e, index) => {
        const claim = claims.find((c) => c.evidenceId === e.id);
        const replaced =
          temporalBuilt &&
          claims.some((c) => c.supersedesEvidenceIds.includes(e.id));
        const owned = data?.entity.authorityUserIds.includes(e.authorId);
        const supported = initial.filter((a) => a.supported.includes(e.id));
        return (
          <article
            key={e.id}
            className={`mc-evidence ${index > 0 ? "mc-evidence-new" : ""} ${replaced ? "mc-superseded" : ""} ${selected === e.id ? "mc-selected" : ""}`}
          >
            <span className="mc-timeline-node" />
            <div className="mc-evidence-meta">
              <Hash size={14} />
              <span>{replay ? "Decision owner" : e.authorId}</span>
              <time dateTime={e.at}>{stamp(e.at)}</time>
            </div>
            <button
              className="mc-evidence-select"
              onClick={() => select(selected === e.id ? "" : e.id)}
              aria-label={`Trace evidence ${index + 1}`}
            >
              <h3>
                {claim
                  ? date(claim.value)
                  : replay && beat === 0
                    ? "September 30, 2026"
                    : "Slack decision evidence"}
                {replaced && (
                  <span className="mc-superseded-tag">Superseded</span>
                )}
              </h3>
              <p className="mc-quote">{e.text}</p>
            </button>
            <div className="mc-evidence-refs">
              <span className="mc-ref">
                {replay ? e.id : "E" + (index + 1)} · {short(e.id)}
              </span>
              {safeSource(e.url) && (
                <a href={safeSource(e.url)} target="_blank" rel="noreferrer">
                  Source <ExternalLink size={12} />
                </a>
              )}
            </div>
            {temporalBuilt && claim && (
              <div className="mc-timeline-build">
                <Clock3 size={13} />
                <strong>Temporal</strong>
                <span>
                  {replaced
                    ? "Earlier decision · retained in history"
                    : claim.supersedesEvidenceIds.length
                      ? "Explicit replacement → " + date(claim.value)
                      : "Dated claim · " + claim.statement}
                </span>
              </div>
            )}
            {authorityBuilt && (
              <div className="mc-timeline-build mc-authority-build">
                <ShieldCheck size={13} />
                <strong>Authority</strong>
                <span>
                  {owned
                    ? "Author matches configured owner"
                    : "Author is not a configured owner"}
                </span>
              </div>
            )}
            {skepticBuilt && supported.some((a) => a.role === "skeptic") && (
              <div className="mc-timeline-build mc-skeptic-build">
                <TriangleAlert size={13} />
                <strong>Skeptic</strong>
                <span>
                  {data?.progress?.followup?.length ||
                  data?.plan?.followup.length
                    ? "Replacement checked against original evidence"
                    : "Supported with concern · compare after commit"}
                </span>
              </div>
            )}
          </article>
        );
      })}
      {displayed.length < evidence.length && (
        <p className="mc-small">
          Latest 12 of {evidence.length} evidence records. Inspect all sources
          in Technical details.
        </p>
      )}
    </div>
  );
}

export function AgentCards({
  data,
  selected,
  onSelect,
  onInspect,
}: {
  data?: MissionData;
  selected: string;
  onSelect: (id: string) => void;
  onInspect: () => void;
}) {
  const events = data?.progress?.events ?? [];
  const initial = data?.progress?.initial ?? data?.plan?.assessments ?? [];
  const followup = data?.progress?.followup ?? data?.plan?.followup ?? [];
  return (
    <aside className="mc-agents">
      <p className="mc-rail-label">
        ASSESSMENT TEAM <span>03</span>
      </p>
      {ROLES.map((role) => {
        const Icon = icons[role];
        const a =
          followup.find((a) => a.role === role) ??
          initial.find((a) => a.role === role);
        const last = events.filter((e) => e.role === role).at(-1);
        const following = last?.round === "followup" && !followup.length;
        const state = following
          ? "Follow-up"
          : a
            ? "Committed"
            : last?.kind === "assessment_sealed"
              ? "Sealed"
              : last
                ? "Assessing"
                : "Ready";
        const failed = data?.progress?.state === "failed" && !a;
        return (
          <section
            key={role}
            className={`mc-agent ${selected && a?.supported.includes(selected) ? "mc-linked" : ""} ${state === "Assessing" || following ? "mc-agent-working" : ""}`}
          >
            <div className="mc-card-top">
              <span className="mc-agent-icon">
                <Icon size={18} />
              </span>
              <h3>{role[0].toUpperCase() + role.slice(1)}</h3>
              <span className="mc-agent-state">
                {failed ? "Incomplete" : state}
              </span>
            </div>
            <p>
              {a?.explanation ??
                (state === "Sealed"
                  ? "Assessment finished. Its conclusion stays sealed until initial assessments are committed."
                  : prompts[role])}
            </p>
            {a ? (
              <>
                <div className="mc-confidence">
                  <span>
                    Confidence{" "}
                    <strong>{Math.round(a.confidence * 100)}%</strong>
                  </span>
                  <button onClick={onInspect}>
                    Inspect <ChevronRight size={12} />
                  </button>
                </div>
                <div className="mc-agent-meter">
                  <span style={{ width: `${a.confidence * 100}%` }} />
                </div>
                <div className="mc-agent-refs">
                  {a.supported.map((id) => (
                    <button
                      key={id}
                      onClick={() => onSelect(selected === id ? "" : id)}
                    >
                      {short(id)}
                    </button>
                  ))}
                </div>
                {a.concerns.length > 0 && (
                  <div className="mc-concern">{a.concerns[0]}</div>
                )}
              </>
            ) : (
              <>
                <div className="mc-agent-meter">
                  <span
                    className={state === "Assessing" ? "mc-meter-working" : ""}
                    style={{ width: state === "Sealed" ? "100%" : "0%" }}
                  />
                </div>
                <span className="mc-agent-note">
                  {state === "Sealed"
                    ? "Waiting at commit barrier"
                    : "Independent context · shared evidence"}
                </span>
              </>
            )}
          </section>
        );
      })}
    </aside>
  );
}

export function ChangePreview({
  data,
  verify = false,
}: {
  data: MissionData;
  verify?: boolean;
}) {
  const ops = operations(data);
  return (
    <div className="mc-changes">
      {ops.map((op) => (
        <section
          key={op.action.id}
          className={"mc-change " + (op.verified ? "mc-change-verified" : "")}
        >
          <div className="mc-change-heading">
            <span>
              {op.action.provider === "calendar" ? (
                <CalendarDays size={18} />
              ) : (
                <GitCompareArrows size={18} />
              )}{" "}
              {op.action.provider === "calendar"
                ? "Google Calendar"
                : "Jira release"}
            </span>
            <span className={op.verified ? "mc-verified-badge" : "mc-op-state"}>
              {op.verified && <CheckCircle2 size={13} />}{" "}
              {op.verified ? "Verified" : op.state}
            </span>
          </div>
          {op.rows.map((row) => (
            <div className="mc-change-row" key={row.field}>
              <code>{row.field}</code>
              <span className="mc-before">{display(row.before)}</span>
              <ArrowRight size={14} />
              <strong>{display(row.value)}</strong>
              {verify && (
                <span
                  className={
                    row.observed === row.value && op.verified
                      ? "mc-green"
                      : "mc-readback"
                  }
                >
                  ↳ {display(row.observed)}
                </span>
              )}
            </div>
          ))}
          <p>
            {op.action.provider === "calendar"
              ? "All-day end is exclusive. Title and unrelated fields are preserved."
              : "Release name and unreleased status are preserved."}
          </p>
          {op.effect?.error && <p className="mc-amber">{op.effect.error}</p>}
          {op.effect?.reference?.recovered && (
            <p className="mc-green">
              Recovered by reread · no duplicate write · {op.effect.attempts}{" "}
              attempt
            </p>
          )}
          {verify && (
            <div className="mc-small">Readback: {stamp(op.observedAt)}</div>
          )}
        </section>
      ))}
    </div>
  );
}

export function Adapt({ data }: { data: MissionData }) {
  const calendar = data.run?.observations?.calendar ?? data.snapshot?.calendar;
  const effective = calendar?.reminders?.useDefault
    ? data.snapshot?.defaults
    : calendar?.reminders?.overrides;
  return (
    <div className="mc-adapt">
      <div>
        <Bell size={20} />
        <h3>Reminders follow reality</h3>
        <p>
          {effective?.length
            ? effective
                .map((r: any) => `${r.minutes}-minute ${r.method}`)
                .join(", ") +
              " setting retained. Relative offsets follow the milestone’s new date."
            : "No effective reminder offset was returned. No additional alert was created."}
        </p>
        <span>Settings are distinct from device delivery.</span>
      </div>
      <div>
        <BookOpen size={20} />
        <h3>Preparation stays explicit</h3>
        <p>
          {data.entity.issueKey
            ? `Linked issue: ${data.entity.issueKey}. Review its current status in Adapt before scheduling preparation.`
            : "No preparation issue is linked to this launch. Link one before creating a reminder or preparation block."}
        </p>
        <span>Jira task status and deadlines are unchanged.</span>
      </div>
      <div>
        <ShieldCheck size={20} />
        <h3>Communicate with control</h3>
        <p>
          A factual update can describe verified results. Audience checks and a
          separate reviewed send are required.
        </p>
        <span>No message is sent by this walkthrough.</span>
      </div>
    </div>
  );
}
