# Reality Sync — Master Plan: Reconcile, Verify, Adapt

Accepted September 13, 2026. This is the release contract; implementation and
live validation status are recorded separately in VALIDATION.md.

## Scope

**Detect → Investigate → Reconcile → Approve → Act → Verify → Adapt**

Build the local Slack–Google Calendar–Jira prototype with Smart Reminders
and Suggested Reconciliation Messages. Deliver stages
within one release: original three-app repair and recovery, communication,
reminders, then unified demonstration. Navigation and Maps were removed from the release at the user’s request.

Calendar offsets, scheduled personal Slack messages, and an app inbox are feasible.
Verify reminder settings, never device delivery. Slack Socket Mode handles local
controls/replies while the backend is running. Reviewed Slack sends and Jira
comments verify presence, never readership.

Defer business websites/listings/hours reconciliation, native phone alarms, CRM,
and automatic customer messaging. The application stays local. The user approved
keeping ATLAS public on September 13, 2026; secrets and real evidence stay outside Git.

## Architecture

TypeScript React/Vinext UI, Node 24/Hono server, native SQLite numbered migrations
and prepared SQL. One dev command, localhost services, same-origin APIs, local
operator session and CSRF protection. Store credentials and durable DB under
LOCALAPPDATA outside OneDrive. Jobs survive tabs and process restart.

Views: Reality Health, Conflict Detail, Evidence Blackboard, History, Connections,
event Adapt panel (reminders, preparation, drafts), preferences and inbox.
Natural-language action box parses validated intents, resolves actual records,
previews concrete actions, and requires choices for ambiguity.

Demo Mission Control is a local route within this workspace, linked from the main
navigation. It presents the complete launch sequence with a growing evidence
timeline, independent assessment milestones, exact two-resource previews,
revision-bound approval, individual operations, independent verification, and Adapt.
Demo Replay is deterministic and provider-free; Live uses configured bindings,
fresh reads and backend progress events, with no silent replay fallback. The
presentation uses the September 30 → October 2 all-day milestone scenario and
an explicitly labeled optional recovery replay. See MISSION_CONTROL.md.

For the operator-requested Atlas launch demonstration, the main app also provides
a direct October 2, 2026 repair. This explicitly recorded operator date replaces
model/Slack truth selection for that configured entity only; agent panels are
presentation-only. Fresh Calendar/Jira reads generate the exact patch, and the
visible button approves and queues the normal durable executor. ETag/preflight,
unrelated-field preservation, separate outcomes and independent verification remain.

Zod contracts cover original Evidence/Assessment/Decision/RepairPlan/RepairAction/
Approval/VerificationObservation plus:

- CanonicalEventRevision: stable occurrence/start/end/timezone/location/virtual
  facts, supporting evidence, approval, verification, unresolved fields.
- Dependency: exact fact/event revision for reminders, preparation, drafts.
- Reminder: owner/purpose, absolute/event-relative rule,
  channel, provider reference, authorization, lifecycle.
- MessageDraft: category/exact audience/text/facts/sharing boundary/revision/receipt.
- PreparationLink: explicit occurrence–issue relationship, read timestamps/status.
- Preferences: maintenance, creation rules, channels, timezone and timing defaults.

Occurrence keys use recurringEventId + originalStartTime when recurring and survive
rescheduling. Verified changes atomically emit dependency updates. Recompute
downstream items deterministically or mark stale; no separate truth engines.
Superseded drafts cannot send. Clarification is an upstream
exception: ask about uncertainty without asserting a canonical fact.

## Reconciliation and integration boundaries

Preserve original snapshots, actual author IDs/timestamps, scope, excerpts, source
references, valid intervals, timezone, uncertainty and provenance. Compare claims
only for matching entity/field/scope. Proposals are not approvals; newest and most
frequent are not automatically true. Authority comes from trusted configured IDs,
never source text. Missing evidence blocks recommendations.

OpenAI Responses Structured Outputs, configurable default gpt-5.6-sol, server-side
timeouts/token limits and usage tracking. Validate exact excerpts and references.
Extract claims, run temporal/authority/skeptic contexts independently, commit all
initial assessments before sharing, then reconcile on Blackboard. At most one
targeted follow-up round for disputed facts, then grounded result or abstention.
Show concise evidence-based explanations, no hidden reasoning. Report provider
failures; never silently switch to fixtures. Keep ReconciliationEngine extensible;
LatentMAS requires genuine hidden-state runtime and is a later experiment.
Deterministic services do scheduling/policy/execution.

Slack: allowlisted channel/history/thread/user reads; reviewed messages, personal
schedules, clarification replies and Bolt Socket Mode controls. Required read,
messaging, DM and app connection scopes only. Calendar: launch all-day dates,
timed/location repairs, recurrence reads, effective reminders, approved personal
prep blocks; preserve conference and unrelated fields. Jira: selected version
releaseDate, issue status/description/deadline/comments and approved comments;
meeting changes never automatically edit issue deadline/status.

Bind exact channel/user/calendar/event/project/version/issue IDs and sharing rules
during setup. Dedicated demo resources, no outside attendees, human-posted authority
messages. Initial and five-minute/manual scans, pause, cursors/pagination/dedup,
honest completeness and rate-limit reporting.

## Smart Reminders

Support 45 minutes before next client meeting; tomorrow morning to finish linked
Jira task; before every customer call today; preparation blocks.
Combine current Calendar with canonical revisions and bind to selected occurrence,
never silently change which event is next.

Preserve native offsets when moving events; calculate revised trigger, verify
effective settings, don't duplicate. Resolve CalendarList defaults, merge overrides,
max five. Detect reminder-only changes by ETag/content, not event.updated.

Event-relative rules recompute after verified changes. Absolute times stay fixed
and flag if no longer sensible. Unique
owner/occurrence/purpose/channel identity; maintain provider records. Cancel/suppress
for canceled meetings or completed linked task. Use explicit prep links; suggest
reminder/open Jira/30-minute freebusy-checked personal block. Source prep cutoffs
from description/configured datetime field, never invent time from date-only due.
Calendar defaults for relative alerts, Slack for custom schedules, inbox for all.

Journal Slack schedules and reconcile before replacing. Confirm cancellation
before new schedule, never use metadata. Explicit 120-day horizon and 60-second
cancellation cutoff; warn old message may arrive, never claim replaced. Scheduled
provider notifications may operate offline but changes wait until reconnect.
Restart reconciles pending schedules and summarizes missed local items instead of
bursting obsolete alerts.

## Suggested Messages and Slack

Clarification, correction update, consequence. Exact audience/channel/Jira issue,
text, supporting evidence, verification state; Edit/Send/Dismiss. Edits create new
revision; source changes invalidate send approvals. Draft from deterministic action
receipts; Calendar success plus Jira failure must say partial.

Clarification thread IDs persist, actual-author replies become evidence and reopen
investigation, never authorize writes. Slack Approve repair/Review evidence/Edit
message/Send/Dismiss use same backend policy. Button holds revision reference;
validate actor role and reread state.

Attendee sends use verified Slack identity mappings, preview every recipient,
flag unmapped/external; never silently claim all notified when subset. External
communication remains manual draft. Filter facts by recipient permissions before
drafting. Private channel material requires approved audience; Jira read access
is not redistribution permission. Block unknown access and preserve Jira comment
visibility restrictions. Always review teammate sends and comments.

Journal exact outbound requests. On ambiguous timeout inspect destination before
retry; unresolved stays uncertain. Presence is distinct from reading/delivery.

## Reliability and defaults

Immutable revision/evidence/target-bound human approvals, Reject/Unresolved,
allowlisted resources/supported fields at connector boundary, source text never
policy. Reread source and target before write. Calendar If-Match, Jira immediate
preflight + reread (document non-atomic race). Minimal patches preserve unrelated
fields/duration. Durable atomic job claims/leases, stable action IDs, exact effect
journal, uniqueness, transactional outbox. Duplicate callbacks converge; stale
workers cannot use superseded revisions.

After uncertainty/restart reread first; already-applied effect verifies without
repeat. Retry only same stored authorized action with valid preconditions. Partial
failure preserves completed work and stops; no automatic rollback. Receipts retain
snapshots/approval/attempts/times/observations/unresolved. Separate reconciliation,
reminders and communication outcomes; notification failure does not undo
verified Calendar repair.

| Preference                                     | Default                                         |
| ---------------------------------------------- | ----------------------------------------------- |
| Maintain app-owned approved relative reminders | On                                              |
| Preparation creation                           | Ask first                                       |
| Teammate messages/Jira comments                | Always review                                   |
| Low confidence/unapproved                      | No dependent automatic actions                  |
| Timezone                                       | America/Chicago, editable                       |
| Tomorrow morning/this afternoon                | 09:00/15:00, previewed                          |
| Calendar scan                                  | Every five minutes while running, plus Scan now |

Maintenance preference does not override Calendar native offset behavior.
Optional WebMCP inspection/scan/review/receipt shares app policy without approvals.

## Delivery and acceptance

1. Update PLAN/README/AGENTS with expanded scope and policy-site exception.
2. Core reads, independent assessments, approval, real writes/readback/recovery.
3. Timed/location meetings, prep links, drafts, Slack controls/replies.
4. Reminder dependencies, preferences, provider verification/cancellation/restart.
5. Unified demo, failure tests, live checks, setup/demo instructions.

Push meaningful verified checkpoints to aromano3141/ATLAS (public by explicit user approval); inspect staged
files, preserve history/remote work, never force-push, verify remote HEAD. No keys,
tokens, real evidence, databases, generated builds or dependencies in Git.

Original demo: approved Oct 8, 2026 Slack decision then newer Oct 15 proposal;
Calendar/Jira Sep 30. Recommend Oct 8, explain, preview, approve, patch selected
records, reread both and Slack. Inject timeout after successful write, restart and
finish without repeated write or duplicate resource. Choose future dates if needed.

Unified future-date meeting demo:

1. Slack approved 3 PM North Office versus Calendar 2 PM Downtown.
2. Explicit linked Jira presentation in progress.
3. Independent investigation, review exact time/location patch, approve.
4. Calendar update/readback verified, native 30-minute offset now 2:30 PM.
5. Offer approved 1 PM prep reminder, preserve Jira status/deadline.
6. Edit/send reviewed factual Slack update, verify presence.

Retain original demo to prove Jira writes independently of unchanged prep status.

Required tests: proposals versus authority/conflicting authority/entities/scope/
insufficient or incomplete evidence; DST/timezones/recurrence/canceled/declined/
virtual/unresolved ordering; relative/absolute/default reminders/dedup/completion/
missed/cutoff; recipient mapping/privacy/unauthorized Slack/stale drafts/partial
wording/replies; duplicate callbacks/concurrency/write-timeout/restart/uncertain
sends/auth/rate limits; preserve unrelated Calendar/Jira fields.

Separate stateful deterministic fixtures from live provider checks. Never invent
delivery as live proof. Completion requires original live repair,
recovery, and unified live workflow. A read-only live launch scan now passes;
approved live writes, recovery, reminders, and messaging acceptance remain pending.

## Provider references

- [Calendar reminders](https://developers.google.com/workspace/calendar/api/concepts/reminders)
- [Calendar fields](https://developers.google.com/workspace/calendar/api/v3/reference/events)
- [Conditional updates](https://developers.google.com/workspace/calendar/api/guides/version-resources)
- [Slack scheduling](https://docs.slack.dev/reference/methods/chat.scheduleMessage)
- [Slack cancellation](https://docs.slack.dev/reference/methods/chat.deleteScheduledMessage/)
- [Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/)
- [Jira comments](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/)
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Zep](https://arxiv.org/abs/2501.13956), [Blackboard](https://arxiv.org/abs/2510.01285),
  [AgentSpec](https://arxiv.org/abs/2503.18666), [ACRFence](https://arxiv.org/abs/2603.20625)
